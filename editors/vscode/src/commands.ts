// The wmpy commands. Each one works with the language server running, and
// most fall back to running wmpy directly when it is not.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { Binary } from "./binary";
import { run } from "./cli";
import { Server } from "./client";
import { folderName, TEMPLATES } from "./manifest";
import { PluginIndex } from "./plugins";
import { Previews } from "./preview";
import { pointPylance, writeStubs } from "./stubs";
import { Tests } from "./testing";
import { CheckReport, parseJsonOutput } from "./testReport";

export interface Parts {
  context: vscode.ExtensionContext;
  log: vscode.LogOutputChannel;
  binary: Binary;
  plugins: PluginIndex;
  server: Server;
  previews: Previews;
  tests: Tests;
  restart: () => Promise<void>;
}

/** Opens [command] (`[exe, ...args]`) in a terminal named after the plugin. */
export function openTerminal(name: string, command: readonly string[], cwd: string): vscode.Terminal {
  const terminal = vscode.window.createTerminal({ name, shellPath: command[0], shellArgs: command.slice(1), cwd });
  terminal.show();
  return terminal;
}

export function register(p: Parts): void {
  const exe = () => p.binary.resolve(true);
  const add = (id: string, fn: (...args: any[]) => unknown) => p.context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  add("wmpy.newPlugin", async (uri?: vscode.Uri) => {
    const template = await vscode.window.showQuickPick(
      TEMPLATES.map((t) => ({ label: t.label, detail: t.detail, id: t.id })),
      { placeHolder: "Start from a template", matchOnDetail: true },
    );
    if (!template) return;
    const name = await vscode.window.showInputBox({
      prompt: "The plugin's name, shown in the keyboard",
      value: template.id === "blank" ? "My plugin" : template.label,
      validateInput: (v) => (!v.trim() ? "Type a name" : v.trim().length > 40 ? "Up to 40 characters" : undefined),
    });
    if (!name) return;
    let parent = uri && fs.existsSync(uri.fsPath) && fs.statSync(uri.fsPath).isDirectory() ? uri : vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!parent) {
      const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: "Make it here" });
      parent = picked?.[0];
    }
    if (!parent) return;
    const dir = path.join(parent.fsPath, folderName(name));
    if (fs.existsSync(dir)) {
      vscode.window.showErrorMessage(`${dir} already exists.`);
      return;
    }
    const program = await exe();
    if (!program) return;
    const ran = await run(program, ["new", dir, "--template", template.id, "--name", name.trim()]);
    p.log.info(`wmpy new ${dir}: ${ran.code}\n${ran.stdout}${ran.stderr}`);
    if (ran.code !== 0) {
      vscode.window.showErrorMessage(`wmpy new failed: ${(ran.stderr || ran.stdout).trim()}`);
      return;
    }
    const main = vscode.Uri.file(path.join(dir, "main.py"));
    if (vscode.workspace.getWorkspaceFolder(main)) {
      await p.plugins.refresh();
      await vscode.window.showTextDocument(main);
    } else {
      const open = "Open Folder";
      const addIt = "Add to Workspace";
      const pick = await vscode.window.showInformationMessage(`Made ${name} in ${dir}.`, open, addIt);
      if (pick === open) await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(dir));
      if (pick === addIt) vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, 0, { uri: vscode.Uri.file(dir) });
    }
  });

  add("wmpy.openPreview", async (uri?: vscode.Uri) => {
    const root = await p.plugins.pick(uri);
    if (!root || p.previews.reveal(root)) return;
    const title = p.plugins.label(root);
    try {
      const answer = (await p.server.command("wmpy.preview", root)) as { url?: string } | undefined;
      if (answer?.url) {
        await p.previews.show(root, answer.url, title);
        return;
      }
      const program = await exe();
      if (program) await p.previews.startAndShow(program, root, title);
    } catch (e) {
      p.log.error(`Preview failed: ${String(e)}`);
      vscode.window.showErrorMessage(`The preview did not start: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  add("wmpy.runInTerminal", async (uri?: vscode.Uri) => {
    const root = await p.plugins.pick(uri);
    if (!root) return;
    const answer = (await p.server.command("wmpy.run", root).catch(() => undefined)) as { command?: string[] } | undefined;
    const program = answer?.command?.length ? undefined : await exe();
    const command = answer?.command?.length ? answer.command : program ? [program, "run", root] : undefined;
    if (command) openTerminal(`wmpy run: ${p.plugins.label(root)}`, command, root);
  });

  add("wmpy.runTests", async (uri?: vscode.Uri) => {
    const root = await p.plugins.pick(uri);
    if (!root) return;
    const report = await p.tests.runFor(root);
    if (report) {
      const text = `${p.plugins.label(root)}: ${report.passed} passed, ${report.failed} failed`;
      if (report.ok) vscode.window.setStatusBarMessage(`$(pass) ${text}`, 5000);
      else {
        const show = "Show Results";
        if ((await vscode.window.showWarningMessage(text, show)) === show) await vscode.commands.executeCommand("workbench.view.testing.focus");
      }
    }
  });

  const checkDiagnostics = vscode.languages.createDiagnosticCollection("wmpy check");
  p.context.subscriptions.push(checkDiagnostics);
  add("wmpy.checkPlugin", async (uri?: vscode.Uri) => {
    const root = await p.plugins.pick(uri);
    if (!root) return;
    // The server republishes the folder's problems itself and answers with counts.
    const answer = (await p.server.command("wmpy.check", root).catch(() => undefined)) as { errors?: number; warnings?: number } | undefined;
    let errors: number;
    let warnings: number;
    if (answer && typeof answer.errors === "number") {
      errors = answer.errors;
      warnings = answer.warnings ?? 0;
    } else {
      const program = await exe();
      if (!program) return;
      const ran = await run(program, ["check", root, "--json"], { cwd: root });
      const report = parseJsonOutput<CheckReport>(ran.stdout);
      if (!report || !Array.isArray(report.problems)) {
        vscode.window.showErrorMessage(`wmpy check failed: ${(ran.stderr || ran.stdout).trim()}`);
        return;
      }
      showCheck(checkDiagnostics, root, report);
      errors = report.errors;
      warnings = report.warnings;
    }
    const text = `${p.plugins.label(root)}: ${errors} errors, ${warnings} warnings`;
    if (errors === 0 && warnings === 0) {
      vscode.window.setStatusBarMessage(`$(pass) ${text}`, 5000);
      return;
    }
    const show = "Show Problems";
    if ((await vscode.window.showWarningMessage(text, show)) === show) await vscode.commands.executeCommand("workbench.actions.view.problems");
  });

  add("wmpy.packPlugin", async (uri?: vscode.Uri) => {
    const root = await p.plugins.pick(uri);
    if (!root) return;
    let packed = (await p.server.command("wmpy.pack", root).catch(() => undefined)) as { path?: string; sha256?: string; size?: number } | undefined;
    if (!packed?.path) {
      const program = await exe();
      if (!program) return;
      const ran = await run(program, ["pack", root], { cwd: root });
      if (ran.code !== 0) {
        vscode.window.showErrorMessage(`wmpy pack failed: ${(ran.stderr || ran.stdout).trim()}`);
        return;
      }
      vscode.window.showInformationMessage((ran.stdout || ran.stderr).trim() || "Packed.");
      return;
    }
    const reveal = "Reveal";
    const copy = "Copy SHA-256";
    const size = packed.size !== undefined ? ` (${Math.max(1, Math.round(packed.size / 1024))} KB)` : "";
    const pick = await vscode.window.showInformationMessage(`Packed ${path.basename(packed.path)}${size}.`, reveal, copy);
    if (pick === reveal) await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(packed.path));
    if (pick === copy && packed.sha256) await vscode.env.clipboard.writeText(packed.sha256);
  });

  const pip = async (verb: "install" | "remove", uri?: vscode.Uri) => {
    const root = await p.plugins.pick(uri);
    if (!root) return;
    const name = await vscode.window.showInputBox({
      prompt: verb === "install" ? "A pure-Python package from PyPI, such as python-dateutil or humanize==4.9" : "The package to take out of the plugin",
      validateInput: (v) => (/^[A-Za-z0-9][A-Za-z0-9._\-\[\],<>=!~ ]*$/.test(v.trim()) ? undefined : "A package name"),
    });
    if (!name) return;
    const program = await exe();
    if (program) openTerminal(`wmpy pip: ${p.plugins.label(root)}`, [program, "pip", verb, ...name.trim().split(/\s+/)], root);
  };
  add("wmpy.pipInstall", (uri?: vscode.Uri) => pip("install", uri));
  add("wmpy.pipRemove", (uri?: vscode.Uri) => pip("remove", uri));

  add("wmpy.publishPlugin", async (uri?: vscode.Uri) => {
    const root = await p.plugins.pick(uri);
    const program = root ? await exe() : undefined;
    if (root && program) openTerminal(`wmpy publish: ${p.plugins.label(root)}`, [program, "publish", root], root);
  });

  add("wmpy.writeStubs", async (uri?: vscode.Uri) => {
    const root = await p.plugins.pick(uri);
    const program = root ? await exe() : undefined;
    if (!root || !program) return;
    if (await writeStubs(program, root, p.log)) {
      vscode.window.setStatusBarMessage("$(pass) Wrote .wmpy/stubs", 5000);
      await pointPylance(root, true);
    }
  });

  add("wmpy.restartServer", () => p.restart());
  add("wmpy.showOutput", () => p.log.show());
  add("wmpy.downloadBinary", async () => {
    const got = await p.binary.download();
    if (got) await p.restart();
  });

  add("wmpy.showMenu", async () => {
    const items: (vscode.QuickPickItem & { command: string })[] = [
      { label: "$(open-preview) Preview", command: "wmpy.openPreview" },
      { label: "$(terminal) Run in Terminal", command: "wmpy.runInTerminal" },
      { label: "$(beaker) Run Tests", command: "wmpy.runTests" },
      { label: "$(checklist) Check", command: "wmpy.checkPlugin" },
      { label: "$(package) Pack .wmplugin", command: "wmpy.packPlugin" },
      { label: "$(cloud-upload) Publish", command: "wmpy.publishPlugin" },
      { label: "$(add) pip install…", command: "wmpy.pipInstall" },
      { label: "$(new-folder) New Plugin…", command: "wmpy.newPlugin" },
      { label: "$(refresh) Restart Language Server", command: "wmpy.restartServer" },
      { label: "$(output) Show Output", command: "wmpy.showOutput" },
    ];
    const pick = await vscode.window.showQuickPick(items, { placeHolder: "wmpy" });
    if (pick) await vscode.commands.executeCommand(pick.command);
  });
}

/** Puts a CLI check's problems in the Problems view, when the server is not there to. */
function showCheck(collection: vscode.DiagnosticCollection, root: string, report: CheckReport): void {
  collection.clear();
  const byFile = new Map<string, vscode.Diagnostic[]>();
  for (const d of report.problems) {
    const file = d.file ? (path.isAbsolute(d.file) ? d.file : path.join(root, d.file)) : path.join(root, "plugin.json");
    const line = Math.max(0, (d.line ?? 1) - 1);
    const col = Math.max(0, (d.col ?? 1) - 1);
    const end = d.endCol ? Math.max(col + 1, d.endCol - 1) : col + 1;
    const severity =
      d.severity === "error"
        ? vscode.DiagnosticSeverity.Error
        : d.severity === "warning"
          ? vscode.DiagnosticSeverity.Warning
          : d.severity === "hint"
            ? vscode.DiagnosticSeverity.Hint
            : vscode.DiagnosticSeverity.Information;
    const diag = new vscode.Diagnostic(new vscode.Range(line, col, line, end), d.help ? `${d.message}\nhelp: ${d.help}` : d.message, severity);
    diag.source = "wmpy";
    if (d.code) diag.code = d.code;
    byFile.set(file, [...(byFile.get(file) ?? []), diag]);
  }
  for (const [file, diags] of byFile) collection.set(vscode.Uri.file(file), diags);
}
