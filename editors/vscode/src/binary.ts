// Finding the wmpy program: the wmpy.path setting, then PATH, then a copy
// this extension downloaded from the wmpy GitHub releases, checked against
// the release's SHA-256.

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { extractFile } from "./archive";
import { run } from "./cli";
import { assetName, findOnPath, parseSha256, releaseUrl, tagFor, targetFor } from "./platform";

export class Binary {
  private resolved: string | undefined;
  private asking: Promise<string | undefined> | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  /** Forget the last answer, after the setting changes. */
  reset(): void {
    this.resolved = undefined;
  }

  private exeName(): string {
    return process.platform === "win32" ? "wmpy.exe" : "wmpy";
  }

  /** Where a downloaded copy lives: one folder per extension version, so an update fetches the matching wmpy. */
  downloadedPath(): string {
    const version = String(this.context.extension.packageJSON.version ?? "0.0.0");
    return path.join(this.context.globalStorageUri.fsPath, "bin", version, this.exeName());
  }

  /** The program, without asking anything. */
  find(): string | undefined {
    const setting = vscode.workspace.getConfiguration("wmpy").get<string>("path", "").trim();
    if (setting) {
      const p = setting.startsWith("~") ? path.join(process.env.HOME ?? "", setting.slice(1)) : setting;
      return isFile(p) ? p : undefined;
    }
    const onPath = findOnPath("wmpy", process.env.PATH ?? "", isFile);
    if (onPath) return onPath;
    const downloaded = this.downloadedPath();
    return isFile(downloaded) ? downloaded : undefined;
  }

  /**
   * The program. When there is none and [interactive] is true, offers to
   * download it, once at a time however many callers ask together.
   */
  async resolve(interactive: boolean): Promise<string | undefined> {
    if (this.resolved && isFile(this.resolved)) return this.resolved;
    const found = this.find();
    if (found) return (this.resolved = found);
    if (!interactive) return undefined;
    this.asking ??= this.offer().finally(() => (this.asking = undefined));
    return this.asking;
  }

  private async offer(): Promise<string | undefined> {
    const setting = vscode.workspace.getConfiguration("wmpy").get<string>("path", "").trim();
    if (setting) {
      const open = "Open Settings";
      const pick = await vscode.window.showErrorMessage(`wmpy.path is set to ${setting}, which is not a file.`, open);
      if (pick === open) await vscode.commands.executeCommand("workbench.action.openSettings", "wmpy.path");
      return undefined;
    }
    const download = "Download";
    const howTo = "Other Ways to Install";
    const pick = await vscode.window.showInformationMessage(
      "The wmpy extension needs the wmpy program, which is not on PATH. Download it from the wmpy releases on GitHub?",
      download,
      howTo,
    );
    if (pick === howTo) {
      await vscode.env.openExternal(vscode.Uri.parse("https://wmkeyboard.pages.dev/plugins/wmpy/"));
      return undefined;
    }
    if (pick !== download) return undefined;
    return this.download();
  }

  /** Downloads the release that matches this extension's version, checks it and keeps it in global storage. */
  async download(): Promise<string | undefined> {
    const target = targetFor(process.platform, process.arch);
    if (!target) {
      vscode.window.showErrorMessage(`There is no wmpy build for ${process.platform} on ${process.arch}. Build it with cargo: see the wmpy install page.`);
      return undefined;
    }
    const asset = assetName(target);
    const version = String(this.context.extension.packageJSON.version ?? "0.0.0");
    const tag = tagFor(version);
    try {
      const exe = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Downloading ${asset}`, cancellable: false },
        async () => {
          const [archive, sumText] = await fetchRelease(asset, tag);
          const want = parseSha256(sumText, asset);
          if (!want) throw new Error(`${asset}.sha256 holds no SHA-256`);
          const got = createHash("sha256").update(archive).digest("hex");
          if (got !== want) throw new Error(`${asset} does not match its SHA-256 (expected ${want}, got ${got})`);
          const bytes = extractFile(archive, target.archive, target.exe);
          if (!bytes) throw new Error(`${asset} has no ${target.exe} in it`);
          const dest = this.downloadedPath();
          await fs.promises.mkdir(path.dirname(dest), { recursive: true });
          const partial = `${dest}.partial`;
          await fs.promises.writeFile(partial, bytes, { mode: 0o755 });
          await fs.promises.rename(partial, dest);
          return dest;
        },
      );
      const ran = await run(exe, ["--version"]);
      this.log.info(`Downloaded ${asset} to ${exe}: ${ran.stdout.trim() || ran.stderr.trim()}`);
      this.resolved = exe;
      return exe;
    } catch (e) {
      this.log.error(`Downloading ${asset} failed: ${String(e)}`);
      vscode.window.showErrorMessage(`Could not download wmpy: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  }
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

async function get(url: string): Promise<Response> {
  const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "wmpy-vscode" } });
  return r;
}

/** The archive and its `.sha256`, from release [tag], or the latest release when that tag has none. */
async function fetchRelease(asset: string, tag: string | undefined): Promise<[Buffer, string]> {
  for (const t of tag ? [tag, undefined] : [undefined]) {
    const r = await get(releaseUrl(asset, t));
    if (r.status === 404 && t) continue;
    if (!r.ok) throw new Error(`${releaseUrl(asset, t)}: HTTP ${r.status}`);
    const archive = Buffer.from(await r.arrayBuffer());
    const s = await get(releaseUrl(`${asset}.sha256`, t));
    if (!s.ok) throw new Error(`${releaseUrl(`${asset}.sha256`, t)}: HTTP ${s.status}`);
    return [archive, await s.text()];
  }
  throw new Error(`no release has ${asset}`);
}
