// wmpy for VS Code and its forks: the language server, the preview panel,
// the Test Explorer and the wmpy commands for WM Keyboard plugin folders.

import * as vscode from "vscode";
import { Binary } from "./binary";
import { run } from "./cli";
import { Server, ServerState } from "./client";
import { openTerminal, register } from "./commands";
import { PluginIndex } from "./plugins";
import { Previews } from "./preview";
import { offerStubs } from "./stubs";
import { Tests } from "./testing";

let server: Server | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = vscode.window.createOutputChannel("wmpy", { log: true });
  const binary = new Binary(context, log);
  const plugins = new PluginIndex();
  const previews = new Previews(log);
  const tests = new Tests(plugins, () => binary.resolve(true), log);
  server = new Server(log, {
    preview: (root, url) => previews.show(root, url, plugins.label(root)),
    test: (root, filter) => tests.runFor(root, filter),
    run: (root, command) => void openTerminal(`wmpy run: ${plugins.label(root)}`, command, root),
  });
  const status = vscode.window.createStatusBarItem("wmpy.status", vscode.StatusBarAlignment.Left, 50);
  status.name = "wmpy";
  status.command = "wmpy.showMenu";
  context.subscriptions.push(log, plugins, previews, tests, server, status);

  let version = "";
  const showStatus = (state: ServerState) => {
    const icon = { stopped: "$(circle-slash)", starting: "$(sync~spin)", running: "$(plug)", failed: "$(error)" }[state];
    status.text = `${icon} wmpy`;
    const tip = new vscode.MarkdownString(undefined, true);
    tip.appendMarkdown(`**wmpy** ${version}\n\nLanguage server: ${state}\n\n${plugins.all().length} plugin folder(s)`);
    status.tooltip = tip;
    status.backgroundColor = state === "failed" ? new vscode.ThemeColor("statusBarItem.errorBackground") : undefined;
    if (plugins.all().length > 0) status.show();
    else status.hide();
  };
  context.subscriptions.push(server.onDidChangeState(showStatus));

  let restarting: Promise<void> = Promise.resolve();
  const restart = (): Promise<void> => {
    restarting = restarting.then(async () => {
      if (!vscode.workspace.isTrusted) return;
      const roots = plugins.roots();
      if (roots.length === 0) {
        await server?.stop();
        return;
      }
      const exe = await binary.resolve(true);
      if (!exe) {
        showStatus("failed");
        return;
      }
      const v = await run(exe, ["--version"]);
      version = v.stdout.trim().replace(/^wmpy\s+/, "");
      log.info(`Using ${exe} (${version || v.stderr.trim()})`);
      await server?.start(exe, roots);
    });
    return restarting;
  };

  register({ context, log, binary, plugins, server, previews, tests, restart });

  let rootsKey = "";
  context.subscriptions.push(
    plugins.onDidChange(() => {
      const key = plugins.roots().join("\n");
      showStatus(server?.state ?? "stopped");
      if (key !== rootsKey) {
        rootsKey = key;
        void restart();
        void offerStubs(context, plugins.roots(), () => binary.resolve(true), log);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("wmpy.path")) {
        binary.reset();
        void restart();
      }
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => void restart()),
  );

  await plugins.refresh();
  rootsKey = plugins.roots().join("\n");
  showStatus("stopped");
  if (plugins.roots().length) {
    void restart();
    void offerStubs(context, plugins.roots(), () => binary.resolve(true), log);
  }
}

export async function deactivate(): Promise<void> {
  await server?.stop();
}
