# JScale – Image Resizer

A fast, browser-based tool for resizing, cropping and converting images in bulk for SFB and LFB blogs.

**Live:** https://superjsal.github.io/image-resizer/

Everything runs in your browser. Images are never uploaded anywhere.

---

## Features

- **Bulk resize.** Load as many images as you like and export them all in one click.
- **Preset sizes.** One-click presets for LP Default (1200 × 628) and SayNetwork (640 × 420).
- **Custom dimensions.** Any width/height from 32 to 20,000 px. Your **last 5 custom sizes** are saved as quick-pick pills (click × on a pill to remove it).
- **Original mode.** Keeps each image's own dimensions with no crop or resize, and only converts the format.
- **Draggable crop box.** The main preview shows the whole image with a movable crop window. Drag it, or use the arrow keys (Shift = bigger steps, Home/End = edges). The dimmed area is what gets cut off. Each image remembers its own crop.
- **Upscale warning.** Cards show **⚠ Upscaled** when the source is smaller than the output (the result will look soft).
- **Output formats.** **JPG** (default, best for most cases) or **WebP**. WebP keeps transparency. For JPG, transparent areas are filled with white.
- **Quality.** Low / Med / High (0.70 / 0.85 / 0.92). Keep it on High: we're almost always downscaling.
- **Input formats.** JPG, PNG, WebP, GIF, AVIF, BMP and **HEIC/HEIF** (iPhone photos). See [HEIC support](#heic-support).
- **Per-image file size.** Each card shows the output file size at the current settings.
- **Rename before saving.** Click a card's file name to edit it. Names are cleaned up automatically (spaces and symbols become `-`).
- **Three ways to export** (the **Save to** setting):
  - **Downloads**: each image downloads separately to your browser's download location.
  - **ZIP**: everything in one `.zip` file (named like `images-2026-10-26-1430.zip`).
  - **Folder**: pick a folder once and every export is saved straight into it, with no download prompts. The app remembers the folder next time. Chrome and Edge only; see [Saving to a folder](#saving-to-a-folder).

  Export all with the main button (`Ctrl+Shift+D` / `⌘⇧D`), or one image with **Save** on its card. If two images end up with the same name, later ones get `-2`, `-3`, … added.
- **Fits the window.** Built for desktop use, and the page never scrolls. In a full browser window the settings sit on the left with the preview beside them. In a narrow window, like a browser sidebar, everything stacks into one column. On shorter windows, secondary text (headings, hints) is hidden to make room. With lots of images, the card strip at the bottom scrolls sideways.
- **Three themes:** Dark, Light, and Teal (matches the IC defaults page). The button in the top-right cycles through them.
- **Remembers your settings.** Last size, quality, format, mode, Save-to choice, folder and theme are restored on your next visit.

---

## How to use it

1. **Pick a size.** Choose a preset, enter custom dimensions and hit Apply (or Enter), or pick **Original**.
2. **Load images.** Drag and drop anywhere on the page, or click the big preview area (or the drop zone) to browse. If images are already loaded, you'll be asked whether to **Replace** them or **Add** to them.
3. **Adjust the crop.** Click a thumbnail to open it in the main preview, then drag the crop box. If it says *nothing to crop*, the image already matches the output shape.
4. **Export.** Choose **Save to** (Downloads, ZIP or Folder), then hit the main export button, or **Save** on individual cards.

If a file can't be read (damaged or unsupported), the status bar names the files that were skipped.

### Workflow tips

**Naming by task number:** click the name on a card and type the task number before exporting. With **Save to: Folder**, files land in your chosen folder under those names, with no save dialogs.

Works well as a **sidebar** when doing a lot of blogs: drag images from the browser's recent-downloads list straight into the resizer tab. I like to save Adobe Stock images with the file name LP wants first.

With **Save to: Downloads**, files are saved one after another, a short moment apart. The first time, your browser may ask to *allow multiple downloads*. Click Allow, or use **ZIP** or **Folder** instead.

### Known limitations

1. The app doesn't delete or overwrite the original images.
2. **Folder** saving only works in Chrome and Edge (and Brave with a setting turned on). In other browsers, use Downloads or ZIP.

---

## How cropping works

Images are scaled to **fill** the output size completely (no letterboxing). When the source's shape doesn't match the target, the extra is cropped off:

- The crop starts **centered**.
- Drag the box (or use the arrow keys) toward an edge to keep that side of the image.
- The box only moves along the axis that has extra room. If it can't move at all, the image already has the right shape.
- Large reductions are scaled down in steps for sharper results.

---

## Saving to a folder

1. Set **Save to** to **Folder**. The first time, a folder picker opens: choose where exports should go.
2. The browser asks to let the site edit files in that folder. Allow it.
3. Exports now save straight into that folder. Use **Change…** to pick a different one.

After you restart the browser, it asks for permission again on your first export. That's normal browser security.

Files with the same name as an existing file in the folder are **overwritten**. That's handy when re-exporting after fixing a crop.

**Brave:** folder saving is turned off by default. Open `brave://flags/#file-system-access-api`, set it to **Enabled**, and restart Brave. Firefox and Safari don't support it; the app shows a message if you try.

---

## HEIC support

Safari opens HEIC files natively. In Chrome, Edge and Firefox, the app uses a bundled decoder ([heic-to](https://github.com/hoppergee/heic-to), in `vendor/heic-to/`, about 3 MB). It loads only the first time you drop in a HEIC file, so that first file takes a few seconds and later ones are faster.

heic-to is licensed under the GNU LGPL v3. It's free to use, including at work. Its license texts are kept next to it in `vendor/heic-to/`; keep them there if you copy the app.

---

## Very large images

Browsers limit how big an image they can create. If an output is too large to export (for example a huge size in Original mode, or 20,000 × 20,000), its card shows **Too large** and the status bar explains which file failed. Other images still export normally.

---

## Running it locally

There's no build step and nothing to install. The app uses JavaScript modules, which browsers won't load from a double-clicked `index.html`. Serve the folder instead:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

### Project structure

```
image-resizer/
├── index.html       Page markup, meta tags, preset buttons
├── styles.css       Layout, components and the three themes
├── favicon.svg
├── vendor/
│   └── heic-to/     HEIC decoder + its license texts (LGPL/GPL)
└── js/
    ├── main.js      Entry point: wires up controls, loading, export
    ├── state.js     App state + saved settings (localStorage)
    ├── imaging.js   Decoding (incl. HEIC), cropping, resizing, encoding
    ├── export.js    Output cache and background encoding
    ├── zip.js       Builds the ZIP download (no library)
    ├── folder.js    Save-to-folder support
    ├── editor.js    Crop editor canvas (drag + keyboard)
    ├── grid.js      Thumbnail cards
    └── ui.js        Icons, status bar, step indicator, small helpers
```

### Adding a preset size

In `index.html`, copy any `seg-btn` and set its `data-size` attribute:

```html
<button class="seg-btn" data-size="1200x675">
  <span class="seg-label">1200 × 675</span>
  <span class="seg-hint">Florida Villager</span>
</button>
```

No JavaScript changes needed.

### Adding or changing a theme

Each theme is one block of color variables at the top of `styles.css` (`:root[data-theme="…"]`). To add a theme, add a block, then add its name to `THEMES` in `js/state.js` and an entry in `THEME_INFO` in `js/main.js`.

---

## Performance notes

- Only a small preview copy (max 2048 px) of each image stays in memory. With ten 24-megapixel photos loaded, the browser used about 75 MB, compared with about 950 MB for the previous version. The full-resolution image is decoded again only when exporting, then released. Large batches of big photos no longer exhaust memory.
- Files are loaded one at a time, with progress shown in the status bar.
- Output files are encoded in the background when the browser is idle, so single saves are usually instant.

---

## Browser support

Desktop browsers only: current versions of Chrome, Edge, Firefox and Safari. Phones and tablets aren't a target. The app needs JavaScript modules, Canvas and `createImageBitmap`.

## Tech

- Vanilla JavaScript (ES modules, no framework, no build)
- Canvas API for image processing
- [heic-to](https://github.com/hoppergee/heic-to) (libheif, LGPL-3.0) for HEIC, bundled and loaded on demand
- File System Access API for saving to a folder
- localStorage for saved preferences
- Google Analytics (gtag) for usage stats
