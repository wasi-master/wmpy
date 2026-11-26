#!/usr/bin/env node
// Runs the wmpy program from the @wmpy/<platform> package npm installed next
// to this one (one per OS and CPU, as optional dependencies). $WMPY_BINARY
// points at another wmpy instead.

"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

function binary() {
  if (process.env.WMPY_BINARY) return process.env.WMPY_BINARY;
  const pkg = `@wmpy/${process.platform}-${process.arch}`;
  const exe = process.platform === "win32" ? "wmpy.exe" : "wmpy";
  try {
    return path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "bin", exe);
  } catch {
    console.error(
      `wmpy: ${pkg} is not installed. npm skips it when optional dependencies are off ` +
        `(--omit=optional), and there is none for ${process.platform} on ${process.arch}. ` +
        "Other ways to install wmpy: https://wmkeyboard.pages.dev/plugins/wmpy/",
    );
    process.exit(2);
  }
}

const result = spawnSync(binary(), process.argv.slice(2), { stdio: "inherit", windowsHide: false });
if (result.error) {
  console.error(`wmpy: ${result.error.message}`);
  process.exit(2);
}
if (result.signal) process.kill(process.pid, result.signal);
process.exit(result.status ?? 1);
