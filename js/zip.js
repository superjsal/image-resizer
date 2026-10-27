// Minimal ZIP writer. JPG/WebP are already compressed, so files are stored
// as-is ("store" method) — no compression library needed and it's instant.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// MS-DOS date/time format used by ZIP headers.
function dosDateTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// files: [{ name, blob }] → Blob (application/zip). Names must be unique.
export async function makeZip(files, now = new Date()) {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const parts = [];
  const central = [];
  let offset = 0;

  for (const { name, blob } of files) {
    const nameBytes = enc.encode(name);
    const data = new Uint8Array(await blob.arrayBuffer());
    const crc = crc32(data);
    const size = data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);   // local file header signature
    local.setUint16(4, 20, true);           // version needed
    local.setUint16(6, 0x0800, true);       // flags: UTF-8 file names
    local.setUint16(8, 0, true);            // method: store
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);        // compressed size
    local.setUint32(22, size, true);        // uncompressed size
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);           // extra field length
    parts.push(local, nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);      // central directory signature
    cd.setUint16(4, 20, true);              // version made by
    cd.setUint16(6, 20, true);              // version needed
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);         // offset of local header (other fields stay 0)
    central.push(cd, nameBytes);

    offset += 30 + nameBytes.length + size;
  }

  const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);       // end of central directory signature
  end.setUint16(8, files.length, true);     // entries on this disk
  end.setUint16(10, files.length, true);    // total entries
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);          // central directory offset

  return new Blob([...parts, ...central, end], { type: "application/zip" });
}

// Makes names unique within one export: photo.jpg, photo-2.jpg, photo-3.jpg…
export function uniqueNames(names) {
  const used = new Set();
  return names.map(name => {
    let out = name;
    for (let n = 2; used.has(out.toLowerCase()); n++) out = name.replace(/(\.[^.]+)$/, `-${n}$1`);
    used.add(out.toLowerCase());
    return out;
  });
}
