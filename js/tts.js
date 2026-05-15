window.MdReader = window.MdReader || {};

window.MdReader.tts = (function () {
  var voices = [];
  var chunkQueue = [];
  var chunkMeta = []; // [{text, offset}] — tracks each chunk's position in original text
  var chunkIndex = 0;
  var totalChunks = 0;
  var sectionOffsets = []; // precomputed paragraph/heading boundaries for skip
  var currentUtterance = null;
  var keepAliveTimer = null;
  var speaking = false;
  var paused = false;
  var onFinishedCallback = null;
  var wakeLock = null;

  var PREMIUM_PATTERN = /Natural|Neural|Online|Premium|Enhanced/i;
  // Android Chrome has different TTS quirks than desktop Chrome:
  //  - The pause/resume keep-alive hack (a desktop-Chrome workaround for the
  //    15s cutoff) actively breaks Android: pause() can permanently stop the
  //    utterance and resume() may not restart it.
  //  - Calling speak() synchronously inside onend is racy on Android; the
  //    engine needs a small delay before accepting the next utterance.
  //  - The desktop 15s cutoff doesn't apply, so smaller chunks just create
  //    more transition points where Android can drop speech.
  var IS_ANDROID = /Android/i.test(navigator.userAgent);
  var CHUNK_MAX = IS_ANDROID ? 500 : 200;
  var NEXT_CHUNK_DELAY_MS = IS_ANDROID ? 80 : 0;

  // --- Voice management ---

  function isEnglish(voice) {
    return voice.lang.startsWith("en");
  }

  function isPremium(voice) {
    return PREMIUM_PATTERN.test(voice.name);
  }

  function loadVoices() {
    var ui = window.MdReader.ui;
    voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;

    var savedVoice = localStorage.getItem("mdreader-voice");
    ui.elements.voiceSelect.innerHTML = "";

    // Separate into premium and standard
    var premium = [];
    var standard = [];
    voices.forEach(function (voice, index) {
      var entry = { voice: voice, index: index };
      if (isPremium(voice)) {
        premium.push(entry);
      } else {
        standard.push(entry);
      }
    });

    // Sort: English first within each group, then alphabetical
    function sortVoices(arr) {
      arr.sort(function (a, b) {
        var aEn = isEnglish(a.voice) ? 0 : 1;
        var bEn = isEnglish(b.voice) ? 0 : 1;
        if (aEn !== bEn) return aEn - bEn;
        return a.voice.name.localeCompare(b.voice.name);
      });
    }
    sortVoices(premium);
    sortVoices(standard);

    function addGroup(label, entries) {
      if (!entries.length) return;
      var group = document.createElement("optgroup");
      group.label = label;
      entries.forEach(function (entry) {
        var opt = document.createElement("option");
        opt.value = String(entry.index);
        opt.textContent = entry.voice.name + " (" + entry.voice.lang + ")";
        group.appendChild(opt);
      });
      ui.elements.voiceSelect.appendChild(group);
    }

    addGroup("High Quality Voices", premium);
    addGroup("Standard Voices", standard);

    // Restore saved voice or auto-select best
    var restored = false;
    if (savedVoice) {
      for (var i = 0; i < voices.length; i++) {
        if (voices[i].name === savedVoice) {
          ui.elements.voiceSelect.value = String(i);
          restored = true;
          break;
        }
      }
    }
    if (!restored) {
      // Auto-select: prefer en-GB, then any premium English, then any premium,
      // then any English, then anything.
      function isEnGB(e) { return /^en[-_]GB$/i.test(e.voice.lang); }
      var best =
        premium.find(isEnGB) ||
        standard.find(isEnGB) ||
        premium.find(function (e) { return isEnglish(e.voice); }) ||
        premium[0] ||
        standard.find(function (e) { return isEnglish(e.voice); }) ||
        standard[0];
      if (best) ui.elements.voiceSelect.value = String(best.index);
    }

    // Restore saved rate
    var savedRate = localStorage.getItem("mdreader-rate");
    if (savedRate) {
      ui.elements.rateInput.value = savedRate;
      ui.setRateDisplay(savedRate);
    }
  }

  function savePreferences() {
    var ui = window.MdReader.ui;
    var voice = voices[Number(ui.elements.voiceSelect.value)];
    if (voice) localStorage.setItem("mdreader-voice", voice.name);
    localStorage.setItem("mdreader-rate", ui.elements.rateInput.value);
  }

  // --- Text chunking and section boundaries ---

  // Splits text at blank lines to produce skip-navigation anchor points.
  // Works for any content (markdown with headings, plain pasted text, etc.)
  // because it operates on the readable text string, not the DOM.
  function computeSections(text) {
    var offsets = [{ charOffset: 0 }];
    var re = /\n{2,}/g;
    var match;
    while ((match = re.exec(text)) !== null) {
      var pos = match.index + match[0].length;
      if (pos < text.length) {
        offsets.push({ charOffset: pos });
      }
    }
    return offsets;
  }

  // Splits text into chunks for TTS, tracking each chunk's start offset in the
  // original text.  Returns [{text, offset}].  The offset is the character
  // position in `text` where that chunk begins, so skip-navigation can map
  // between section boundaries and chunk indices without drift.
  function chunkTextWithOffsets(text) {
    if (text.length <= CHUNK_MAX) return [{ text: text, offset: 0 }];

    // Split on sentence boundaries while preserving each sentence's position
    // in the original text.
    var sentenceRe = /(?<=[.!?])\s+/g;
    var sentences = []; // [{text, offset}]
    var lastEnd = 0;
    var m;
    while ((m = sentenceRe.exec(text)) !== null) {
      sentences.push({ text: text.slice(lastEnd, m.index), offset: lastEnd });
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd < text.length) {
      sentences.push({ text: text.slice(lastEnd), offset: lastEnd });
    }

    var result = [];
    var current = "";
    var currentOffset = sentences.length ? sentences[0].offset : 0;

    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i];
      if (current.length + s.text.length + 1 <= CHUNK_MAX) {
        current = current ? current + " " + s.text : s.text;
        if (current === s.text) currentOffset = s.offset;
      } else {
        if (current) result.push({ text: current, offset: currentOffset });
        if (s.text.length > CHUNK_MAX) {
          // Sub-split oversized sentence at commas
          var commaRe = /,\s*/g;
          var parts = []; // [{text, offset}]
          var partStart = 0;
          var cm;
          while ((cm = commaRe.exec(s.text)) !== null) {
            parts.push({ text: s.text.slice(partStart, cm.index), offset: s.offset + partStart });
            partStart = cm.index + cm[0].length;
          }
          if (partStart < s.text.length) {
            parts.push({ text: s.text.slice(partStart), offset: s.offset + partStart });
          }

          var sub = "";
          var subOffset = parts.length ? parts[0].offset : s.offset;
          for (var j = 0; j < parts.length; j++) {
            if (sub.length + parts[j].text.length + 2 <= CHUNK_MAX) {
              sub = sub ? sub + ", " + parts[j].text : parts[j].text;
              if (sub === parts[j].text) subOffset = parts[j].offset;
            } else {
              if (sub) result.push({ text: sub, offset: subOffset });
              sub = parts[j].text;
              subOffset = parts[j].offset;
            }
          }
          current = sub;
          currentOffset = subOffset;
        } else {
          current = s.text;
          currentOffset = s.offset;
        }
      }
    }
    if (current) result.push({ text: current, offset: currentOffset });
    return result;
  }

  // --- Screen wake lock ---
  // Keeps the device screen from auto-locking while speech is playing.
  // Cannot prevent a manual power-button lock — that's a hard browser
  // limitation: when the screen is actually locked, the page is suspended
  // and Web Speech stops. Wake lock auto-releases on visibility change,
  // so we re-acquire when the page becomes visible again while speaking.

  function acquireWakeLock() {
    if (!("wakeLock" in navigator)) return;
    if (wakeLock) return;
    navigator.wakeLock
      .request("screen")
      .then(function (lock) {
        wakeLock = lock;
        lock.addEventListener("release", function () {
          if (wakeLock === lock) wakeLock = null;
        });
      })
      .catch(function () { /* ignored — wake lock is best-effort */ });
  }

  function releaseWakeLock() {
    if (!wakeLock) return;
    var lock = wakeLock;
    wakeLock = null;
    lock.release().catch(function () {});
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && speaking) {
      acquireWakeLock();
    }
  });

  // --- Chrome keep-alive workaround ---

  function startKeepAlive() {
    stopKeepAlive();
    // Android: skip the pause/resume hack — it permanently stops speech there.
    if (IS_ANDROID) return;
    keepAliveTimer = setInterval(function () {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);
  }

  function stopKeepAlive() {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  }

  // --- Speech control ---

  function getReadableText() {
    var ui = window.MdReader.ui;
    return ui.elements.preview.innerText.trim() || ui.elements.editor.value.trim();
  }

  function stopSpeech() {
    speaking = false;
    paused = false;
    window.speechSynthesis.cancel();
    stopKeepAlive();
    releaseWakeLock();
    chunkQueue = [];
    chunkMeta = [];
    sectionOffsets = [];
    chunkIndex = 0;
    totalChunks = 0;
    currentUtterance = null;
    window.MdReader.ui.setStatus("Speech stopped.");
  }

  function speakNextChunk() {
    var ui = window.MdReader.ui;

    if (chunkIndex >= chunkQueue.length) {
      stopKeepAlive();
      releaseWakeLock();
      speaking = false;
      ui.setStatus("Finished.");
      if (onFinishedCallback) onFinishedCallback();
      return;
    }

    var text = chunkQueue[chunkIndex];
    if (chunkMeta.length) {
      ui.scrollPreviewToOffset(chunkMeta[chunkIndex].offset);
    }
    var utterance = new SpeechSynthesisUtterance(text);

    var voice = voices[Number(ui.elements.voiceSelect.value)];
    if (voice) utterance.voice = voice;
    utterance.rate = parseFloat(ui.elements.rateInput.value);

    utterance.onstart = function () {
      ui.setStatus("Speaking... (" + (chunkIndex + 1) + "/" + totalChunks + ")");
    };
    utterance.onpause = function () {
      ui.setStatus("Paused. (" + (chunkIndex + 1) + "/" + totalChunks + ")");
    };
    utterance.onresume = function () {
      ui.setStatus("Resumed. (" + (chunkIndex + 1) + "/" + totalChunks + ")");
    };
    utterance.onend = function () {
      // Suppress advance if a pause cancelled us, or stopSpeech ran.
      if (paused || !speaking) return;
      chunkIndex++;
      if (NEXT_CHUNK_DELAY_MS > 0) {
        setTimeout(speakNextChunk, NEXT_CHUNK_DELAY_MS);
      } else {
        speakNextChunk();
      }
    };
    utterance.onerror = function (e) {
      if (e.error === "canceled" || e.error === "interrupted") return;
      if (paused || !speaking) return;
      ui.setStatus("Speech error: " + e.error);
      // Try next chunk on error
      chunkIndex++;
      if (NEXT_CHUNK_DELAY_MS > 0) {
        setTimeout(speakNextChunk, NEXT_CHUNK_DELAY_MS);
      } else {
        speakNextChunk();
      }
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function speak() {
    var ui = window.MdReader.ui;
    var text = getReadableText();
    if (!text) {
      ui.setStatus("Nothing to read.");
      return;
    }

    stopSpeech();
    savePreferences();

    chunkMeta = chunkTextWithOffsets(text);
    chunkQueue = chunkMeta.map(function (c) { return c.text; });
    sectionOffsets = computeSections(text);
    chunkIndex = 0;
    totalChunks = chunkQueue.length;
    speaking = true;
    paused = false;

    acquireWakeLock();
    startKeepAlive();
    speakNextChunk();
  }

  function pauseSpeech() {
    if (!speaking || paused) return;
    paused = true;
    var ui = window.MdReader.ui;
    if (IS_ANDROID) {
      // Android Chrome's pause() halts speech but resume() doesn't restart
      // it. Fake pause by cancelling — onerror sees "canceled" and bails
      // without advancing because `paused` is set. Resume re-speaks the
      // current chunk from its start.
      window.speechSynthesis.cancel();
      ui.setStatus("Paused. (" + (chunkIndex + 1) + "/" + totalChunks + ")");
    } else {
      stopKeepAlive();
      window.speechSynthesis.pause();
    }
  }

  function resumeSpeech() {
    if (!speaking || !paused) return;
    paused = false;
    if (IS_ANDROID) {
      // Re-speak the current chunk from the start (no way to know intra-
      // chunk position with Web Speech).
      speakNextChunk();
    } else {
      startKeepAlive();
      window.speechSynthesis.resume();
    }
  }

  function isSpeaking() {
    return speaking;
  }

  function setOnFinished(cb) {
    onFinishedCallback = cb;
  }

  function getProgress() {
    if (totalChunks === 0) return 0;
    return chunkIndex / totalChunks;
  }

  // --- Section skip ---

  function getSectionOffsets() {
    return sectionOffsets;
  }

  function currentCharOffset() {
    if (!chunkMeta.length || chunkIndex >= chunkMeta.length) return Infinity;
    return chunkMeta[chunkIndex].offset;
  }

  function chunkIndexForCharOffset(target) {
    for (var i = chunkMeta.length - 1; i >= 0; i--) {
      if (chunkMeta[i].offset <= target) return i;
    }
    return 0;
  }

  function skipForward() {
    var sections = getSectionOffsets();
    if (!sections.length) return;

    if (speaking) {
      var cur = currentCharOffset();
      var next = null;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].charOffset > cur) { next = sections[i]; break; }
      }
      if (!next) return; // already past last heading
      chunkIndex = chunkIndexForCharOffset(next.charOffset);
      window.speechSynthesis.cancel();
      paused = false;
      speakNextChunk();
    } else {
      scrollToNextHeading(1);
    }
  }

  function skipBack() {
    var sections = getSectionOffsets();
    if (!sections.length) return;

    if (speaking) {
      var cur = currentCharOffset();
      var prev = null;
      for (var i = sections.length - 1; i >= 0; i--) {
        if (sections[i].charOffset < cur - 10) { prev = sections[i]; break; }
      }
      if (!prev) prev = sections[0];
      chunkIndex = chunkIndexForCharOffset(prev.charOffset);
      window.speechSynthesis.cancel();
      paused = false;
      speakNextChunk();
    } else {
      scrollToNextHeading(-1);
    }
  }

  function scrollToNextHeading(direction) {
    var ui = window.MdReader.ui;
    var headings = ui.elements.preview.querySelectorAll("h1,h2,h3,h4,h5,h6");
    if (!headings.length) return;

    var scrollTop = ui.elements.preview.scrollTop;
    var found = null;

    if (direction > 0) {
      for (var i = 0; i < headings.length; i++) {
        if (headings[i].offsetTop > scrollTop + 10) { found = headings[i]; break; }
      }
    } else {
      for (var i = headings.length - 1; i >= 0; i--) {
        if (headings[i].offsetTop < scrollTop - 10) { found = headings[i]; break; }
      }
    }
    if (found) found.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Called when the user changes the voice mid-speech. Cancels the current
  // utterance and re-speaks from the same chunk so the new voice is heard
  // immediately rather than waiting for the next utterance boundary.
  function applyVoiceChange() {
    if (!speaking || paused) return;
    window.speechSynthesis.cancel();
    if (IS_ANDROID) {
      setTimeout(speakNextChunk, NEXT_CHUNK_DELAY_MS);
    } else {
      speakNextChunk();
    }
  }

  return {
    loadVoices,
    speak,
    stopSpeech,
    pauseSpeech,
    resumeSpeech,
    savePreferences,
    isSpeaking,
    setOnFinished,
    getProgress,
    skipForward,
    skipBack,
    applyVoiceChange,
  };
})();
