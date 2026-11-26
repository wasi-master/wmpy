import assert from "node:assert/strict";
import { test } from "node:test";
import { run, startForLine } from "../../src/cli";

test("run collects stdout, stderr and the exit code", async () => {
  const ran = await run(process.execPath, ["-e", "console.log('out'); console.error('err'); process.exit(3)"]);
  assert.deepEqual(ran, { code: 3, stdout: "out\n", stderr: "err\n" });
  const missing = await run("/no/such/wmpy", ["--version"]);
  assert.equal(missing.code, -1);
});

test("startForLine resolves on the first line and leaves the process running", async () => {
  const script = "console.log(JSON.stringify({url: 'http://127.0.0.1:1/?t=x', port: 1})); setInterval(() => {}, 1000)";
  const started = await startForLine(process.execPath, ["-e", script]);
  assert.equal(JSON.parse(started.line).url, "http://127.0.0.1:1/?t=x");
  started.kill();
  await assert.rejects(startForLine(process.execPath, ["-e", "console.error('no port'); process.exit(2)"]), /no port/);
  await assert.rejects(startForLine(process.execPath, ["-e", "setInterval(() => {}, 1000)"], undefined, 300), /printed nothing/);
});
