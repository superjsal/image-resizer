// Entry point: wires the controls to state, loading, preview and export.

import {
  state, FORMATS, QUALITY_HINTS, THEMES, savePrefs, loadPrefs,
  loadRecents, addRecent, removeRecent, loadTheme, saveTheme,
} from "./state.js";
import { DEFAULT_ANCHOR, isImageFile, isHeicFile, loadImage } from "./imaging.js";
import { ensureBlob, freeItem, schedulePrewarm, cancelPrewarm } from "./export.js";
import { initEditor, drawEditor, clearEditor, setBadge } from "./editor.js";
import { initGrid, renderGrid, drawThumb, markSelected, updateCardMeta, setSaveState, getFilename } from "./grid.js";
import { icon, plural, clamp, setStatus, setPressed, triggerDownload } from "./ui.js";
import { makeZip, uniqueNames } from "./zip.js";
import { folderSupported, savedFolder, pickFolder, ensureWritable, writeToFolder } from "./folder.js";

const $ = id => document.getElementById(id);

const fileInput     = $("file");
const dropZone      = $("drop");
const canvasWrap    = document.querySelector(".canvas-wrap");
const app           = document.querySelector(".app");
const downloadBtn   = $("download");
const downloadLabel = $("downloadLabel");
const widthInput    = $("cw");
const heightInput   = $("ch");
const loadChoice    = $("loadChoice");
const recentSizes   = $("recentSizes");
const themeToggle   = $("themeToggle");

const sizeButtons    = [...document.querySelectorAll(".seg-btn")];
const qualityButtons = [...document.querySelectorAll(".quality-btn")];
const formatButtons  = [...document.querySelectorAll(".format-btn")];
const destButtons    = [...document.querySelectorAll(".dest-btn")];
const folderRow      = $("folderRow");
const folderName     = $("folderName");

const DOWNLOAD_GAP_MS = 300;   // browsers drop rapid-fire downloads; space them out

let pendingFiles   = null;
let loadGeneration = 0;

const prewarm = (delay) => schedulePrewarm(updateCardMeta, delay);

// --- Preview ---

function sizeSummary() {
  return state.keepOriginal
    ? `Original sizes  ·  ${plural(state.images.length)}  ·  converting to ${state.format.ext.toUpperCase()}`
    : `${state.size.w} × ${state.size.h}  ·  ${plural(state.images.length)}`;
}

// Full refresh after images or output size change.
function refreshAll() {
  if (!state.images.length) return;
  state.selectedIndex = clamp(state.selectedIndex, 0, state.images.length - 1);
  drawEditor();
  renderGrid();
  prewarm(150);
  downloadBtn.disabled = false;
  app.classList.add("has-images");
  setStatus(sizeSummary(), "active");
}

function resetUI() {
  loadGeneration++;
  cancelPrewarm();
  state.images.forEach(freeItem);
  state.images = [];
  renderGrid();
  loadChoice.hidden = true;
  clearEditor();
  downloadBtn.disabled = true;
  app.classList.remove("has-images");
}

// --- Loading files ---

function handleFiles(fileList) {
  const files = [...fileList].filter(isImageFile);
  if (!files.length) { setStatus("No valid images found.", "error"); return; }

  if (state.images.length) {
    pendingFiles = files;
    $("loadChoiceMsg").textContent = `You already have ${plural(state.images.length)} loaded. Replace or add?`;
    loadChoice.hidden = false;
    $("choiceAdd").focus();
    return;
  }
  loadFiles(files);
}

function makeItem(file, loaded) {
  return { ...loaded, name: file.name, customName: "", cropAnchor: { ...DEFAULT_ANCHOR }, cache: null };
}

// Decodes one file at a time so memory stays bounded with large batches.
async function loadFiles(files) {
  const gen = ++loadGeneration;
  const loaded = [];
  const skipped = [];

  for (const [n, file] of files.entries()) {
    const heicNote = isHeicFile(file) ? " (converting HEIC)" : "";
    setStatus(`Loading ${n + 1} of ${files.length}${heicNote}…`, "busy");
    try {
      const result = await loadImage(file);
      if (gen !== loadGeneration) { result.preview.close(); return; }
      loaded.push(makeItem(file, result));
    } catch (err) {
      if (gen !== loadGeneration) return;
      console.warn("Skipped unreadable file:", file.name, err);
      skipped.push(file.name);
    }
  }
  if (gen !== loadGeneration) return;

  state.images.push(...loaded);
  if (!state.images.length) {
    resetUI();
    setStatus(`Couldn't read ${skipped.length === 1 ? skipped[0] : plural(skipped.length, "file")} — unsupported or damaged.`, "error");
    return;
  }
  refreshAll();
  if (skipped.length) {
    setStatus(`${sizeSummary()}  ·  skipped ${plural(skipped.length, "file")} it couldn't read: ${skipped.join(", ")}`, "error");
  }
}

function acceptPending(add) {
  if (!pendingFiles) return;
  const files = pendingFiles;
  pendingFiles = null;
  loadChoice.hidden = true;
  if (!add) {
    cancelPrewarm();
    state.images.forEach(freeItem);
    state.images = [];
    state.selectedIndex = 0;
  }
  loadFiles(files);
}

// --- Card actions ---

function selectImage(i) {
  state.selectedIndex = i;
  markSelected();
  drawEditor();
}

function removeImage(i) {
  freeItem(state.images[i]);
  state.images.splice(i, 1);
  if (!state.images.length) {
    resetUI();
    setStatus("All images removed. Load more to continue.");
    return;
  }
  if (state.selectedIndex > i) state.selectedIndex--;
  refreshAll();
}

// --- Where exports go: Downloads, one ZIP, or a chosen folder ---

const DEST_LABELS = { files: "Download All", zip: "Download ZIP", folder: "Save All to Folder" };

let folder = null;   // FileSystemDirectoryHandle, remembered across visits

function renderDest() {
  setPressed(destButtons, destButtons.find(b => b.dataset.dest === state.dest));
  folderRow.hidden = state.dest !== "folder";
  folderName.textContent = folder ? folder.name : "No folder chosen";
  folderName.classList.toggle("empty", !folder);
  $("folderChange").textContent = folder ? "Change…" : "Choose…";
  if (!state.isExporting) downloadLabel.textContent = DEST_LABELS[state.dest];
}

async function chooseFolder() {
  try {
    folder = await pickFolder();
    renderDest();
    setStatus(`Exports will be saved to "${folder.name}".`, "active");
    return true;
  } catch (err) {
    if (err.name !== "AbortError") setStatus(`Couldn't use that folder: ${err.message}`, "error");
    return false;
  }
}

// Returns a writable folder, asking for one or for permission if needed.
// Call before any slow work so the browser still treats it as a click.
async function readyFolder() {
  if (!folder && !(await chooseFolder())) return null;
  if (await ensureWritable(folder).catch(() => false)) return folder;
  setStatus("No permission to save in that folder. Click Change… to pick it again.", "error");
  return null;
}

function zipName() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `images-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.zip`;
}

const saveTimers = new WeakMap();

// Single image from its card. ZIP mode saves the plain file — a one-image ZIP is no help.
async function saveImage(i) {
  const item = state.images[i];
  if (!item || item.saving) return;
  item.saving = true;
  setSaveState(i, "busy");
  try {
    const dir = state.dest === "folder" ? await readyFolder() : null;
    if (state.dest === "folder" && !dir) { setSaveState(state.images.indexOf(item), "idle"); return; }
    const entry = await ensureBlob(item);
    if (!entry) return;
    const name = getFilename(item);
    if (dir) {
      await writeToFolder(dir, name, entry.blob);
      setStatus(`Saved ${name} to "${dir.name}"`, "active");
    } else {
      triggerDownload(entry.url, name);
    }
    setSaveState(state.images.indexOf(item), "saved");
    clearTimeout(saveTimers.get(item));
    saveTimers.set(item, setTimeout(() => setSaveState(state.images.indexOf(item), "idle"), 3000));
  } catch (err) {
    setSaveState(state.images.indexOf(item), "idle");
    setStatus(`Couldn't save ${getFilename(item)}: ${err.message}`, "error");
  } finally {
    item.saving = false;
    updateCardMeta();
  }
}

async function downloadAll() {
  if (!state.images.length || state.isExporting) return;
  state.isExporting = true;
  downloadBtn.disabled = true;
  const dest = state.dest;

  const finish = (msg, kind) => {
    state.isExporting = false;
    downloadBtn.disabled = !state.images.length;
    downloadLabel.textContent = DEST_LABELS[state.dest];
    if (msg) setStatus(msg, kind);
  };

  const dir = dest === "folder" ? await readyFolder() : null;
  if (dest === "folder" && !dir) { finish(); return; }

  const files = [];
  const failed = [];
  for (const [n, item] of [...state.images].entries()) {
    downloadLabel.textContent = `Preparing ${n + 1}/${state.images.length}…`;
    try {
      const entry = await ensureBlob(item);
      if (entry) files.push({ name: getFilename(item), blob: entry.blob, url: entry.url });
    } catch {
      failed.push(getFilename(item));
    }
  }
  updateCardMeta();
  uniqueNames(files.map(f => f.name)).forEach((name, i) => { files[i].name = name; });

  try {
    if (dest === "zip") {
      downloadLabel.textContent = "Zipping…";
      const url = URL.createObjectURL(await makeZip(files));
      triggerDownload(url, zipName());
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else if (dest === "folder") {
      for (const [n, f] of files.entries()) {
        downloadLabel.textContent = `Saving ${n + 1}/${files.length}…`;
        await writeToFolder(dir, f.name, f.blob);
      }
    } else {
      downloadLabel.textContent = "Downloading…";
      for (const f of files) {
        triggerDownload(f.url, f.name);
        await new Promise(r => setTimeout(r, DOWNLOAD_GAP_MS));
      }
    }
  } catch (err) {
    finish(`Export stopped: ${err.message}`, "error");
    return;
  }

  const where = dest === "zip" ? " as a ZIP" : dest === "folder" ? ` to "${dir.name}"` : "";
  if (failed.length) {
    finish(`Exported ${plural(files.length)}${where} · ${failed.length} failed (too large for this browser): ${failed.join(", ")}`, "error");
  } else {
    finish(`Done · ${plural(files.length)} exported${where}`, "active");
  }
}

// --- Output settings ---

function applySize(w, h) {
  state.keepOriginal = false;
  state.size = { w, h };
  savePrefs();
  setBadge(`${w} × ${h}`);
  if (state.images.length) refreshAll();
  else { setStatus(`Size set to ${w} × ${h}. Now load your images.`); }
}

function applyOriginalMode() {
  state.keepOriginal = true;
  savePrefs();
  setBadge("Original sizes");
  if (state.images.length) refreshAll();
  else { setStatus("Original mode — images keep their sizes. Now load your images."); }
}

// Settings that change the encoded file but not the crop.
function encodingChanged() {
  savePrefs();
  updateCardMeta();
  prewarm();
  if (state.images.length && !state.isExporting) setStatus(sizeSummary(), "active");
}

function setInputError(el, on) {
  el.closest(".input-group").classList.toggle("error", on);
  el.setAttribute("aria-invalid", String(on));
}

function clearInputErrors() {
  setInputError(widthInput, false);
  setInputError(heightInput, false);
}

function applyCustomSize() {
  const w = parseInt(widthInput.value);
  const h = parseInt(heightInput.value);
  setInputError(widthInput, !w);
  setInputError(heightInput, !h);
  if (!w || !h) { setStatus("Enter a value in the highlighted field.", "error"); return; }

  const cw = clamp(w, 32, 20000);
  const ch = clamp(h, 32, 20000);
  widthInput.value = cw;
  heightInput.value = ch;
  setPressed(sizeButtons, null);
  addRecent(cw, ch);
  renderRecents();
  applySize(cw, ch);
}

function renderRecents() {
  const recents = loadRecents();
  recentSizes.hidden = !recents.length;
  recentSizes.replaceChildren(...recents.map(({ w, h }) => {
    const pill = document.createElement("span");
    pill.className = "recent-pill";

    const apply = document.createElement("button");
    apply.className = "recent-pill-apply";
    apply.textContent = `${w} × ${h}`;
    apply.title = `Apply ${w} × ${h}`;
    apply.addEventListener("click", () => {
      widthInput.value = w;
      heightInput.value = h;
      clearInputErrors();
      setPressed(sizeButtons, null);
      applySize(w, h);
    });

    const del = document.createElement("button");
    del.className = "recent-pill-del";
    del.textContent = "×";
    del.title = "Remove from recent sizes";
    del.setAttribute("aria-label", `Remove ${w} × ${h} from recent sizes`);
    del.addEventListener("click", () => { removeRecent(w, h); renderRecents(); });

    pill.append(apply, del);
    return pill;
  }));
}

// --- Theme: dark → light → teal → dark ---

// fav: tab-icon colors [gradient start, gradient end, "J." color] — the theme's accent
const THEME_INFO = {
  dark:  { icon: "moon",    label: "Dark",  next: "Light", fav: ["#e09840", "#c07828", "#1a1208"] },
  light: { icon: "sun",     label: "Light", next: "Teal",  fav: ["#9a5e0e", "#7f4c0c", "#ffffff"] },
  teal:  { icon: "droplet", label: "Teal",  next: "Dark",  fav: ["#97d3d2", "#74c1c0", "#16181d"] },
};

// "J." tab icon drawn as shapes (tab icons can't use web fonts). Mirrors favicon.svg.
function faviconFor([a1, a2, ink]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a1}"/><stop offset="1" stop-color="${a2}"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#g)"/><path d="M18 7v12a5 5 0 0 1-10 0" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="23.5" r="2.5" fill="${ink}"/></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const info = THEME_INFO[theme];
  themeToggle.innerHTML = icon(info.icon, 14, 2);
  themeToggle.title = `${info.label} theme — click for ${info.next}`;
  themeToggle.setAttribute("aria-label", `Theme: ${info.label}. Switch to ${info.next}`);
  document.querySelector('link[rel="icon"]').href = faviconFor(info.fav);
  drawEditor();   // crop box color follows the theme
}

// --- Event wiring ---

sizeButtons.forEach(btn => btn.addEventListener("click", () => {
  setPressed(sizeButtons, btn);
  clearInputErrors();
  if (btn.dataset.size) {
    const [w, h] = btn.dataset.size.split("x").map(Number);
    applySize(w, h);
  } else {
    applyOriginalMode();
  }
}));

$("customResize").addEventListener("click", applyCustomSize);
[widthInput, heightInput].forEach(el => {
  el.addEventListener("keydown", e => { if (e.key === "Enter") applyCustomSize(); });
  el.addEventListener("input", () => setInputError(el, false));
});

qualityButtons.forEach(btn => btn.addEventListener("click", () => {
  setPressed(qualityButtons, btn);
  state.quality = parseFloat(btn.dataset.quality);
  $("qualityHint").textContent = QUALITY_HINTS[btn.dataset.quality];
  encodingChanged();
}));

formatButtons.forEach(btn => btn.addEventListener("click", () => {
  setPressed(formatButtons, btn);
  state.format = FORMATS[btn.dataset.format];
  $("formatHint").textContent = state.format.hint;
  encodingChanged();
}));

destButtons.forEach(btn => btn.addEventListener("click", async () => {
  const dest = btn.dataset.dest;
  if (dest === "folder" && !folderSupported) {
    setStatus("This browser can't save to a folder. Use Chrome or Edge — in Brave, turn on brave://flags/#file-system-access-api.", "error");
    return;
  }
  state.dest = dest;
  savePrefs();
  renderDest();
  if (dest === "folder" && !folder) await chooseFolder();
}));
$("folderChange").addEventListener("click", chooseFolder);

$("choiceReplace").addEventListener("click", () => acceptPending(false));
$("choiceAdd").addEventListener("click", () => acceptPending(true));
$("choiceCancel").addEventListener("click", () => {
  pendingFiles = null;
  loadChoice.hidden = true;
});

$("clear").addEventListener("click", () => {
  resetUI();
  setStatus("Cleared. Load new images when ready.");
});

downloadBtn.addEventListener("click", downloadAll);
dropZone.addEventListener("click", () => fileInput.click());
$("canvasEmpty").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFiles(fileInput.files);
  fileInput.value = "";
});

// Drop anywhere on the page; the drop zone highlights while files are dragged over.
let dragDepth = 0;
const dragHasFiles = e => e.dataTransfer?.types.includes("Files");

document.addEventListener("dragenter", e => {
  if (!dragHasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  dropZone.classList.add("drag");
  canvasWrap.classList.add("drag");
});
document.addEventListener("dragover", e => {
  if (dragHasFiles(e)) e.preventDefault();
});
document.addEventListener("dragleave", e => {
  if (--dragDepth <= 0 || !e.relatedTarget) {
    dragDepth = 0;
    dropZone.classList.remove("drag");
    canvasWrap.classList.remove("drag");
  }
});
document.addEventListener("drop", e => {
  if (!dragHasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  dropZone.classList.remove("drag");
    canvasWrap.classList.remove("drag");
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

const isMac = /mac/i.test(navigator.userAgentData?.platform ?? navigator.platform ?? "");
$("kbdHint").textContent = isMac ? "⌘⇧D" : "Ctrl+Shift+D";
document.addEventListener("keydown", e => {
  if ((isMac ? e.metaKey : e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "d") {
    e.preventDefault();
    downloadAll();
  }
});

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme;
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  applyTheme(next);
  saveTheme(next);
});

initEditor({
  onLive: drawThumb,
  onCommit: () => { updateCardMeta(); prewarm(600); },
});
initGrid({ onSelect: selectImage, onRemove: removeImage, onSave: saveImage });

// --- Init: restore saved settings ---

loadPrefs();
applyTheme(loadTheme());

const q = qualityButtons.find(b => parseFloat(b.dataset.quality) === state.quality);
setPressed(qualityButtons, q);
$("qualityHint").textContent = QUALITY_HINTS[q.dataset.quality];

setPressed(formatButtons, formatButtons.find(b => FORMATS[b.dataset.format] === state.format));
$("formatHint").textContent = state.format.hint;

if (state.keepOriginal) {
  setPressed(sizeButtons, $("originalBtn"));
  setBadge("Original sizes");
} else {
  const preset = sizeButtons.find(b => b.dataset.size === `${state.size.w}x${state.size.h}`);
  setPressed(sizeButtons, preset ?? null);
  if (!preset) {
    widthInput.value = state.size.w;
    heightInput.value = state.size.h;
  }
  setBadge(`${state.size.w} × ${state.size.h}`);
}

if (state.dest === "folder" && !folderSupported) state.dest = "files";
renderDest();
savedFolder().then(f => { folder = f; renderDest(); });

renderRecents();
