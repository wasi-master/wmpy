// Pylance and the wm package. Pylance has never heard of `wm`, so it marks
// `from wm import plugin, ui` as unresolved. `wmpy stubs` writes .wmpy/stubs;
// pointing python.analysis.stubPath at them gives Pylance the package. This
// only ever happens when the user says yes.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { run } from "./cli";

const DONT_ASK = "wmpy.stubs.dontAsk";

/** stubPath as a workspace folder setting: relative to that folder. */
export function stubPathFor(root: string, folder: vscode.WorkspaceFolder): string {
  const rel = path.relative(folder.uri.fsPath, path.join(root, ".wmpy", "stubs"));
  return rel.split(path.sep).join("/");
}

function pylanceInstalled(): boolean {
  return !!vscode.extensions.getExtension("ms-python.vscode-pylance");
}

/** Writes the stubs for [root]. True when wmpy said it did. */
export async function writeStubs(exe: string, root: string, log: vscode.LogOutputChannel): Promise<boolean> {
  const ran = await run(exe, ["stubs", root], { cwd: root });
  log.info(`wmpy stubs ${root}: ${ran.code}\n${ran.stdout}${ran.stderr}`);
  if (ran.code !== 0) {
    vscode.window.showErrorMessage(`wmpy stubs failed: ${(ran.stderr || ran.stdout).trim() || `exit ${ran.code}`}`);
    return false;
  }
  return true;
}

/** Points Pylance at [root]'s stubs; with [ask], only after the user agrees. */
export async function pointPylance(root: string, ask: boolean): Promise<void> {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(root));
  if (!folder) return;
  const config = vscode.workspace.getConfiguration("python.analysis", folder.uri);
  const want = stubPathFor(root, folder);
  if (config.get<string>("stubPath") === want) return;
  if (!ask) {
    await config.update("stubPath", want, vscode.ConfigurationTarget.WorkspaceFolder);
    return;
  }
  if (!pylanceInstalled()) return;
  const set = "Set stubPath";
  const pick = await vscode.window.showInformationMessage(
    `Set python.analysis.stubPath to "${want}" in this folder's settings, so Pylance reads the wm stubs?`,
    set,
    "Not Now",
  );
  if (pick === set) await config.update("stubPath", want, vscode.ConfigurationTarget.WorkspaceFolder);
}

/**
 * Once per workspace, for a plugin folder Pylance cannot see the stubs of:
 * offer to write them and set stubPath.
 */
export async function offerStubs(
  context: vscode.ExtensionContext,
  roots: readonly string[],
  exe: () => Promise<string | undefined>,
  log: vscode.LogOutputChannel,
): Promise<void> {
  if (!vscode.workspace.getConfiguration("wmpy").get<boolean>("offerStubs", true)) return;
  if (!pylanceInstalled() || context.workspaceState.get<boolean>(DONT_ASK)) return;
  const root = roots.find((r) => {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(r));
    if (!folder) return false;
    // `wmpy new` writes a pyrightconfig.json with the stubPath, which Pylance
    // reads when the plugin folder is the workspace folder itself.
    if (path.resolve(folder.uri.fsPath) === path.resolve(r) && fs.existsSync(path.join(r, "pyrightconfig.json"))) return false;
    return vscode.workspace.getConfiguration("python.analysis", folder.uri).get<string>("stubPath") !== stubPathFor(r, folder);
  });
  if (!root) return;
  const yes = "Write Stubs";
  const never = "Don't Ask Again";
  const pick = await vscode.window.showInformationMessage(
    "Pylance does not know the wm package. Write type stubs to .wmpy/stubs and point python.analysis.stubPath at them?",
    yes,
    "Not Now",
    never,
  );
  if (pick === never) await context.workspaceState.update(DONT_ASK, true);
  if (pick !== yes) return;
  const program = await exe();
  if (!program) return;
  if (await writeStubs(program, root, log)) await pointPylance(root, false);
}
