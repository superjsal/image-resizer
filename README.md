# Image Resizer

A lightweight, browser-based tool for resizing and exporting images in bulk for SFB and LFB Blogs.


---

## Features

- **Bulk resize** — load multiple images at once and export them all in one click
- **Preset sizes** — one-click presets for common formats (LP Default 1200×628, SayNetwork 640×420)
- **Custom dimensions** — enter any width/height up to 20,000px
- **Draggable crop box** — the main preview shows your full image with a movable crop window. Drag it along whichever axis has extra room to control exactly what's kept; the dimmed area is what gets cropped off. Each image keeps its own crop position.
- **Quality control** — Low / Med / High JPEG compression settings (Suggest to keep it on High as 99% of the time we are downscaling.)
- **Live preview** — full-size canvas preview updates instantly when you change size, quality, or crop anchor
- **Individual save** — download any single image straight from its card
- **Download All** — exports every image at once (`Ctrl+Shift+D` / `⌘⇧D`)
- **Light & dark mode** — persists across sessions via localStorage
- **Remembers your settings** — last used size and quality are restored on next visit
- **Last used Custom Sizes persist** - Stores up to 3
- **Different formats** - JPG, PNG, and WebP. JPG should be the default for most scenarios.

---

## Usage

No build step, no install. Just open `index.html` in a modern browser.

```
image-resizer/
├── index.html
├── script.js
└── styles.css
```

**TIP:** If you want to rename the Adobe Stock file before resizing make sure you have `Ask where to save each file before downloading` turned on in your relevant browser.
- Chrome: `chrome://settings/downloads`
- Brave: `brave://settings/downloads`
- Edge: `edge://settings/downloads`
- Safari: need a safari user

1. **Pick a size** — choose a preset or enter custom dimensions and hit Apply
2. **Load images** — drag & drop or click to browse. Adding more images while some are loaded will ask whether to replace or add
3. **Adjust the crop** — click any thumbnail to load it into the main preview, then drag the crop box to reposition it. If the box can't move, the image already matches the output ratio and there's nothing to crop
4. **Export** — hit Download All or save individual images from their cards

Ideally best used as a Sidebar if doing a lot of Blogs. You can just use the Recent Download History to drag the downloaded images over from the SEOTOOL tab over to the resizer tab. I like to save adobe stock images as the file name LP wants first.


**Some Pain Points**
1. Since this app cannot delete the original image we'll need to overwrite the original image or have them go to a separate folder.
2. Since this is a web based app, for security reasons I am unable to define an output folder for these images so we need to go back and forth between 2 folders.

A minor annoyance but if anyone has any suggestions, let me know!

---

## Adding a Preset Size

In `index.html`, copy any `seg-btn` and set the `data-size` attribute:

```html
<button class="seg-btn" data-size="1200x675">
  <span class="seg-label">1200 × 675</span>
  <span class="seg-hint">Florida Villager</span>
</button>
```

No JS changes needed.

---

## How Cropping Works

Images are always scaled to **fill** the output size completely (no letterboxing). When the source aspect ratio doesn't match the target, the excess is cropped. Drag the crop box in the main preview to choose which part is kept:

- By **default** the crop is centered
- Drag toward any edge to keep that side of the image
- If the box **won't move**, that means the image already fills the output ratio on both axes, so there's nothing to crop

---

## Browser Support

Works in any modern browser that supports the Canvas API and `createImageBitmap`. Chrome, Firefox, Safari, and Edge all work fine.

---

## Tech

- Vanilla JS (no frameworks)
- Canvas API for image processing
- [Lucide](https://lucide.dev) for icons (loaded via CDN)
- localStorage for persisting preferences
