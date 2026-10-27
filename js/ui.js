// Small shared UI helpers: icons, status bar, toggle groups.

const ICON_PATHS = {
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  check:    '<path d="M20 6 9 17l-5-5"/>',
  moon:     '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  droplet:  '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
};

export function icon(name, size = 12, stroke = 2.5) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

export const plural = (n, word = "image") => `${n} ${word}${n !== 1 ? "s" : ""}`;

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function formatBytes(bytes) {
  if (bytes < 1024)    return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(bytes < 102400 ? 1 : 0) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
}

const statusBar  = document.getElementById("status");
const statusText = document.getElementById("statusText");
const statusDot  = document.getElementById("statusDot");

// state: "idle" | "busy" | "active" | "error"
// The status bar stays hidden until there's something to report.
export function setStatus(msg, state = "idle") {
  statusBar.hidden = false;
  statusText.textContent = msg;
  statusDot.className = "status-dot" + (state !== "idle" ? ` ${state}` : "");
  statusBar.classList.remove("flash");
  void statusBar.offsetWidth;   // restart the flash animation
  statusBar.classList.add("flash");
}

// Marks one button in a group as selected (class + aria-pressed). Pass null to clear.
export function setPressed(buttons, active) {
  buttons.forEach(b => {
    b.classList.toggle("active", b === active);
    b.setAttribute("aria-pressed", String(b === active));
  });
}

export function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
