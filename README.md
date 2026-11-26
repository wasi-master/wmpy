# wmpy

`wmpy` is the command-line tool for [WM Keyboard](https://wmkeyboard.pages.dev)'s
Python plugins. It makes, checks, tests, runs, previews and packs them, adds
pure-Python packages from PyPI, publishes them, and runs the language server
and the MCP server that editors and AI agents use.

Guide: <https://wmkeyboard.pages.dev/plugins/wmpy/>

This repository holds what ships wmpy: the editor extensions, the Homebrew
tap, the Scoop bucket, the npm and PyPI packages, the install scripts and the
release workflow. The Rust source lives in the WM Keyboard repository, in
[`native/wmpy`](https://github.com/wasi-master/wmkeyboard/tree/main/native/wmpy),
because the app and the web editor run the same interpreter. Each release is
built from the WM Keyboard commit in [`WMKEYBOARD_REF`](WMKEYBOARD_REF).

## Install

| | |
|---|---|
| Homebrew (macOS, Linux) | `brew tap wasi-master/wmpy https://github.com/wasi-master/wmpy` then `brew install wmpy` |
| Scoop (Windows) | `scoop bucket add wmpy https://github.com/wasi-master/wmpy` then `scoop install wmpy` |
| Script (macOS, Linux) | `curl -fsSL https://raw.githubusercontent.com/wasi-master/wmpy/main/install.sh \| sh` |
| Script (Windows) | `irm https://raw.githubusercontent.com/wasi-master/wmpy/main/install.ps1 \| iex` |
| pipx, uv | `pipx install wmpy` or `uv tool install wmpy` |
| npm | `npx wmpy --help`, or `npm install -g wmpy` |
| cargo | `cargo install --git https://github.com/wasi-master/wmkeyboard wmpy` |

The scripts install to `~/.local/bin` (`%LOCALAPPDATA%\Programs\wmpy\bin` on
Windows). Set `WMPY_INSTALL_DIR` for another folder and `WMPY_VERSION` for a
release other than the latest. Both check the download against the release's
SHA-256.

## Editors

| Editor | Install | Source |
|---|---|---|
| VS Code | Marketplace: `wasimaster.wmpy` | [`editors/vscode`](editors/vscode) |
| VSCodium, Cursor, Windsurf | Open VSX: `wasimaster.wmpy` | the same |
| Zed | Extensions page: `wmpy` | [`editors/zed`](editors/zed) |
| PyCharm, IntelliJ IDEA | JetBrains Marketplace: `com.wasimaster.wmpy` | [`editors/jetbrains`](editors/jetbrains) |

`wmpy editor install` installs the extension in every editor it finds. The
three share one `plugin.json` schema, [`editors/schemas/plugin.schema.json`](editors/schemas/plugin.schema.json),
which follows the app's own manifest rules (`PluginManifestCodec` in WM
Keyboard). Guide: <https://wmkeyboard.pages.dev/plugins/editors/>

## Release files

Every release has these files, each with a `<file>.sha256` beside it, and a
`SHA256SUMS` with all of them:

| File | What |
|---|---|
| `wmpy-x86_64-unknown-linux-musl.tar.gz` | Linux x86_64, static |
| `wmpy-aarch64-unknown-linux-musl.tar.gz` | Linux ARM64, static |
| `wmpy-x86_64-apple-darwin.tar.gz` | macOS Intel |
| `wmpy-aarch64-apple-darwin.tar.gz` | macOS Apple silicon |
| `wmpy-x86_64-pc-windows-msvc.zip` | Windows x64 |
| `wmpy-aarch64-pc-windows-msvc.zip` | Windows ARM64 |
| `wmpy.vsix` | the VS Code extension |
| `wmpy-jetbrains.zip` | the JetBrains plugin |
| `wmpy-zed.zip` | the built Zed extension, as `wmpy editor install zed` unpacks it |

The program archives hold `wmpy` (`wmpy.exe`), `LICENSE` and `README.md` at
their top level. The names are `wmpy-<Rust target>.<tar.gz|zip>` and stay
that way: the install scripts, Homebrew, Scoop, npm, PyPI, the Zed extension,
the VS Code extension and `wmpy editor` all build them from that pattern.

## Making a release

1. Push the WM Keyboard commit to release, and write its full sha into
   `WMKEYBOARD_REF`. The workflow checks it out by sha, so it must be on
   GitHub first.
2. `python3 scripts/set_version.py 0.2.0`, which sets the version of the
   VS Code extension, the Zed extension, the JetBrains plugin and the npm
   launcher. Commit.
3. Tag and push: `git tag v0.2.0 && git push origin main v0.2.0`.

[`release.yml`](.github/workflows/release.yml) then:

- builds wmpy for the six platforms, with the tag's version in
  `wmpy --version`, and checks each one that can run on its runner;
- builds the `.vsix`, the JetBrains plugin and the Zed extension;
- creates the GitHub release with all the files above;
- writes the new version and SHA-256s into [`Formula/wmpy.rb`](Formula/wmpy.rb)
  and [`bucket/wmpy.json`](bucket/wmpy.json) and pushes that to `main`;
- publishes to npm, PyPI, the VS Code Marketplace, Open VSX and the JetBrains
  Marketplace.

The Zed extension is published by a pull request to
[zed-industries/extensions](https://github.com/zed-industries/extensions),
which adds this repository as a submodule with `path = "editors/zed"`. Each
later release needs a pull request that moves the submodule and the version.

[`ci.yml`](.github/workflows/ci.yml) builds and tests every extension and
package on each push and pull request, without publishing.

### Accounts and secrets

| Where | What to set up | Secret |
|---|---|---|
| GitHub | Actions may write to the repository (the release and the Formula/bucket commit use `GITHUB_TOKEN`). If `main` is protected, allow the Actions bot to push, or the Formula/bucket step fails. | none |
| npm | An npm account, and the organization `wmpy` so the `@wmpy/*` platform packages can be published. An automation (or granular, publish) token for `wmpy` and `@wmpy/*`. Environment `npm` in the repository settings. | `NPM_TOKEN` |
| PyPI | A PyPI account and a pending trusted publisher for the project `wmpy`: owner `wasi-master`, repository `wmpy`, workflow `release.yml`, environment `pypi`. Environment `pypi` in the repository settings. | none |
| VS Code Marketplace | A publisher `wasimaster` at <https://marketplace.visualstudio.com/manage>, and an Azure DevOps personal access token with the Marketplace (Manage) scope, for all organizations. | `VSCE_PAT` |
| Open VSX | An Eclipse Foundation account with the Open VSX publisher agreement signed, an access token from <https://open-vsx.org/user-settings/tokens>, and the namespace made once: `npx ovsx create-namespace wasimaster -p <token>`. | `OVSX_PAT` |
| JetBrains Marketplace | A JetBrains account and a vendor. Upload the first version of the plugin by hand at <https://plugins.jetbrains.com/plugin/add> (the Marketplace requires it), then make a permanent token at <https://plugins.jetbrains.com/author/me/tokens>. | `JETBRAINS_TOKEN` |
| Zed | A GitHub account to open the pull request to zed-industries/extensions. | none |

## Layout

```text
editors/schemas/     plugin.schema.json and its tests
editors/vscode/      the VS Code extension (TypeScript, esbuild)
editors/zed/         the Zed extension (Rust, wasm32-wasip2)
editors/jetbrains/   the JetBrains plugin (Kotlin, IntelliJ Platform Gradle Plugin 2, LSP4IJ)
Formula/wmpy.rb      the Homebrew formula (this repository is the tap)
bucket/wmpy.json     the Scoop manifest (this repository is the bucket)
packaging/npm/       the wmpy launcher and the per-platform packages
packaging/pypi/      repacks the release archives into one wheel per platform
install.sh           macOS and Linux install script
install.ps1          Windows install script
scripts/             version and manifest bumps, packaging helpers, tests
```

The PyPI wheels hold the release's own binaries rather than a build by
maturin. One Rust build per platform then serves every channel, and the
wheel's `wmpy` is byte for byte the release's. A maturin build would need the
WM Keyboard tree (wmpy depends on its sibling crates by path) in every
source distribution and a second Rust build per platform.

## Developing

```sh
python3 editors/schemas/test_schema.py         # needs: pip install jsonschema
cd editors/vscode && npm ci && npm test && npm run package
cd editors/zed && cargo test && cargo build --release --target wasm32-wasip2
sh scripts/test-install.sh
```

The JetBrains plugin builds with Gradle 9.9; the wrapper jar is not committed.
See [`editors/jetbrains/README.md`](editors/jetbrains/README.md).

## License

MIT. See [LICENSE](LICENSE).
