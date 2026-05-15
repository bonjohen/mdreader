window.MdReader = window.MdReader || {};

window.MdReader.ui = (function () {
  var elements = {
    editor: document.getElementById("editor"),
    preview: document.getElementById("preview"),
    statusEl: document.getElementById("status"),
    pasteBtn: document.getElementById("pasteBtn"),
    loadBtn: document.getElementById("loadBtn"),
    skipBackBtn: document.getElementById("skipBackBtn"),
    skipFwdBtn: document.getElementById("skipFwdBtn"),
    editBtn: document.getElementById("editBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
    speakBtn: document.getElementById("speakBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    resumeBtn: document.getElementById("resumeBtn"),
    stopBtn: document.getElementById("stopBtn"),
    voiceSelect: document.getElementById("voiceSelect"),
    rateInput: document.getElementById("rateInput"),
    rateValue: document.getElementById("rateValue"),
    playlistPanel: document.getElementById("playlistPanel"),
    playlistList: document.getElementById("playlistList"),
    playlistCloseBtn: document.getElementById("playlistCloseBtn"),
    editorTitle: document.getElementById("editorTitle"),
    progressFill: document.getElementById("progressFill"),
    bookDialog: document.getElementById("bookDialog"),
    bookDialogList: document.getElementById("bookDialogList"),
    savedBtn: document.getElementById("savedBtn"),
    savedList: document.getElementById("savedList"),
    tabPlaylist: document.getElementById("tabPlaylist"),
    tabSaved: document.getElementById("tabSaved"),
  };

  function showBookDialog(books, onPick) {
    elements.bookDialogList.innerHTML = "";
    books.forEach(function (book) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "book-dialog-item";
      btn.textContent = book.title;
      btn.addEventListener("click", function () {
        elements.bookDialog.close();
        onPick(book);
      });
      elements.bookDialogList.appendChild(btn);
    });
    if (typeof elements.bookDialog.showModal === "function") {
      elements.bookDialog.showModal();
    } else {
      elements.bookDialog.setAttribute("open", "");
    }
  }

  function setStatus(text) {
    elements.statusEl.textContent = text;
  }

  function setRateDisplay(value) {
    elements.rateValue.textContent = Number(value).toFixed(1);
  }

  function setProgress(fraction) {
    elements.progressFill.style.width = Math.round(fraction * 100) + "%";
  }

  function setEditorTitle(text) {
    elements.editorTitle.textContent = text;
  }

  // --- Playlist UI ---

  function showPlaylist(files, onItemClick) {
    elements.playlistList.innerHTML = "";
    files.forEach(function (name, index) {
      var item = document.createElement("div");
      item.className = "playlist-item";
      item.setAttribute("tabindex", "0");
      item.innerHTML =
        '<span class="file-icon">&#9834;</span>' +
        '<span class="file-name">' + escapeText(name) + '</span>';
      item.addEventListener("click", function () {
        onItemClick(index);
      });
      item.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onItemClick(index);
        }
      });
      elements.playlistList.appendChild(item);
    });
    elements.playlistPanel.classList.remove("hidden");
  }

  function highlightPlaylistItem(index) {
    var items = elements.playlistList.querySelectorAll(".playlist-item");
    items.forEach(function (item, i) {
      item.classList.toggle("active", i === index);
    });
  }

  function togglePlaylistPanel() {
    elements.playlistPanel.classList.toggle("hidden");
  }

  function hidePlaylistPanel() {
    elements.playlistPanel.classList.add("hidden");
  }

  function escapeText(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // --- Scroll preview to a character offset in its innerText ---
  // Used by TTS to keep the currently spoken chunk visible.
  // Walks text nodes via TreeWalker, accumulating character counts that match
  // how innerText is built (block boundaries produce newlines).

  var BLOCK_TAGS = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DETAILS|DIALOG|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HGROUP|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|SUMMARY|TABLE|UL)$/;

  function scrollPreviewToOffset(charOffset) {
    var preview = elements.preview;
    if (!preview) return;

    var walker = document.createTreeWalker(preview, NodeFilter.SHOW_ALL, null, false);
    var accumulated = 0;
    var node;
    var prevWasBlock = false;

    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (BLOCK_TAGS.test(node.tagName)) {
          if (accumulated > 0 && !prevWasBlock) accumulated++; // newline for block boundary
          prevWasBlock = true;
        }
      } else if (node.nodeType === Node.TEXT_NODE) {
        prevWasBlock = false;
        var len = node.textContent.length;
        if (accumulated + len > charOffset) {
          var el = node.parentElement;
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        accumulated += len;
      }
    }
  }

  // --- Saved items UI ---

  function showSavedItems(items, callbacks) {
    elements.savedList.innerHTML = "";
    if (!items.length) {
      elements.savedList.innerHTML = '<div class="saved-empty">No saved items.</div>';
      return;
    }
    items.forEach(function (entry) {
      var row = document.createElement("div");
      row.className = "saved-item";
      row.innerHTML =
        '<div class="saved-info">' +
          '<span class="saved-name">' + escapeText(entry.name) + '</span>' +
          '<span class="saved-time">' + escapeText(relativeTime(entry.ts)) + '</span>' +
        '</div>' +
        '<div class="saved-actions">' +
          '<button class="saved-action" data-action="open" title="Open">Open</button>' +
          '<button class="saved-action" data-action="download" title="Save to file">Save</button>' +
          '<button class="saved-action" data-action="delete" title="Delete">Del</button>' +
        '</div>';
      row.addEventListener("click", function (e) {
        var action = e.target.getAttribute("data-action");
        if (action === "open") callbacks.onOpen(entry);
        else if (action === "delete") callbacks.onDelete(entry);
        else if (action === "download") callbacks.onDownload(entry);
      });
      elements.savedList.appendChild(row);
    });
  }

  function relativeTime(isoString) {
    var diff = Date.now() - new Date(isoString).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    var days = Math.floor(hrs / 24);
    return days + "d ago";
  }

  function switchPanelTab(tabName) {
    if (tabName === "saved") {
      elements.playlistList.classList.add("hidden");
      elements.savedList.classList.remove("hidden");
      elements.tabPlaylist.classList.remove("active");
      elements.tabSaved.classList.add("active");
    } else {
      elements.savedList.classList.add("hidden");
      elements.playlistList.classList.remove("hidden");
      elements.tabSaved.classList.remove("active");
      elements.tabPlaylist.classList.add("active");
    }
  }

  return {
    elements,
    setStatus,
    setRateDisplay,
    setProgress,
    setEditorTitle,
    showPlaylist,
    highlightPlaylistItem,
    togglePlaylistPanel,
    hidePlaylistPanel,
    showBookDialog,
    toggleEditMode,
    setTtsState,
    isEditMode,
    scrollPreviewToOffset,
    showSavedItems,
    switchPanelTab,
  };

  function toggleEditMode() {
    var mainEl = document.querySelector("main");
    var editing = mainEl.classList.toggle("editing");
    if (editing) {
      elements.editor.removeAttribute("hidden");
      elements.editBtn.textContent = "Done";
    } else {
      elements.editor.setAttribute("hidden", "");
      elements.editBtn.textContent = "Edit";
    }
  }

  function setTtsState(state) {
    var header = document.querySelector("header");
    header.classList.remove("tts-idle", "tts-playing", "tts-paused");
    header.classList.add("tts-" + state);
  }

  function isEditMode() {
    return document.querySelector("main").classList.contains("editing");
  }
})();
