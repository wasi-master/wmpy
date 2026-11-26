// Makes the npm packages from release archives:
//   node packaging/npm/build.mjs <version> <dir with the release archives> <out dir>
// Writes <out>/wmpy (the launcher) and <out>/<os>-<cpu> for each platform, each
// ready for `npm publish`. Extracting uses the system tar and unzip.

import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [version, dist, out] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? "") || !dist || !out) {
  console.error("usage: node build.mjs <version> <release dir> <out dir>");
  process.exit(2);
}
const platforms = JSON.parse(readFileSync(join(here, "platforms.json"), "utf8"));
const license = join(here, "..", "..", "LICENSE");
rmSync(out, { recursive: true, force: true });

for (const p of platforms) {
  const asset = join(dist, `wmpy-${p.triple}.${p.archive}`);
  if (!existsSync(asset)) throw new Error(`missing ${asset}`);
  const dir = join(out, `${p.os}-${p.cpu}`);
  mkdirSync(join(dir, "bin"), { recursive: true });
  const tmp = join(out, `.x-${p.triple}`);
  mkdirSync(tmp, { recursive: true });
  if (p.archive === "zip") execFileSync("unzip", ["-q", "-o", asset, "-d", tmp]);
  else execFileSync("tar", ["-xzf", asset, "-C", tmp]);
  copyFileSync(join(tmp, p.exe), join(dir, "bin", p.exe));
  chmodSync(join(dir, "bin", p.exe), 0o755);
  rmSync(tmp, { recursive: true, force: true });
  copyFileSync(license, join(dir, "LICENSE"));
  const pkg = {
    name: p.package,
    version,
    description: `The wmpy program for ${p.os} on ${p.cpu}. Install "wmpy" instead.`,
    license: "MIT",
    homepage: "https://wmkeyboard.pages.dev/plugins/wmpy/",
    repository: { type: "git", url: "git+https://github.com/wasi-master/wmpy.git" },
    os: [p.os],
    cpu: [p.cpu],
    files: [`bin/${p.exe}`, "LICENSE"],
    preferUnplugged: true,
  };
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  writeFileSync(join(dir, "README.md"), `# ${p.package}\n\nThe \`wmpy\` program for ${p.os} on ${p.cpu}. Install [\`wmpy\`](https://www.npmjs.com/package/wmpy) instead.\n`);
}

const main = JSON.parse(readFileSync(join(here, "wmpy", "package.json"), "utf8"));
main.version = version;
main.optionalDependencies = Object.fromEntries(platforms.map((p) => [p.package, version]));
const mainDir = join(out, "wmpy");
mkdirSync(join(mainDir, "bin"), { recursive: true });
copyFileSync(join(here, "wmpy", "bin", "wmpy.js"), join(mainDir, "bin", "wmpy.js"));
chmodSync(join(mainDir, "bin", "wmpy.js"), 0o755);
copyFileSync(join(here, "wmpy", "README.md"), join(mainDir, "README.md"));
copyFileSync(license, join(mainDir, "LICENSE"));
writeFileSync(join(mainDir, "package.json"), JSON.stringify(main, null, 2) + "\n");
console.log(`npm packages for ${version} in ${out}`);
