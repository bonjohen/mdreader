window.MdReader = window.MdReader || {};

window.MdReader.files = (function () {
  var playlist = [];       // Array of { name, load: () => Promise<string> }
  var currentIndex = -1;
  var FILE_PATTERN = /\.(md|markdown|txt|text)$/i;

  function handleFileSelect(event) {
    var file = event.target.files[0];
    if (!file) return;

    var ui = window.MdReader.ui;
    file
      .text()
      .then(function (text) {
        ui.elements.editor.value = text;
        window.MdReader.markdown.renderToPreview();
        ui.setStatus("Loaded: " + file.name);
        ui.setEditorTitle("Markdown Source - " + file.name);
      })
      .catch(function () {
        ui.setStatus("Failed to load file.");
      });
  }

  function loadSampleMarkdown() {
    var ui = window.MdReader.ui;
    ui.elements.editor.value =
      "# Sample Document\n\n" +
      "This is a **simple markdown viewer** with browser TTS.\n\n" +
      "## Features\n\n" +
      "- Load a text or markdown file\n" +
      "- Edit markdown directly\n" +
      "- See rendered output\n" +
      "- Read it aloud\n\n" +
      "> This uses the browser speech engine.\n\n" +
      "### Inline Example\n\n" +
      "```javascript\nconst x = 42;\nconsole.log(x);\n```\n\n" +
      "### Table Example\n\n" +
      "| Feature | Status |\n" +
      "| --- | --- |\n" +
      "| Markdown | Done |\n" +
      "| TTS | Done |\n" +
      "| Folders | Coming soon |\n\n" +
      "[GitHub](https://github.com)";
    window.MdReader.markdown.renderToPreview();
    ui.setEditorTitle("Markdown Source");
    ui.setStatus("Sample loaded.");
  }

  function clearAll() {
    var ui = window.MdReader.ui;
    window.MdReader.tts.stopSpeech();
    ui.elements.editor.value = "";
    ui.elements.fileInput.value = "";
    playlist = [];
    currentIndex = -1;
    ui.hidePlaylistPanel();
    ui.setEditorTitle("Markdown Source");
    ui.setProgress(0);
    window.MdReader.markdown.renderToPreview();
    ui.setStatus("Cleared.");
  }

  function pasteFromClipboard() {
    var ui = window.MdReader.ui;
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      ui.setStatus("Clipboard access not available in this browser.");
      return;
    }
    navigator.clipboard.readText()
      .then(function (text) {
        if (!text) {
          ui.setStatus("Clipboard is empty.");
          return;
        }
        playlist = [];
        currentIndex = -1;
        ui.hidePlaylistPanel();
        ui.elements.editor.value = text;
        window.MdReader.markdown.renderToPreview();
        ui.setEditorTitle("Pasted Text");
        saveItem(text);
        ui.setStatus("Pasted " + text.length + " characters from clipboard.");
      })
      .catch(function (err) {
        ui.setStatus("Failed to read clipboard: " + (err && err.message ? err.message : err));
      });
  }

  // --- Saved items (localStorage persistence) ---

  var SAVED_KEY = "mdreader-saved";
  var SAVED_MAX = 50;

  function getSavedItems() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveItem(text) {
    var lines = text.split(/\r?\n/);
    var name = "";
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/^#+\s*/, "").trim();
      if (line) { name = line; break; }
    }
    if (!name) name = text.slice(0, 60);
    if (name.length > 60) name = name.slice(0, 57) + "...";

    var entry = { id: Date.now(), name: name, text: text, ts: new Date().toISOString() };
    var items = getSavedItems();
    items.unshift(entry);
    if (items.length > SAVED_MAX) items = items.slice(0, SAVED_MAX);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(items));
    } catch (e) {
      window.MdReader.ui.setStatus("Could not save: storage full.");
    }
    return entry;
  }

  function deleteItem(id) {
    var items = getSavedItems().filter(function (e) { return e.id !== id; });
    localStorage.setItem(SAVED_KEY, JSON.stringify(items));
  }

  function downloadItem(entry) {
    var filename = entry.name.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "document";
    if (!/\.md$/i.test(filename)) filename += ".md";
    var blob = new Blob([entry.text], { type: "text/markdown;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    window.MdReader.ui.setStatus("Downloaded: " + filename);
  }

  // --- Folder support ---

  function folderSupported() {
    return typeof window.showDirectoryPicker === "function";
  }

  function openFolder() {
    var ui = window.MdReader.ui;

    if (!folderSupported()) {
      ui.setStatus("Folder support requires Chrome or Edge 86+. Use Open File instead.");
      return;
    }

    window
      .showDirectoryPicker()
      .then(function (dirHandle) {
        return collectFiles(dirHandle);
      })
      .then(function (files) {
        if (!files.length) {
          ui.setStatus("No .md or .txt files found in folder.");
          return;
        }

        files.sort(function (a, b) {
          return a.name.localeCompare(b.name);
        });

        playlist = files;
        currentIndex = -1;

        var names = files.map(function (f) {
          return f.name;
        });

        ui.showPlaylist(names, function (index) {
          loadPlaylistItem(index);
        });

        ui.setStatus("Loaded folder: " + files.length + " files.");
        loadPlaylistItem(0);
      })
      .catch(function (err) {
        if (err.name === "AbortError") return; // User cancelled
        ui.setStatus("Failed to open folder: " + err.message);
      });
  }

  function collectFiles(dirHandle) {
    var files = [];
    var iterator = dirHandle.values();

    function next() {
      return iterator.next().then(function (result) {
        if (result.done) return files;
        var entry = result.value;
        if (entry.kind === "file" && FILE_PATTERN.test(entry.name)) {
          files.push({
            name: entry.name,
            load: (function (handle) {
              return function () {
                return handle.getFile().then(function (f) { return f.text(); });
              };
            })(entry),
          });
        }
        return next();
      });
    }

    return next();
  }

  // --- Built-in book support (manifest-driven) ---

  function loadBookFromManifest(manifestUrl) {
    var ui = window.MdReader.ui;

    ui.setStatus("Loading book...");

    fetch(manifestUrl)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (manifest) {
        var basePath = manifest.basePath || "";
        var items = manifest.chapters.map(function (ch) {
          var url = basePath + ch.file;
          return {
            name: ch.title || ch.file,
            load: (function (chapterUrl) {
              return function () {
                return fetch(chapterUrl).then(function (res) {
                  if (!res.ok) throw new Error("HTTP " + res.status);
                  return res.text();
                });
              };
            })(url),
          };
        });

        if (!items.length) {
          ui.setStatus("Book manifest is empty.");
          return;
        }

        playlist = items;
        currentIndex = -1;

        ui.showPlaylist(
          items.map(function (i) { return i.name; }),
          function (index) { loadPlaylistItem(index); }
        );

        ui.setStatus("Loaded book: " + manifest.title + " (" + items.length + " chapters).");
        loadPlaylistItem(0);
      })
      .catch(function (err) {
        ui.setStatus("Failed to load book: " + err.message);
      });
  }

  function loadTasty() {
    loadBookFromManifest("docs/tasty/manifest.json");
  }

  // Registry of available books. Add more entries here as new books are added.
  var AVAILABLE_BOOKS = [
    { title: "AI Sun", manifest: "docs/ai-sun/manifest.json" },
    { title: "Tasty", manifest: "docs/tasty/manifest.json" },
  ];

  function openBookPicker() {
    var ui = window.MdReader.ui;
    ui.showBookDialog(AVAILABLE_BOOKS, function (book) {
      loadBookFromManifest(book.manifest);
    });
  }

  function loadPlaylistItem(index) {
    if (index < 0 || index >= playlist.length) return Promise.resolve(false);

    var ui = window.MdReader.ui;
    var item = playlist[index];
    currentIndex = index;

    ui.highlightPlaylistItem(index);
    ui.setEditorTitle(item.name);

    return item
      .load()
      .then(function (text) {
        ui.elements.editor.value = text;
        window.MdReader.markdown.renderToPreview();
        ui.setStatus("Loaded: " + item.name + " (" + (index + 1) + "/" + playlist.length + ")");
        return true;
      })
      .catch(function (err) {
        ui.setStatus("Failed to read: " + item.name + (err && err.message ? " (" + err.message + ")" : ""));
        return false;
      });
  }

  function hasNext() {
    return currentIndex < playlist.length - 1;
  }

  function advanceToNext() {
    if (hasNext()) {
      return loadPlaylistItem(currentIndex + 1);
    }
    return Promise.resolve(false);
  }

  function getCurrentIndex() {
    return currentIndex;
  }

  function getPlaylistLength() {
    return playlist.length;
  }

  function downloadMarkdown() {
    var ui = window.MdReader.ui;
    var text = ui.elements.editor.value;
    if (!text.trim()) {
      ui.setStatus("Nothing to download.");
      return;
    }
    var title = ui.elements.editorTitle.textContent || "document";
    var filename = title.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "document";
    if (!/\.md$/i.test(filename)) filename += ".md";

    var blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ui.setStatus("Downloaded: " + filename);
  }

  return {
    handleFileSelect,
    loadSampleMarkdown,
    clearAll,
    pasteFromClipboard,
    openFolder,
    folderSupported,
    loadBookFromManifest,
    loadTasty,
    openBookPicker,
    downloadMarkdown,
    loadPlaylistItem,
    hasNext,
    advanceToNext,
    getCurrentIndex,
    getPlaylistLength,
    getSavedItems,
    saveItem,
    deleteItem,
    downloadItem,
  };
})();
