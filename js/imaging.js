// Image decoding, cropping and encoding. No DOM state lives here — every
// function takes what it needs and returns a result.

export const DEFAULT_ANCHOR = { x: 0.5, y: 0.5 };

// Long edge of the in-memory preview copy. Big enough for a sharp crop editor
// on a 2x screen; the full-resolution image is only decoded again at export.
const PREVIEW_MAX_EDGE = 2048;

// heic-to (libheif compiled to JS, ~3 MB, bundled in vendor/) — only loaded the
// first time a HEIC/HEIF file can't be decoded natively (Safari reads them on its own).
const HEIC_LIB_URL = new URL("../vendor/heic-to/heic-to.min.js", import.meta.url).href;
let heicLib = null;

export function isHeicFile(file) {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

// Windows often reports HEIC files with an empty MIME type, so fall back to the extension.
export function isImageFile(file) {
  return file.type.startsWith("image/") || isHeicFile(file);
}

async function decodeHeic(file) {
  heicLib ??= import(HEIC_LIB_URL);
  const { heicTo } = await heicLib.catch(err => { heicLib = null; throw err; });
  return heicTo({ blob: file, type: "bitmap" });
}

function newCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return [c, ctx];
}

// Releases a canvas's pixel memory right away instead of waiting for GC.
function freeCanvas(c) {
  c.width = 0;
  c.height = 0;
}

async function canvasToBlob(canvas, mime, quality) {
  return new Promise(r => canvas.toBlob(r, mime, quality));
}

// Loads one file. Returns the source dimensions, a small preview bitmap for the
// UI, and the Blob to re-decode at export time. HEIC files that needed the JS
// decoder are stored as a lossless PNG so the slow decode only happens once.
export async function loadImage(file) {
  let full;
  let source = file;
  try {
    full = await createImageBitmap(file);
  } catch (err) {
    if (!isHeicFile(file)) throw err;
    full = await decodeHeic(file);
    const [c, ctx] = newCanvas(full.width, full.height);
    ctx.drawImage(full, 0, 0);
    source = await canvasToBlob(c, "image/png");
    freeCanvas(c);
    if (!source) { full.close(); throw new Error("HEIC conversion failed"); }
  }

  const { width, height } = full;
  const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(width, height));
  let preview = full;
  if (scale < 1) {
    const pw = Math.max(1, Math.round(width * scale));
    const ph = Math.max(1, Math.round(height * scale));
    const [c, ctx] = newCanvas(pw, ph);
    drawScaled(full, 0, 0, width, height, ctx, pw, ph);
    preview = await createImageBitmap(c);
    freeCanvas(c);
    full.close();
  }
  return { width, height, preview, source };
}

// Source rectangle that fills w×h without distortion, positioned by anchor
// (x/y each 0–1: 0,0 = top-left, 0.5,0.5 = center, 1,1 = bottom-right).
export function getCropRect(srcW, srcH, w, h, anchor = DEFAULT_ANCHOR) {
  const scale = Math.max(w / srcW, h / srcH);
  const cropW = Math.min(srcW, Math.round(w / scale));
  const cropH = Math.min(srcH, Math.round(h / scale));
  return {
    sx: Math.floor((srcW - cropW) * anchor.x),
    sy: Math.floor((srcH - cropH) * anchor.y),
    cropW, cropH,
  };
}

// Draws a source region into ctx at w×h. Reductions beyond 2x are done by
// halving repeatedly first — a single big resample looks soft. Two canvases
// are reused ping-pong style instead of allocating one per step.
function drawScaled(src, sx, sy, sw, sh, ctx, w, h) {
  if (sw <= w * 2 && sh <= h * 2) {
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    return;
  }

  let curW = Math.max(w, Math.round(sw / 2));
  let curH = Math.max(h, Math.round(sh / 2));
  let [a, actx] = newCanvas(curW, curH);
  actx.drawImage(src, sx, sy, sw, sh, 0, 0, curW, curH);
  let [b, bctx] = newCanvas(curW, curH);

  while (curW > w * 2 || curH > h * 2) {
    const nextW = Math.max(w, Math.round(curW / 2));
    const nextH = Math.max(h, Math.round(curH / 2));
    bctx.clearRect(0, 0, nextW, nextH);
    bctx.drawImage(a, 0, 0, curW, curH, 0, 0, nextW, nextH);
    [a, actx, b, bctx] = [b, bctx, a, actx];
    curW = nextW;
    curH = nextH;
  }

  ctx.drawImage(a, 0, 0, curW, curH, 0, 0, w, h);
  freeCanvas(a);
  freeCanvas(b);
}

// Crops bitmap to fill a w×h canvas. `background` fills transparent areas
// (needed for JPEG, which has no alpha); pass null to keep transparency.
export function drawCropped(bitmap, canvas, w, h, anchor = DEFAULT_ANCHOR, background = null) {
  const { sx, sy, cropW, cropH } = getCropRect(bitmap.width, bitmap.height, w, h, anchor);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  drawScaled(bitmap, sx, sy, cropW, cropH, ctx, w, h);
}

// Full-resolution export: re-decodes the source, crops, encodes, frees.
// Throws with a readable message if the browser can't allocate the canvas.
export async function exportImage(item, w, h, format, quality) {
  const full = await createImageBitmap(item.source);
  const canvas = document.createElement("canvas");
  try {
    drawCropped(full, canvas, w, h, item.cropAnchor, format.mime === "image/jpeg" ? "#fff" : null);
    const blob = await canvasToBlob(canvas, format.mime, quality);
    if (!blob) throw new Error(`${w} × ${h} is too large for this browser to export`);
    return blob;
  } finally {
    full.close();
    freeCanvas(canvas);
  }
}
