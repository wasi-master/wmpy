// The preview panel: a webview beside the editor showing the `wmpy preview`
// page for one plugin. The address goes through asExternalUri, so the page
// also shows in a remote window, a dev container and Codespaces.

import * as path from "node:path";
import * as vscode from "vscode";
import { startForLine } from "./cli";
import { embedUrl, makeNonce, previewHtml, themeFor } from "./previewHtml";

interface Open {
  panel: vscode.WebviewPanel;
  /** The page's address on the machine wmpy runs on. */
  url: string;
  /** Stops a `wmpy preview` this extension started itself. */
  kill?: () => void;
}

export class Previews implements vscode.Disposable {
  private readonly open = new Map<string, Open>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly log: vscode.LogOutputChannel) {
    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme(() => void this.retheme()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("wmpy.preview.theme")) void this.retheme();
      }),
    );
  }

  dispose(): void {
    for (const o of this.open.values()) {
      o.kill?.();
      o.panel.dispose();
    }
    this.open.clear();
    for (const d of this.disposables) d.dispose();
  }

  private theme() {
    return themeFor(vscode.window.activeColorTheme.kind, vscode.workspace.getConfiguration("wmpy").get("preview.theme", "auto"));
  }

  /** The panel for [root], if one is open: brought to the front. */
  reveal(root: string): boolean {
    const o = this.open.get(root);
    if (!o) return false;
    o.panel.reveal(undefined, true);
    return true;
  }

  /**
   * Starts `wmpy preview` for [root] without the language server and shows
   * it. The process stops when the panel closes.
   */
  async startAndShow(exe: string, root: string, title: string): Promise<void> {
    if (this.reveal(root)) return;
    const started = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: `Starting the preview of ${title}` },
      () => startForLine(exe, ["preview", root, "--port", "0", "--no-open", "--print-url"], root),
    );
    let url: string;
    try {
      url = String((JSON.parse(started.line) as { url?: string }).url ?? "");
    } catch {
      url = started.line;
    }
    if (!/^https?:\/\//.test(url)) {
      started.kill();
      throw new Error(`wmpy preview printed "${started.line}" instead of its address`);
    }
    await this.show(root, url, title, started.kill);
  }

  /** Shows the page at [url] for [root], replacing what an open panel showed. */
  async show(root: string, url: string, title: string, kill?: () => void): Promise<void> {
    const existing = this.open.get(root);
    if (existing && existing.url === url) {
      kill?.();
      existing.panel.reveal(undefined, true);
      return;
    }
    let panel: vscode.WebviewPanel;
    if (existing) {
      existing.kill?.();
      panel = existing.panel;
    } else {
      panel = vscode.window.createWebviewPanel(
        "wmpy.preview",
        `Preview: ${title}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
      );
      panel.iconPath = vscode.Uri.file(path.join(__dirname, "..", "media", "icon.png"));
      panel.onDidDispose(() => {
        const o = this.open.get(root);
        o?.kill?.();
        this.open.delete(root);
      });
    }
    this.open.set(root, { panel, url, kill });
    const src = await this.frameSrc(url);
    this.log.info(`Preview of ${root}: ${url} shown as ${src}`);
    panel.webview.html = previewHtml({ src, title: `Preview: ${title}`, nonce: makeNonce() });
    panel.reveal(undefined, true);
  }

  private async frameSrc(url: string): Promise<string> {
    const external = await vscode.env.asExternalUri(vscode.Uri.parse(url, true));
    return embedUrl(external.toString(true), this.theme());
  }

  private async retheme(): Promise<void> {
    for (const o of this.open.values()) {
      await o.panel.webview.postMessage({ type: "src", src: await this.frameSrc(o.url) });
    }
  }
}
