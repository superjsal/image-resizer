// Shared app state plus everything that reads/writes localStorage.

export const FORMATS = {
  jpeg: { mime: "image/jpeg", ext: "jpg",  hint: "Smaller file, good for photos" },
  webp: { mime: "image/webp", ext: "webp", hint: "Best compression, modern browsers" },
};

export const QUALITY_HINTS = {
  "0.7":  "Smallest file size, some compression visible",
  "0.85": "Good balance of size and quality",
  "0.92": "Sharp output, larger file size",
};

export const THEMES = ["dark", "light", "teal"];
export const MAX_RECENTS = 5;

export const state = {
  images: [],                    // see makeItem() in main.js
  size: { w: 1200, h: 628 },
  keepOriginal: false,           // "Original" mode: each image keeps its own size, format conversion only
  quality: 0.92,
  format: FORMATS.jpeg,
  selectedIndex: 0,
  isExporting: false,
  dest: "files",                 // where Download All / Save go: "files" | "zip" | "folder"
};

export const DESTS = ["files", "zip", "folder"];

// Output dimensions for an item: its own size in Original mode, else the shared size.
export function outSizeFor(item) {
  return state.keepOriginal ? { w: item.width, h: item.height } : state.size;
}

// Every localStorage access goes through these — storage can throw in private
// windows or when site data is blocked, and the app must keep working.
function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
function readJSON(key) {
  try { return JSON.parse(read(key)); } catch { return null; }
}

export function savePrefs() {
  write("resizer-size",     JSON.stringify(state.size));
  write("resizer-quality",  String(state.quality));
  write("resizer-format",   state.format === FORMATS.webp ? "webp" : "jpeg");
  write("resizer-original", state.keepOriginal ? "1" : "0");
  write("resizer-dest",     state.dest);
}

export function loadPrefs() {
  const size = readJSON("resizer-size");
  if (size?.w && size?.h) state.size = size;

  const q = parseFloat(read("resizer-quality"));
  if (q in QUALITY_HINTS) state.quality = q;

  // Older versions stored {mime, ext}; PNG is no longer offered, so anything
  // other than WebP falls back to JPG.
  const fmt = read("resizer-format") ?? "";
  state.format = fmt.includes("webp") ? FORMATS.webp : FORMATS.jpeg;

  state.keepOriginal = read("resizer-original") === "1";

  const dest = read("resizer-dest");
  if (DESTS.includes(dest)) state.dest = dest;
}

export function loadRecents() {
  const list = readJSON("resizer-recents");
  return Array.isArray(list) ? list.slice(0, MAX_RECENTS) : [];
}

export function addRecent(w, h) {
  const list = [{ w, h }, ...loadRecents().filter(r => !(r.w === w && r.h === h))];
  write("resizer-recents", JSON.stringify(list.slice(0, MAX_RECENTS)));
}

export function removeRecent(w, h) {
  write("resizer-recents", JSON.stringify(loadRecents().filter(r => !(r.w === w && r.h === h))));
}

export function loadTheme() {
  const saved = read("resizer-theme");
  if (saved === "indigo") return "teal";   // Indigo was replaced by Teal
  return THEMES.includes(saved) ? saved : "dark";
}

export function saveTheme(theme) {
  write("resizer-theme", theme);
}
