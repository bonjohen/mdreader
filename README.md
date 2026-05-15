# MD Reader

A browser-based Markdown viewer with text-to-speech. Load individual files or entire folders, read them aloud with high-quality voices, and follow along with rendered previews.

**Live site:** [mdreader.johnboen.com](https://mdreader.johnboen.com)

---

## Features

**Markdown Rendering**
- Full GitHub Flavored Markdown support (tables, task lists, strikethrough, fenced code blocks)
- Syntax highlighting for code blocks via highlight.js
- Live preview as you type or edit

**Text-to-Speech**
- Smart voice selection — high-quality Natural/Neural voices surface first
- Text chunking for reliable playback of long documents (works around Chrome's 15-second cutoff)
- Adjustable speech rate with persistent preferences
- Speak / Pause / Resume / Stop controls

**Folder Playback**
- Open a folder of `.md` or `.txt` files and browse them in a playlist sidebar
- Click any file to load and preview it
- Auto-play mode reads through all files in sequence

## Usage

1. **Open a file** — Click "Open File" to load a single `.md` or `.txt` file
2. **Open a folder** — Click "Open Folder" to load all markdown/text files from a directory (Chrome/Edge only)
3. **Edit directly** — Paste or type markdown into the editor; the preview updates live
4. **Read aloud** — Select a voice, adjust the rate, and click "Speak"
5. **Auto-play a folder** — Check "Auto-play", then click "Speak" to read through every file in order

## Tech Stack

| Concern | Solution |
|---------|----------|
| Markdown parsing | [marked.js](https://marked.js.org/) (GFM) |
| Syntax highlighting | [highlight.js](https://highlightjs.org/) |
| Text-to-speech | Web Speech API |
| Folder access | File System Access API |
| Hosting | GitHub Pages |

No build tools, no frameworks, no dependencies to install. Pure static HTML/CSS/JS with CDN-loaded libraries.

## Browser Support

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| Markdown viewing | Yes | Yes | Yes | Yes |
| Text-to-speech | Yes | Yes | Yes | Yes |
| High-quality voices | Some | Best | Standard | Standard |
| Folder playback | Yes | Yes | No | No |

Folder playback requires the File System Access API (Chrome/Edge 86+). Other browsers can still load individual files.

## Project Structure

```
mdreader/
  index.html        # Page structure and CDN links
  css/
    style.css       # Dark theme, layout, playlist sidebar, responsive
  js/
    ui.js           # DOM references, status bar, playlist UI
    markdown.js     # Marked.js configuration and rendering
    tts.js          # Voice management, chunked speech, auto-advance
    files.js        # File/folder loading, playlist state
    app.js          # Event wiring and initialization
  CNAME             # Custom domain for GitHub Pages
```

## Local Development

Serve the project with any static file server:

```bash
# Python
python -m http.server 4336

# Node
npx serve . --listen tcp://0.0.0.0:4336
```

Then open `http://localhost:4336` in your browser.

## Deployment

This site is deployed via GitHub Pages with a custom domain.

1. Push to GitHub
2. Enable Pages in repository Settings (deploy from `main`, root directory)
3. The `CNAME` file maps to `mdreader.johnboen.com`
4. Add a CNAME DNS record: `mdreader` -> `<username>.github.io`

## License

MIT
