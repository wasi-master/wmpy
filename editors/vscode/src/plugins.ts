// The plugin folders in the workspace: every folder whose plugin.json is a
// WM Keyboard manifest. Keeps the wmpy.hasPlugins and wmpy.inPlugin context
// keys up to date.

import * as path from "node:path";
import * as vscode from "vscode";
import { ManifestInfo, pluginRootFor, readManifest } from "./manifest";

const EXCLUDE = "**/{node_modules,.git,.wmpy,.venv,venv,build,dist,out,target}/**";

export interface Plugin extends ManifestInfo {
  root: string;
}

export class PluginIndex implements vscode.Disposable {
  private plugins = new Map<string, Plugin>();
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private readonly disposables: vscode.Disposable[] = [];
  private timer: NodeJS.Timeout | undefined;

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher("**/plugin.json");
    this.disposables.push(
      watcher,
      watcher.onDidCreate(() => this.schedule()),
      watcher.onDidChange(() => this.schedule()),
      watcher.onDidDelete(() => this.schedule()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.schedule()),
      vscode.window.onDidChangeActiveTextEditor(() => this.updateActive()),
      this.changed,
    );
  }

  dispose(): void {
    clearTimeout(this.timer);
    for (const d of this.disposables) d.dispose();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(), 300);
  }

  /** Looks for plugin.json files again. */
  async refresh(): Promise<void> {
    const found = new Map<string, Plugin>();
    const files = await vscode.workspace.findFiles("**/plugin.json", EXCLUDE, 500);
    for (const uri of files) {
      if (uri.scheme !== "file") continue;
      try {
        const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
        const info = readManifest(text);
        if (info) {
          const root = path.dirname(uri.fsPath);
          found.set(root, { ...info, root });
        }
      } catch {
        // unreadable: not a plugin we can work with
      }
    }
    const before = [...this.plugins.keys()].sort().join("\n");
    const after = [...found.keys()].sort().join("\n");
    const names = (m: Map<string, Plugin>) => [...m.values()].map((p) => `${p.root}=${p.name}`).sort().join("\n");
    const renamed = names(this.plugins) !== names(found);
    this.plugins = found;
    await vscode.commands.executeCommand("setContext", "wmpy.hasPlugins", found.size > 0);
    this.updateActive();
    if (before !== after || renamed) this.changed.fire();
  }

  all(): Plugin[] {
    return [...this.plugins.values()].sort((a, b) => a.root.localeCompare(b.root));
  }

  roots(): string[] {
    return this.all().map((p) => p.root);
  }

  get(root: string): Plugin | undefined {
    return this.plugins.get(root);
  }

  /** The plugin [uri] is in, if any. */
  rootFor(uri: vscode.Uri | undefined): string | undefined {
    if (!uri || uri.scheme !== "file") return undefined;
    return pluginRootFor(uri.fsPath, this.roots());
  }

  label(root: string): string {
    const p = this.plugins.get(root);
    return p?.name || path.basename(root);
  }

  private updateActive(): void {
    const root = this.rootFor(vscode.window.activeTextEditor?.document.uri);
    void vscode.commands.executeCommand("setContext", "wmpy.inPlugin", !!root);
  }

  /**
   * The plugin a command acts on: the one [uri] (an explorer click) or the
   * active editor is in, the only one, or the one the user picks.
   */
  async pick(uri?: vscode.Uri, placeHolder = "Which plugin?"): Promise<string | undefined> {
    const fromUri = uri ? this.rootFor(uri) ?? (path.basename(uri.fsPath) === "plugin.json" ? path.dirname(uri.fsPath) : undefined) : undefined;
    if (fromUri) return fromUri;
    const active = this.rootFor(vscode.window.activeTextEditor?.document.uri);
    if (active) return active;
    if (this.plugins.size === 0) await this.refresh();
    const all = this.all();
    if (all.length === 1) return all[0].root;
    if (all.length === 0) {
      const create = "New Plugin";
      const choice = await vscode.window.showWarningMessage("No plugin.json in this workspace.", create);
      if (choice === create) await vscode.commands.executeCommand("wmpy.newPlugin");
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(
      all.map((p) => ({ label: p.name || path.basename(p.root), description: vscode.workspace.asRelativePath(p.root), root: p.root })),
      { placeHolder },
    );
    return picked?.root;
  }
}
