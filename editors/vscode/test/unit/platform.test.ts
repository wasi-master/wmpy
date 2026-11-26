import assert from "node:assert/strict";
import { test } from "node:test";
import { assetName, findOnPath, parseSha256, releaseUrl, tagFor, targetFor } from "../../src/platform";

test("every released platform has a target", () => {
  assert.equal(assetName(targetFor("darwin", "arm64")!), "wmpy-aarch64-apple-darwin.tar.gz");
  assert.equal(assetName(targetFor("darwin", "x64")!), "wmpy-x86_64-apple-darwin.tar.gz");
  assert.equal(assetName(targetFor("linux", "x64")!), "wmpy-x86_64-unknown-linux-musl.tar.gz");
  assert.equal(assetName(targetFor("linux", "arm64")!), "wmpy-aarch64-unknown-linux-musl.tar.gz");
  assert.equal(assetName(targetFor("win32", "x64")!), "wmpy-x86_64-pc-windows-msvc.zip");
  assert.equal(targetFor("win32", "arm64")!.exe, "wmpy.exe");
  assert.equal(targetFor("linux", "ia32"), undefined);
  assert.equal(targetFor("freebsd", "x64"), undefined);
});

test("release URLs name the tag or the latest release", () => {
  assert.equal(releaseUrl("a.zip", "v1.2.3"), "https://github.com/wasi-master/wmpy/releases/download/v1.2.3/a.zip");
  assert.equal(releaseUrl("a.zip"), "https://github.com/wasi-master/wmpy/releases/latest/download/a.zip");
  assert.equal(tagFor("1.2.3"), "v1.2.3");
  assert.equal(tagFor("0.0.0"), undefined);
  assert.equal(tagFor("1.2.3-dev"), undefined);
});

test("sha256 files are read as sha256sum writes them", () => {
  const hex = "a".repeat(64);
  assert.equal(parseSha256(`${hex}  wmpy-x.tar.gz\n`), hex);
  assert.equal(parseSha256(`${hex.toUpperCase()}\n`), hex);
  assert.equal(parseSha256(`${"b".repeat(64)}  other.zip\n${hex} *wmpy-x.tar.gz\n`, "wmpy-x.tar.gz"), hex);
  assert.equal(parseSha256("not a hash"), undefined);
});

test("PATH lookup finds the first match and tries PATHEXT on Windows", () => {
  const files = new Set(["/opt/b/wmpy", "/usr/bin/wmpy", "C:\\tools\\wmpy.exe"]);
  const isFile = (p: string) => files.has(p);
  assert.equal(findOnPath("wmpy", "/opt/a:/opt/b:/usr/bin", isFile, "linux"), "/opt/b/wmpy");
  assert.equal(findOnPath("wmpy", "/opt/a", isFile, "linux"), undefined);
  assert.equal(findOnPath("wmpy", 'C:\\x;"C:\\tools"', isFile, "win32", ".COM;.EXE"), "C:\\tools\\wmpy.exe");
});
