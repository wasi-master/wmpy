import assert from "node:assert/strict";
import { test } from "node:test";
import { crlf, failureText, findTests, isTestFile, isTestReport, parseJsonOutput } from "../../src/testReport";

const REPORT = {
  ok: false,
  passed: 1,
  failed: 1,
  durationMs: 12,
  tests: [
    { file: "test.py", name: "test_a", ok: true, durationMs: 3, output: "", error: null },
    {
      file: "tests/test_b.py",
      name: "test_b",
      ok: false,
      durationMs: 4,
      output: "hi\n",
      error: { severity: "error", code: "ValueError", message: "bad", file: "tests/test_b.py", line: 3, col: 5, endCol: 9, traceback: "line 3", notes: ["n"], help: "h" },
    },
  ],
};

test("the report is read whole or from the last JSON line", () => {
  assert.deepEqual(parseJsonOutput(JSON.stringify(REPORT)), REPORT);
  assert.deepEqual(parseJsonOutput(`printed by the plugin\n{not json\n${JSON.stringify(REPORT)}\n`), REPORT);
  assert.equal(parseJsonOutput(""), undefined);
  assert.equal(parseJsonOutput("no json here"), undefined);
  assert.ok(isTestReport(REPORT));
  assert.ok(!isTestReport({ ok: true }));
});

test("test files are test.py, test_*.py, *_test.py and anything under tests/", () => {
  for (const f of ["test.py", "test_cipher.py", "cipher_test.py", "tests/cases.py", "tests/deep/test_x.py"]) assert.ok(isTestFile(f), f);
  for (const f of ["main.py", "helpers/test_x.py", "tests.json", "testing.py", "lib/test.py"]) assert.ok(!isTestFile(f), f);
});

test("test functions are the top-level def test_*", () => {
  const src = "import x\n\ndef test_one():\n    pass\n\n    def test_nested():\n        pass\ndef helper():\n    pass\ndef test_two (a=1):\n    pass\nclass T:\n    def test_m(self): pass\n";
  assert.deepEqual(findTests(src), [
    { name: "test_one", line: 2 },
    { name: "test_two", line: 9 },
  ]);
});

test("a failure reads as message, traceback, notes and help", () => {
  assert.equal(failureText(REPORT.tests[1].error!), "bad [ValueError]\n\nline 3\n\nnote: n\n\nhelp: h");
  assert.equal(crlf("a\nb\r\nc"), "a\r\nb\r\nc");
});
