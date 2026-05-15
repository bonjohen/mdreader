window.MdReader = window.MdReader || {};

(function () {
  var ui = window.MdReader.ui;
  var md = window.MdReader.markdown;
  var tts = window.MdReader.tts;
  var files = window.MdReader.files;
  var el = ui.elements;

  // Editor -> live preview
  el.editor.addEventListener("input", md.renderToPreview);

  // File operations
  el.pasteBtn.addEventListener("click", files.pasteFromClipboard);
  el.loadBtn.addEventListener("click", files.openBookPicker);

  // Skip controls
  el.skipBackBtn.addEventListener("click", tts.skipBack);
  el.skipFwdBtn.addEventListener("click", tts.skipForward);

  // Edit / Download
  el.editBtn.addEventListener("click", ui.toggleEditMode);
  el.downloadBtn.addEventListener("click", function () {
    files.downloadMarkdown();
    if (ui.isEditMode()) ui.toggleEditMode();
  });

  // Playlist sidebar close
  el.playlistCloseBtn.addEventListener("click", ui.hidePlaylistPanel);

  // Saved items panel
  function refreshSavedList() {
    ui.showSavedItems(files.getSavedItems(), {
      onOpen: function (entry) {
        el.editor.value = entry.text;
        md.renderToPreview();
        ui.setEditorTitle(entry.name);
        ui.setStatus("Opened: " + entry.name);
      },
      onDelete: function (entry) {
        files.deleteItem(entry.id);
        refreshSavedList();
        ui.setStatus("Deleted: " + entry.name);
      },
      onDownload: function (entry) {
        files.downloadItem(entry);
      },
    });
  }
  el.savedBtn.addEventListener("click", function () {
    var panel = el.playlistPanel;
    if (!panel.classList.contains("hidden")) {
      // Panel already open — toggle it off if on saved tab, switch if on playlist tab
      if (el.tabSaved.classList.contains("active")) {
        ui.hidePlaylistPanel();
        return;
      }
    }
    panel.classList.remove("hidden");
    ui.switchPanelTab("saved");
    refreshSavedList();
  });
  el.tabPlaylist.addEventListener("click", function () { ui.switchPanelTab("playlist"); });
  el.tabSaved.addEventListener("click", function () {
    ui.switchPanelTab("saved");
    refreshSavedList();
  });

  // TTS controls
  el.speakBtn.addEventListener("click", function () {
    tts.speak();
    ui.setTtsState("playing");
  });
  el.pauseBtn.addEventListener("click", function () {
    tts.pauseSpeech();
    ui.setTtsState("paused");
  });
  el.resumeBtn.addEventListener("click", function () {
    tts.resumeSpeech();
    ui.setTtsState("playing");
  });
  el.stopBtn.addEventListener("click", function () {
    tts.stopSpeech();
    ui.setTtsState("idle");
  });

  // Rate slider
  el.rateInput.addEventListener("input", function () {
    ui.setRateDisplay(el.rateInput.value);
    tts.savePreferences();
  });

  // Voice selection — save and immediately apply if speaking
  el.voiceSelect.addEventListener("change", function () {
    tts.savePreferences();
    tts.applyVoiceChange();
  });

  // Auto-advance: when TTS finishes a file and auto-play is on, load next file and speak.
  // Chained on the load promise so we never speak stale editor content (race that
  // caused the same chapter to replay when fetch was slower than the fixed delay).
  tts.setOnFinished(function () {
    ui.setProgress(1);
    if (files.hasNext()) {
      files.advanceToNext().then(function (loaded) {
        if (loaded) tts.speak();
      });
    } else {
      ui.setTtsState("idle");
    }
  });

  // Update progress bar during speech
  setInterval(function () {
    if (tts.isSpeaking()) {
      ui.setProgress(tts.getProgress());
    }
  }, 500);

  // Voice loading
  window.speechSynthesis.onvoiceschanged = tts.loadVoices;
  tts.loadVoices();


  // Keyboard shortcuts
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      files.downloadMarkdown();
      if (ui.isEditMode()) ui.toggleEditMode();
    }
  });

  // Initial render
  md.renderToPreview();
})();
