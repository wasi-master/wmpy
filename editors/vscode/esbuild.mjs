// Bundles the extension into dist/extension.js, and with --tests the tests
// into out/test/. Copies the shared plugin.json schema in beside it.
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const production = args.has("--production");

mkdirSync("schemas", { recursive: true });
copyFileSync("../schemas/plugin.schema.json", "schemas/plugin.schema.json");

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

if (args.has("--tests")) {
  const entries = [];
  for (const dir of ["test/unit", "test/integration"]) {
    for (const f of readdirSync(dir)) if (f.endsWith(".ts")) entries.push(join(dir, f));
  }
  await esbuild.build({ ...common, entryPoints: entries, outdir: "out", outbase: "." });
} else {
  const options = { ...common, entryPoints: ["src/extension.ts"], outfile: "dist/extension.js" };
  if (args.has("--watch")) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  } else {
    await esbuild.build(options);
  }
}
