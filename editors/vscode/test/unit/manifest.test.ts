import assert from "node:assert/strict";
import * as path from "node:path";
import { test } from "node:test";
import { folderName, pluginRootFor, readManifest } from "../../src/manifest";

test("WM Keyboard manifests are told from other plugin.json files", () => {
  assert.deepEqual(readManifest('{"format": "wmkeyboard-plugin", "id": "com.a.b", "name": "B", "apiVersion": 5}'), {
    id: "com.a.b",
    name: "B",
    apiVersion: 5,
  });
  assert.equal(readManifest('{"id": "x", "pluginVersion": "1"}')?.apiVersion, 1);
  assert.equal(readManifest('{"name": "claude-plugin", "version": "1.0.0"}'), undefined);
  assert.equal(readManifest("[1, 2]"), undefined);
  assert.ok(readManifest('{"format": "wmkeyboard-plugin", "id": '), "half-typed but still ours");
  assert.equal(readManifest('{"id": '), undefined);
});

test("a file belongs to the deepest plugin folder that holds it", () => {
  const roots = [path.resolve("/w/plugins"), path.resolve("/w/plugins/inner"), path.resolve("/w/other")];
  assert.equal(pluginRootFor(path.resolve("/w/plugins/inner/main.py"), roots, "linux"), roots[1]);
  assert.equal(pluginRootFor(path.resolve("/w/plugins/main.py"), roots, "linux"), roots[0]);
  assert.equal(pluginRootFor(path.resolve("/w/plugins-x/main.py"), roots, "linux"), undefined);
  assert.equal(pluginRootFor(path.resolve("/W/Other/a.py"), roots, "darwin"), roots[2]);
  assert.equal(pluginRootFor(path.resolve("/W/Other/a.py"), roots, "linux"), undefined);
});

test("folder names come from plugin names", () => {
  assert.equal(folderName("Coin Flip!"), "coin-flip");
  assert.equal(folderName("Café au lait"), "cafe-au-lait");
  assert.equal(folderName("???"), "plugin");
});
