"""Packs the built Zed extension as Zed installs it, for `wmpy editor install zed`:

    python3 scripts/package_zed.py <extension.wasm> <out.zip>

The zip holds extension.toml (with the [lib] table Zed's own packager adds),
extension.wasm and LICENSE, ready to unpack into
<Zed data dir>/extensions/installed/wmpy/.
"""
import pathlib
import re
import sys
import zipfile

ZED = pathlib.Path(__file__).resolve().parent.parent / "editors" / "zed"


def manifest() -> str:
    text = (ZED / "extension.toml").read_text()
    api = re.search(r'zed_extension_api\s*=\s*"([^"]+)"', (ZED / "Cargo.toml").read_text())
    if not api:
        raise SystemExit("editors/zed/Cargo.toml names no zed_extension_api version")
    if "[lib]" not in text:
        text = text.rstrip() + f'\n\n[lib]\nkind = "Rust"\nversion = "{api.group(1)}"\n'
    return text


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    wasm, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("extension.toml", manifest())
        z.write(wasm, "extension.wasm")
        z.write(ZED / "LICENSE", "LICENSE")
    print(out)


if __name__ == "__main__":
    main()
