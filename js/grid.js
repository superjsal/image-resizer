// Thumbnail cards for every loaded image: crop preview, rename, size, save, remove.

import { state, outSizeFor } from "./state.js";
import { drawCropped } from "./imaging.js";
import { freshEntry, errorFor } from "./export.js";
import { icon, formatBytes } from "./ui.js";

const previewGrid = document.getElementById("previewGrid");
const gridHeader  = document.getElementById("gridHeader");

const THUMB_W = 160 * Math.min(2, Math.max(1, window.devicePixelRatio || 1));
const THUMB_MAX_RATIO = 1.5;   // caps very tall thumbnails in Original mode

let handlers = { onSelect() {}, onRemove() {}, onSave() {} };

export function initGrid(h) {
  handlers = h;
}

export function cleanName(name) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "image";
}

export function getFilename(item) {
  return cleanName(item.customName || item.name) + "." + state.format.ext;
}

export function drawThumb(i) {
  const item  = state.images[i];
  const thumb = previewGrid.children[i]?.querySelector("canvas");
  if (!item || !thumb) return;
  const { w, h } = outSizeFor(item);
  const tH = Math.round(THUMB_W * Math.min(h / w, THUMB_MAX_RATIO));
  drawCropped(item.preview, thumb, THUMB_W, tH, item.cropAnchor);
}

// Updates selection highlight without rebuilding the grid.
export function markSelected() {
  [...previewGrid.children].forEach((card, i) => {
    card.classList.toggle("selected", i === state.selectedIndex);
  });
}

// Output file size per card: the size, "…" while encoding, or "!" on error.
export function updateCardMeta() {
  [...previewGrid.children].forEach((card, i) => {
    const item = state.images[i];
    const el = card.querySelector(".file-size");
    if (!item || !el) return;
    const err = errorFor(item);
    const entry = freshEntry(item);
    el.textContent = err ? "Too large" : entry ? formatBytes(entry.size) : "…";
    el.title = err || "Output file size at current settings";
    el.classList.toggle("error", !!err);
  });
}

export function setSaveState(i, label) {
  const btn = previewGrid.children[i]?.querySelector(".card-dl-btn");
  if (!btn) return;
  const saved = label === "saved";
  btn.innerHTML = icon(saved ? "check" : "download") + (saved ? " Saved!" : label === "busy" ? " Saving…" : " Save");
  btn.classList.toggle("saved", saved);
}

function buildCard(item, i) {
  const { w, h } = outSizeFor(item);
  const label = item.customName || cleanName(item.name);

  const card = document.createElement("div");
  card.className = "preview-item" + (i === state.selectedIndex ? " selected" : "");

  const removeBtn = document.createElement("button");
  removeBtn.className = "card-remove";
  removeBtn.textContent = "×";
  removeBtn.title = "Remove this image";
  removeBtn.setAttribute("aria-label", `Remove ${label}`);
  removeBtn.addEventListener("click", () => handlers.onRemove(i));

  const thumbBtn = document.createElement("button");
  thumbBtn.className = "thumb-wrap";
  thumbBtn.setAttribute("aria-label", `${state.keepOriginal ? "Preview" : "Edit crop for"} ${label}`);
  thumbBtn.addEventListener("click", () => handlers.onSelect(i));

  const thumb = document.createElement("canvas");
  const overlay = document.createElement("span");
  overlay.className = "thumb-overlay";
  overlay.textContent = state.keepOriginal ? "Click to preview" : "Click to edit crop";
  thumbBtn.append(thumb, overlay);

  // Source smaller than the output on either axis → the result is upscaled and looks soft.
  if (item.width < w || item.height < h) {
    const warn = document.createElement("span");
    warn.className = "thumb-warn";
    warn.textContent = "⚠ Upscaled";
    warn.title = `Source (${item.width} × ${item.height}) is smaller than the output (${w} × ${h}) — result will look soft`;
    thumbBtn.appendChild(warn);
  }

  const nameEl = document.createElement("input");
  nameEl.type = "text";
  nameEl.className = "filename-edit";
  nameEl.value = label;
  nameEl.title = "Click to rename";
  nameEl.spellcheck = false;
  nameEl.autocomplete = "off";
  nameEl.setAttribute("aria-label", "File name");
  nameEl.addEventListener("change", () => {
    item.customName = nameEl.value.trim();
    nameEl.value = item.customName || cleanName(item.name);
  });
  nameEl.addEventListener("keydown", e => { if (e.key === "Enter") nameEl.blur(); });

  const dims = document.createElement("div");
  dims.className = "src-dims";
  const srcSpan = document.createElement("span");
  srcSpan.textContent = `${item.width}\u2009×\u2009${item.height}`;   // thin spaces keep it compact
  srcSpan.title = "Source size";
  const sizeEl = document.createElement("span");
  sizeEl.className = "file-size";
  dims.append(srcSpan, sizeEl);

  const info = document.createElement("div");
  info.className = "card-info";
  info.append(nameEl, dims);

  const saveBtn = document.createElement("button");
  saveBtn.className = "card-dl-btn";
  saveBtn.innerHTML = icon("download") + " Save";
  saveBtn.addEventListener("click", () => handlers.onSave(i));

  card.append(removeBtn, thumbBtn, info, saveBtn);
  return card;
}

export function renderGrid() {
  previewGrid.replaceChildren(...state.images.map(buildCard));
  gridHeader.hidden = !state.images.length;
  state.images.forEach((_, i) => drawThumb(i));
  updateCardMeta();
}
