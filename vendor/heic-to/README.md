# heic-to 1.6.6 (bundled, unmodified)

HEIC/HEIF decoder used by JScale when the browser can't open HEIC files on its own.
Loaded on demand from `js/imaging.js` only when a HEIC file is dropped in.

- Source: https://github.com/hoppergee/heic-to (npm package `heic-to@1.6.6`, file `dist/heic-to.min.js`)
- Built on libheif 1.23.6: https://github.com/strukturag/libheif
- License: GNU LGPL v3 or later. See `LICENSE` (LGPL text) and `COPYING-GPL-3.0.txt` (GPL text it builds on).

To update: replace `heic-to.min.js` with the same file from a newer heic-to release and update the version above.
You can also swap in your own build of the library; JScale only calls its exported `heicTo()` function.
