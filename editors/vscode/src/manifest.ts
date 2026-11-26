// Telling a WM Keyboard plugin.json from other tools' plugin.json files, and
// finding the plugin a file belongs to. No vscode import.

import * as path from "node:path";

export interface ManifestInfo {
  id: string;
  name: string;
  apiVersion: number;
}

/**
 * The manifest's id and name when [text] is a WM Keyboard plugin.json: it says
 * `"format": "wmkeyboard-plugin"`, or has `pluginVersion` or `apiVersion`.
 * A plugin.json that fails to parse while the user types still counts when
 * it names the format, so a folder does not flicker in and out.
 */
export function readManifest(text: string): ManifestInfo | undefined {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    if (/"format"\s*:\s*"wmkeyboard-plugin"/.test(text)) return { id: "", name: "", apiVersion: 5 };
    return undefined;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (o.format !== "wmkeyboard-plugin" && !("pluginVersion" in o) && !("apiVersion" in o)) return undefined;
  return {
    id: typeof o.id === "string" ? o.id : "",
    name: typeof o.name === "string" ? o.name : "",
    apiVersion: typeof o.apiVersion === "number" ? o.apiVersion : 1,
  };
}

/** The deepest of [roots] that holds [file], or undefined. Paths are compared as the OS does. */
export function pluginRootFor(file: string, roots: readonly string[], platform: string = process.platform): string | undefined {
  const norm = (p: string) => {
    const r = path.resolve(p);
    return platform === "win32" || platform === "darwin" ? r.toLowerCase() : r;
  };
  const f = norm(file);
  let best: string | undefined;
  for (const root of roots) {
    const r = norm(root);
    if ((f === r || f.startsWith(r + path.sep)) && (!best || r.length > norm(best).length)) best = root;
  }
  return best;
}

/** A folder name made from a plugin's name: `Coin Flip!` becomes `coin-flip`. */
export function folderName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "plugin";
}

export interface Template {
  id: string;
  label: string;
  detail: string;
}

/** The templates `wmpy new --template` takes. */
export const TEMPLATES: readonly Template[] = [
  { id: "blank", label: "Blank", detail: "A title and a button" },
  { id: "text-tools", label: "Text tools", detail: "Change case, encode and count text typed into a box" },
  { id: "cipher", label: "Cipher", detail: "Caesar and Vigenere, encode and decode" },
  { id: "todo", label: "To-do list", detail: "Storage, due dates and reminders" },
  { id: "kitchen-sink", label: "Kitchen sink", detail: "Every widget and every event, to copy from" },
  { id: "text-generator", label: "Text generator", detail: "Placeholder words, sentences and paragraphs" },
  { id: "weather", label: "Weather", detail: "Today's forecast from Open-Meteo, over the network" },
  { id: "text-actions", label: "Text actions", detail: "Buttons on the bar over selected text" },
];
