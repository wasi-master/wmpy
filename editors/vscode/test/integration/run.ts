// Downloads VS Code (cached in .vscode-test), makes a plugin workspace with a
// fake wmpy on wmpy.path, and runs suite.ts inside it.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  const extension = path.resolve(__dirname, "../../..");
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "wmpy-vscode-"));
  const fake = path.join(__dirname, "fakeWmpy.js");
  const windows = process.platform === "win32";
  const wrapper = path.join(workspace, ".fake", windows ? "wmpy.cmd" : "wmpy");
  fs.mkdirSync(path.dirname(wrapper), { recursive: true });
  fs.writeFileSync(
    wrapper,
    windows ? `@"${process.execPath}" "${fake}" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`,
    { mode: 0o755 },
  );
  const manifest = { format: "wmkeyboard-plugin", id: "com.example.upper", name: "Upper", pluginVersion: "1.0.0", apiVersion: 5, permissions: [] };
  fs.writeFileSync(path.join(workspace, "plugin.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(workspace, "main.py"), "from wm import plugin, ui\n\ndef render():\n    ui.title('Upper')\n");
  fs.writeFileSync(path.join(workspace, "test.py"), "def test_upper():\n    assert 'a'.upper() == 'A'\n\ndef test_lower():\n    assert 'A'.lower() == 'b'\n");
  fs.mkdirSync(path.join(workspace, "bad"));
  fs.writeFileSync(path.join(workspace, "bad", "plugin.json"), JSON.stringify({ ...manifest, id: "com.example.bad", permissions: ["teleport"] }, null, 2));
  fs.mkdirSync(path.join(workspace, ".vscode"));
  fs.writeFileSync(path.join(workspace, ".vscode", "settings.json"), JSON.stringify({ "wmpy.path": wrapper, "wmpy.offerStubs": false }));
  const log = path.join(workspace, ".fake", "log.txt");
  await runTests({
    extensionDevelopmentPath: extension,
    extensionTestsPath: path.join(__dirname, "suite.js"),
    launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes"],
    extensionTestsEnv: { WMPY_FAKE_LOG: log },
    // An idle timeout for the VS Code download; slow links need more than the default 15 s.
    timeout: 120000,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
