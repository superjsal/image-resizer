// Crop editor: the main preview canvas. Shows the whole selected image, dims
// the part that will be cropped away, and lets the crop window be dragged or
// moved with arrow keys along whichever axis has room.

import { state, outSizeFor } from "./state.js";
import { getCropRect } from "./imaging.js";
import { clamp } from "./ui.js";

const canvas      = document.getElementById("out");
const ctx         = canvas.getContext("2d");
const canvasEmpty = document.getElementById("canvasEmpty");
const canvasBadge = document.getElementById("canvasBadge");
const cropHint    = document.getElementById("cropHint");

const geom = { img: null, box: null, axis: null };
let dragging = false;
let handlers = { onLive() {}, onCommit() {} };

// Which axis the crop window can move along for this item (null = none).
export function cropAxis(item) {
  const { w, h } = outSizeFor(item);
  const { cropW, cropH } = getCropRect(item.width, item.height, w, h);
  return cropW < item.width - 1 ? "x" : cropH < item.height - 1 ? "y" : null;
}

export function drawEditor() {
  const item = state.images[state.selectedIndex];
  if (!item) return;
  const bmp = item.preview;

  // Backing store matches the displayed size × devicePixelRatio for a sharp preview.
  const dpr  = Math.max(1, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth  || 320;
  const cssH = canvas.clientHeight || 230;
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  // Contain-fit the whole image.
  const fs = Math.min(cssW / bmp.width, cssH / bmp.height);
  const iw = bmp.width * fs, ih = bmp.height * fs;
  const ix = (cssW - iw) / 2, iy = (cssH - ih) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, ix, iy, iw, ih);

  // Crop window, positioned by the item's anchor.
  const { w, h } = outSizeFor(item);
  const { cropW, cropH } = getCropRect(item.width, item.height, w, h);
  const boxW = iw * (cropW / item.width);
  const boxH = ih * (cropH / item.height);
  const boxX = ix + (iw - boxW) * item.cropAnchor.x;
  const boxY = iy + (ih - boxH) * item.cropAnchor.y;

  // Dim the cropped-away area (even-odd fill leaves a hole for the window).
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.rect(ix, iy, iw, ih);
  ctx.rect(boxX, boxY, boxW, boxH);
  ctx.fill("evenodd");

  // Rule-of-thirds guides.
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    const gx = boxX + boxW * (i / 3);
    const gy = boxY + boxH * (i / 3);
    ctx.moveTo(gx, boxY); ctx.lineTo(gx, boxY + boxH);
    ctx.moveTo(boxX, gy); ctx.lineTo(boxX + boxW, gy);
  }
  ctx.stroke();

  // Border + corner ticks in the theme's crop color (--crop in styles.css).
  ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--crop").trim() || "#fff";
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX + 1, boxY + 1, boxW - 2, boxH - 2);
  ctx.lineWidth = 3;
  const t = Math.min(16, boxW / 3, boxH / 3);
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [
    [boxX, boxY, 1, 1], [boxX + boxW, boxY, -1, 1],
    [boxX, boxY + boxH, 1, -1], [boxX + boxW, boxY + boxH, -1, -1],
  ]) {
    ctx.moveTo(cx, cy + dy * t); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * t, cy);
  }
  ctx.stroke();

  const axis = cropAxis(item);
  geom.img  = { ix, iy, iw, ih };
  geom.box  = { x: boxX, y: boxY, w: boxW, h: boxH };
  geom.axis = axis;
  canvas.style.cursor = axis ? (dragging ? "grabbing" : "grab") : "default";

  cropHint.textContent = state.keepOriginal
    ? "Original mode — image keeps its own size, format conversion only"
    : axis === "x" ? "Drag the box or press ← → to reposition the crop (Shift = bigger steps)"
    : axis === "y" ? "Drag the box or press ↑ ↓ to reposition the crop (Shift = bigger steps)"
    : "Image already matches the output ratio — nothing to crop";
  cropHint.classList.add("visible");

  canvasBadge.textContent = state.keepOriginal
    ? `Original · ${item.width} × ${item.height}`
    : `${w} × ${h}`;
  canvasBadge.classList.add("visible");
  canvasEmpty.classList.add("hidden");
}

export function clearEditor() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  geom.axis = null;
  canvas.style.cursor = "default";
  canvasEmpty.classList.remove("hidden");
  cropHint.classList.remove("visible");
}

export function setBadge(text) {
  canvasBadge.textContent = text;
  canvasBadge.classList.add("visible");
}

function setAnchor(anchor) {
  state.images[state.selectedIndex].cropAnchor = anchor;
  drawEditor();
  handlers.onLive(state.selectedIndex);
}

// --- Pointer dragging (mouse + touch) ---

let rafPending = false;
let lastPointer = null;

function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function onPointerDown(e) {
  const b = geom.box;
  if (!state.images.length || !geom.axis || !b) return;
  const [px, py] = pointerPos(e);
  if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) return;
  canvas.focus({ preventScroll: true });
  dragging = true;
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  canvas.style.cursor = "grabbing";
}

function onPointerMove(e) {
  if (!dragging) return;
  lastPointer = e;
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    if (!dragging || !geom.img) return;
    const [px, py] = pointerPos(lastPointer);
    const { ix, iy, iw, ih } = geom.img;
    const b = geom.box;
    const a = state.images[state.selectedIndex].cropAnchor;
    if (geom.axis === "x" && iw > b.w) {
      setAnchor({ x: clamp((px - b.w / 2 - ix) / (iw - b.w), 0, 1), y: a.y });
    } else if (geom.axis === "y" && ih > b.h) {
      setAnchor({ x: a.x, y: clamp((py - b.h / 2 - iy) / (ih - b.h), 0, 1) });
    }
  });
}

function onPointerUp(e) {
  if (!dragging) return;
  dragging = false;
  try { canvas.releasePointerCapture(e.pointerId); } catch {}
  canvas.style.cursor = geom.axis ? "grab" : "default";
  handlers.onCommit(state.selectedIndex);
}

const KEYS = {
  x: { dec: "ArrowLeft", inc: "ArrowRight" },
  y: { dec: "ArrowUp",   inc: "ArrowDown" },
};

function onKeyDown(e) {
  const axis = geom.axis;
  if (!state.images.length || !axis) return;
  const step = e.shiftKey ? 0.1 : 0.02;
  const a = { ...state.images[state.selectedIndex].cropAnchor };
  switch (e.key) {
    case KEYS[axis].dec: a[axis] = clamp(a[axis] - step, 0, 1); break;
    case KEYS[axis].inc: a[axis] = clamp(a[axis] + step, 0, 1); break;
    case "Home":         a[axis] = 0; break;
    case "End":          a[axis] = 1; break;
    default: return;
  }
  e.preventDefault();
  setAnchor(a);
  handlers.onCommit(state.selectedIndex);
}

export function initEditor(h) {
  handlers = h;
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("keydown", onKeyDown);

  // Crop geometry depends on the canvas's rendered size, which changes with the
  // window and when the card strip appears or disappears below it.
  let resizeRaf = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(drawEditor);
  }).observe(canvas);
}
