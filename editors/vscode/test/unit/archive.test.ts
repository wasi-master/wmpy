import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { extractFile } from "../../src/archive";

function workdir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wmpy-archive-"));
  fs.mkdirSync(path.join(dir, "wmpy-1.0"));
  fs.writeFileSync(path.join(dir, "wmpy-1.0", "wmpy"), "#!/bin/sh\necho wmpy\n");
  fs.writeFileSync(path.join(dir, "wmpy-1.0", "LICENSE"), "MIT");
  fs.writeFileSync(path.join(dir, "wmpy-1.0", "wmpy.exe"), Buffer.alloc(70000, 7));
  return dir;
}

test("a file comes out of a tar.gz, inside a folder or not", () => {
  const dir = workdir();
  const tgz = path.join(dir, "a.tar.gz");
  execFileSync("tar", ["-czf", tgz, "-C", dir, "wmpy-1.0"]);
  const got = extractFile(fs.readFileSync(tgz), "tar.gz", "wmpy");
  assert.equal(got?.toString(), "#!/bin/sh\necho wmpy\n");
  assert.equal(extractFile(fs.readFileSync(tgz), "tar.gz", "missing"), undefined);
  const flat = path.join(dir, "b.tar.gz");
  execFileSync("tar", ["-czf", flat, "-C", path.join(dir, "wmpy-1.0"), "LICENSE", "wmpy"]);
  assert.equal(extractFile(fs.readFileSync(flat), "tar.gz", "LICENSE")?.toString(), "MIT");
});

test("a file comes out of a zip, stored or deflated", (t) => {
  const dir = workdir();
  const zip = path.join(dir, "a.zip");
  const script = [
    "import sys, zipfile",
    "z = zipfile.ZipFile(sys.argv[1], 'w')",
    "z.write(sys.argv[2], 'wmpy-1.0/wmpy.exe', zipfile.ZIP_DEFLATED)",
    "z.write(sys.argv[3], 'LICENSE', zipfile.ZIP_STORED)",
    "z.close()",
  ].join("\n");
  try {
    execFileSync("python3", ["-c", script, zip, path.join(dir, "wmpy-1.0", "wmpy.exe"), path.join(dir, "wmpy-1.0", "LICENSE")]);
  } catch {
    t.skip("python3 is not available to make the zip");
    return;
  }
  const bytes = fs.readFileSync(zip);
  assert.deepEqual(extractFile(bytes, "zip", "wmpy.exe"), Buffer.alloc(70000, 7));
  assert.equal(extractFile(bytes, "zip", "LICENSE")?.toString(), "MIT");
  assert.equal(extractFile(bytes, "zip", "nope"), undefined);
  assert.throws(() => extractFile(Buffer.from("plain"), "zip", "x"));
});
