// Encoded-output cache. Each image keeps at most one encoded Blob URL, keyed by
// the settings it was made with, so file sizes can be shown and single saves
// are instant. Encodes run one at a time in idle time ("prewarming").

import { state, outSizeFor } from "./state.js";
import { exportImage } from "./imaging.js";

export function blobKey(item) {
  const { w, h } = outSizeFor(item);
  const a = item.cropAnchor;
  return `${w}x${h}|${state.quality}|${state.format.mime}|${a.x.toFixed(4)},${a.y.toFixed(4)}`;
}

// Cached entry if it matches the current settings, else null.
export function freshEntry(item) {
  return item.cache?.key === blobKey(item) ? item.cache : null;
}

async function encode(item) {
  const key = blobKey(item);
  if (item.cache?.key === key) return item.cache;
  if (item.pending?.key === key) return item.pending.promise;

  const promise = (async () => {
    const { w, h } = outSizeFor(item);
    const blob = await exportImage(item, w, h, state.format, state.quality);
    if (item.freed) return null;
    if (item.cache) URL.revokeObjectURL(item.cache.url);
    item.cache = { key, blob, url: URL.createObjectURL(blob), size: blob.size };
    item.error = null;
    return item.cache;
  })();

  item.pending = { key, promise };
  try {
    return await promise;
  } catch (err) {
    item.error = { key, message: err.message || "Export failed" };
    throw err;
  } finally {
    if (item.pending?.promise === promise) item.pending = null;
  }
}

// Encodes at the current settings, retrying if settings changed mid-encode.
export async function ensureBlob(item) {
  for (;;) {
    const entry = await encode(item);
    if (!entry || entry.key === blobKey(item)) return entry;
  }
}

// Error from the last encode attempt at the current settings, if any.
export function errorFor(item) {
  return item.error?.key === blobKey(item) ? item.error.message : null;
}

export function freeItem(item) {
  item.freed = true;
  item.preview.close();
  if (item.cache) URL.revokeObjectURL(item.cache.url);
  item.cache = null;
}

// --- Background prewarm ---

let token = 0;
let timer = null;

const whenIdle = fn => ("requestIdleCallback" in window)
  ? requestIdleCallback(fn, { timeout: 1500 })
  : setTimeout(fn, 200);

// Encodes every image in the background; onEach runs after each one finishes.
export function schedulePrewarm(onEach, delay = 400) {
  clearTimeout(timer);
  const myToken = ++token;
  timer = setTimeout(() => {
    const queue = [...state.images];
    const next = () => {
      if (myToken !== token || !queue.length) return;
      const item = queue.shift();
      if (!state.images.includes(item) || errorFor(item)) { next(); return; }
      ensureBlob(item)
        .catch(() => {})
        .then(() => {
          if (myToken !== token) return;
          onEach();
          whenIdle(next);
        });
    };
    whenIdle(next);
  }, delay);
}

export function cancelPrewarm() {
  token++;
  clearTimeout(timer);
}
