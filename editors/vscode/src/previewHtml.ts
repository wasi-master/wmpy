// The preview webview's page: an iframe on the `wmpy preview` server. No
// vscode import.

export type PreviewTheme = "light" | "dark";

/**
 * The colour theme kind VS Code reports (1 light, 2 dark, 3 high contrast,
 * 4 high contrast light) as the keyboard theme the preview draws with.
 */
export function themeFor(kind: number, setting: string = "auto"): PreviewTheme {
  if (setting === "light" || setting === "dark") return setting;
  return kind === 2 || kind === 3 ? "dark" : "light";
}

/** [url] with `embed=1` and the theme, keeping its token and any other query. */
export function embedUrl(url: string, theme: PreviewTheme): string {
  const u = new URL(url);
  u.searchParams.set("embed", "1");
  u.searchParams.set("theme", theme);
  return u.toString();
}

/** `http://127.0.0.1:41234`: the part of [url] a CSP `frame-src` names. */
export function originOf(url: string): string {
  return new URL(url).origin;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface PreviewPage {
  /** The iframe's address, already through `asExternalUri`. */
  src: string;
  title: string;
  nonce: string;
}

/**
 * The webview's HTML. The CSP allows nothing but the one frame origin and
 * the page's own style and script, which pass messages from the extension
 * into the frame's address.
 */
export function previewHtml(page: PreviewPage): string {
  const origin = originOf(page.src);
  const csp = [
    "default-src 'none'",
    `frame-src ${origin}`,
    `style-src 'nonce-${page.nonce}'`,
    `script-src 'nonce-${page.nonce}'`,
  ].join("; ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeAttr(page.title)}</title>
<style nonce="${page.nonce}">
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: var(--vscode-editor-background); }
  iframe { border: 0; width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
<iframe id="preview" src="${escapeAttr(page.src)}" title="${escapeAttr(page.title)}"
  allow="clipboard-read; clipboard-write"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"></iframe>
<script nonce="${page.nonce}">
  const frame = document.getElementById("preview");
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg && msg.type === "src" && typeof msg.src === "string") frame.src = msg.src;
    if (msg && msg.type === "reload") frame.src = frame.src;
  });
</script>
</body>
</html>`;
}

/** A random nonce for the CSP. */
export function makeNonce(random: () => number = Math.random): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(random() * chars.length)];
  return out;
}
