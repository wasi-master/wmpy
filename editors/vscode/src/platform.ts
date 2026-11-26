// Which wmpy release asset fits this machine, and where it is. No vscode
// import here, so the unit tests can load it.

export interface Target {
  /** The Rust target triple the release CI builds. */
  triple: string;
  archive: "tar.gz" | "zip";
  /** The program's file name inside the archive. */
  exe: string;
}

const TRIPLES: Record<string, string> = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-musl",
  "linux-arm64": "aarch64-unknown-linux-musl",
  "win32-x64": "x86_64-pc-windows-msvc",
  "win32-arm64": "aarch64-pc-windows-msvc",
};

/** The release build for [platform] and [arch] (Node's names), or undefined when there is none. */
export function targetFor(platform: string, arch: string): Target | undefined {
  const triple = TRIPLES[`${platform}-${arch}`];
  if (!triple) return undefined;
  const windows = platform === "win32";
  return { triple, archive: windows ? "zip" : "tar.gz", exe: windows ? "wmpy.exe" : "wmpy" };
}

/** `wmpy-aarch64-apple-darwin.tar.gz`: the asset name, the same in every release. */
export function assetName(t: Target): string {
  return `wmpy-${t.triple}.${t.archive}`;
}

export const RELEASES = "https://github.com/wasi-master/wmpy/releases";

/** The download URL of [asset] in release [tag] (`v0.1.0`), or in the latest release. */
export function releaseUrl(asset: string, tag?: string): string {
  return tag ? `${RELEASES}/download/${tag}/${asset}` : `${RELEASES}/latest/download/${asset}`;
}

/** The tag of the wmpy release built with this extension version; none for a development build. */
export function tagFor(extensionVersion: string): string | undefined {
  return /^\d+\.\d+\.\d+$/.test(extensionVersion) && extensionVersion !== "0.0.0" ? `v${extensionVersion}` : undefined;
}

/**
 * The SHA-256 in a `.sha256` file: `<hex>  <name>` as `sha256sum` writes it,
 * or the hex alone. With [name], a line naming another file is skipped.
 */
export function parseSha256(text: string, name?: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([0-9a-fA-F]{64})(?:\s+\*?(.+?))?\s*$/.exec(line);
    if (!m) continue;
    if (name && m[2] && m[2].trim() !== name) continue;
    return m[1].toLowerCase();
  }
  return undefined;
}

/**
 * The first file called [exe] on [pathEnv], checked with [isFile]. On Windows
 * the PATHEXT endings are tried too, so `wmpy` finds `wmpy.exe`.
 */
export function findOnPath(
  exe: string,
  pathEnv: string,
  isFile: (p: string) => boolean,
  platform: string = process.platform,
  pathExt: string = process.env.PATHEXT ?? ".EXE;.CMD;.BAT",
): string | undefined {
  const sep = platform === "win32" ? ";" : ":";
  const slash = platform === "win32" ? "\\" : "/";
  const endings = platform === "win32" ? ["", ...pathExt.split(";").map((e) => e.toLowerCase())] : [""];
  for (const raw of pathEnv.split(sep)) {
    const dir = raw.trim().replace(/^"(.*)"$/, "$1");
    if (!dir) continue;
    for (const end of endings) {
      const candidate = dir.replace(/[\\/]+$/, "") + slash + exe + end;
      if (isFile(candidate)) return candidate;
    }
  }
  return undefined;
}
