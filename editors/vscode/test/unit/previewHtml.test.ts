import assert from "node:assert/strict";
import { test } from "node:test";
import { embedUrl, makeNonce, originOf, previewHtml, themeFor } from "../../src/previewHtml";

test("the theme follows the colour theme unless the setting picks one", () => {
  assert.equal(themeFor(1), "light");
  assert.equal(themeFor(2), "dark");
  assert.equal(themeFor(3), "dark");
  assert.equal(themeFor(4), "light");
  assert.equal(themeFor(2, "light"), "light");
  assert.equal(themeFor(1, "dark"), "dark");
});

test("the embed address keeps the token", () => {
  const u = new URL(embedUrl("http://127.0.0.1:41234/?t=abc123", "dark"));
  assert.equal(u.searchParams.get("t"), "abc123");
  assert.equal(u.searchParams.get("embed"), "1");
  assert.equal(u.searchParams.get("theme"), "dark");
  const again = new URL(embedUrl(u.toString(), "light"));
  assert.equal(again.searchParams.getAll("theme").join(), "light");
  assert.equal(originOf("https://x-41234.app.github.dev/?t=1"), "https://x-41234.app.github.dev");
});

test("the page allows only its frame origin and its own nonce", () => {
  const nonce = makeNonce();
  assert.match(nonce, /^[A-Za-z0-9]{32}$/);
  const html = previewHtml({ src: "http://127.0.0.1:5000/?t=a&embed=1", title: 'P "<x>"', nonce });
  assert.match(html, /frame-src http:\/\/127\.0\.0\.1:5000;/);
  assert.match(html, new RegExp(`script-src 'nonce-${nonce}'`));
  assert.match(html, /default-src 'none'/);
  assert.ok(html.includes('src="http://127.0.0.1:5000/?t=a&amp;embed=1"'));
  assert.ok(html.includes("P &quot;&lt;x&gt;&quot;"));
  assert.ok(!html.includes("<x>"));
});
