// Runs inside VS Code: the extension activates for a plugin folder, starts
// the language server, opens a preview, runs tests and checks plugin.json.

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

const logFile = () => process.env.WMPY_FAKE_LOG!;
const logged = () => (fs.existsSync(logFile()) ? fs.readFileSync(logFile(), "utf8") : "");

async function until<T>(what: string, check: () => T | undefined | false | Promise<T | undefined | false>, ms = 20000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}\n--- fake wmpy log ---\n${logged()}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

const cases: [string, () => Promise<void>][] = [
  [
    "the extension activates and starts wmpy lsp with preview: client",
    async () => {
      const ext = vscode.extensions.getExtension("wasimaster.wmpy");
      assert.ok(ext, "extension is installed");
      await ext.activate();
      await until("initialize", () => logged().includes("lsp initialize"));
      assert.match(logged(), /init \{"preview":"client"\}/);
    },
  ],
  [
    "Preview opens a webview beside the editor",
    async () => {
      const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
      await vscode.commands.executeCommand("wmpy.openPreview", vscode.Uri.file(path.join(root, "plugin.json")));
      await until("wmpy.preview", () => logged().includes("lsp workspace/executeCommand wmpy.preview"));
      await until("a preview tab", () =>
        vscode.window.tabGroups.all
          .flatMap((g) => g.tabs)
          .some((t) => t.input instanceof vscode.TabInputWebview && t.input.viewType.includes("wmpy.preview")),
      );
    },
  ],
  [
    "Run Tests runs wmpy test --json for the plugin",
    async () => {
      const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
      await vscode.commands.executeCommand("wmpy.runTests", vscode.Uri.file(path.join(root, "plugin.json")));
      await until("wmpy test", () => logged().includes(`argv test ${root} --json`));
    },
  ],
  [
    "Check goes through the language server",
    async () => {
      const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
      await vscode.commands.executeCommand("wmpy.checkPlugin", vscode.Uri.file(path.join(root, "plugin.json")));
      await until("wmpy.check", () => logged().includes("lsp workspace/executeCommand wmpy.check"));
    },
  ],
  [
    "the schema flags an unknown permission in plugin.json",
    async () => {
      const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, "bad", "plugin.json")));
      await vscode.window.showTextDocument(doc);
      const diags = await until("schema diagnostics", () => {
        const d = vscode.languages.getDiagnostics(doc.uri);
        return d.length ? d : undefined;
      });
      assert.ok(diags.some((d) => /teleport|Value is not accepted/i.test(d.message)), diags.map((d) => d.message).join("; "));
    },
  ],
];

export async function run(): Promise<void> {
  let failed = 0;
  for (const [name, fn] of cases) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${name}\n${e instanceof Error ? e.stack : String(e)}`);
    }
  }
  if (failed) throw new Error(`${failed} of ${cases.length} integration tests failed`);
}
