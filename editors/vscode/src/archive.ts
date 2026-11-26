// Reads one file out of a release archive: a .tar.gz (macOS, Linux) or a
// .zip (Windows). Small on purpose: the release archives hold a few plain
// files, so this needs no dependency.

import { gunzipSync, inflateRawSync } from "node:zlib";

/** The bytes of the file whose base name is [name], or undefined when the archive has none. */
export function extractFile(archive: Buffer, kind: "tar.gz" | "zip", name: string): Buffer | undefined {
  return kind === "zip" ? fromZip(archive, name) : fromTar(gunzipSync(archive), name);
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter((p) => p.length > 0);
  return parts[parts.length - 1] ?? "";
}

function cString(buf: Buffer, start: number, length: number): string {
  const slice = buf.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end < 0 ? slice.length : end).toString("utf8");
}

export function fromTar(tar: Buffer, name: string): Buffer | undefined {
  let offset = 0;
  let longName: string | undefined;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const size = parseInt(cString(header, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 0x30);
    const prefix = cString(header, 345, 155);
    const path = longName ?? (prefix ? `${prefix}/${cString(header, 0, 100)}` : cString(header, 0, 100));
    longName = undefined;
    const dataStart = offset + 512;
    const data = tar.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;
    if (type === "L") {
      longName = cString(data, 0, data.length);
      continue;
    }
    if (type === "x") {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString("utf8"));
      if (m) longName = m[1];
      continue;
    }
    if ((type === "0" || type === "\0") && baseName(path) === name) return Buffer.from(data);
  }
  return undefined;
}

export function fromZip(zip: Buffer, name: string): Buffer | undefined {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("not a zip file");
  const entries = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < entries; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("bad zip central directory");
    const method = zip.readUInt16LE(p + 10);
    const compressed = zip.readUInt32LE(p + 20);
    const nameLength = zip.readUInt16LE(p + 28);
    const extraLength = zip.readUInt16LE(p + 30);
    const commentLength = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const entryName = zip.subarray(p + 46, p + 46 + nameLength).toString("utf8");
    p += 46 + nameLength + extraLength + commentLength;
    if (entryName.endsWith("/") || baseName(entryName) !== name) continue;
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error("bad zip entry");
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + compressed);
    if (method === 0) return Buffer.from(data);
    if (method === 8) return inflateRawSync(data);
    throw new Error(`zip method ${method} is not supported`);
  }
  return undefined;
}
