# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Local Development

No build tools or package managers. Serve the project root with any static file server:

```bash
python -m http.server 4336
# or
npx serve . --listen tcp://0.0.0.0:4336
```

Open `http://localhost:4336`. Port 4336 is reserved for mdreader in the global port registry. There are no tests or linters.

## Architecture

Pure static HTML/CSS/JS — no framework, no bundler, no `package.json`. CDN libraries loaded in `index.html`: **marked.js** (Markdown parsing), **marked-highlight** (highlight.js bridge), **highlight.js** (syntax highlighting).

### Module System

All JS lives in the `window.MdReader` namespace using the IIFE module pattern. **Script load order in `index.html` is load-order dependent and must be preserved:**

1. `js/ui.js` — DOM element references (`MdReader.ui.elements`) and UI helpers (status bar, progress, playlist). All other modules depend on this.
2. `js/markdown.js` — Configures marked.js with GFM + syntax highlighting; exposes `render()` and `renderToPreview()`.
3. `js/tts.js` — Web Speech API wrapper. Chunks text at 200 chars to work around Chrome's 15-second utterance cutoff. Uses a pause/resume keep-alive timer every 10s to prevent Chrome from silently stopping mid-speech. Voice and rate are persisted to `localStorage` under keys `mdreader-voice` and `mdreader-rate`.
4. `js/files.js` — File/folder loading. Maintains `playlist[]` and `currentIndex` state. Folder support uses the File System Access API (`showDirectoryPicker`) — Chrome/Edge only.
5. `js/app.js` — Event wiring only. Wires all DOM events to the above modules. Loads last.

### Cross-Module Calls

Modules reference siblings via `window.MdReader.*` at call time (not at module init time), which avoids load-order issues for cross-module calls within functions.

## Deployment

GitHub Pages, deployed from the `master` branch root. The `CNAME` file maps to `mdreader.johnboen.com`. To deploy: push to GitHub and Pages rebuilds automatically.
