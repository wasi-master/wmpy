"""Sets, or with --check verifies, the version in every package of this repo.

    python3 scripts/set_version.py 0.2.0          # before tagging v0.2.0
    python3 scripts/set_version.py --check 0.2.0  # the release workflow, on the tag

Covers the VS Code extension, the Zed extension, the JetBrains plugin and the
npm launcher. Formula/ and bucket/ are bumped by bump_manifests.py after the
release exists, and the PyPI wheels take the version when they are built.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def edits(version: str):
    """(path, current text -> new text) for every file that carries the version."""

    def package_json(text: str) -> str:
        data = json.loads(text)
        data["version"] = version
        for key in ("optionalDependencies",):
            for dep in data.get(key, {}):
                data[key][dep] = version
        return json.dumps(data, indent=2, ensure_ascii=False) + "\n"

    def lock_json(text: str) -> str:
        data = json.loads(text)
        data["version"] = version
        data.get("packages", {}).get("", {})["version"] = version
        return json.dumps(data, indent=2, ensure_ascii=False) + "\n"

    def toml_version(text: str) -> str:
        return re.sub(r'(?m)^version = "[^"]*"', f'version = "{version}"', text, count=1)

    def gradle(text: str) -> str:
        return re.sub(r"(?m)^pluginVersion = .*$", f"pluginVersion = {version}", text, count=1)

    return [
        ("editors/vscode/package.json", package_json),
        ("editors/vscode/package-lock.json", lock_json),
        ("editors/zed/extension.toml", toml_version),
        ("editors/zed/Cargo.toml", toml_version),
        ("editors/jetbrains/gradle.properties", gradle),
        ("packaging/npm/wmpy/package.json", package_json),
    ]


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--check"]
    if len(args) != 1 or not re.fullmatch(r"v?\d+\.\d+\.\d+", args[0]):
        raise SystemExit(__doc__)
    version = args[0].lstrip("v")
    check = "--check" in sys.argv
    wrong = []
    for rel, edit in edits(version):
        path = ROOT / rel
        text = path.read_text()
        new = edit(text)
        if new != text:
            if check:
                wrong.append(rel)
            else:
                path.write_text(new)
                print(f"set {rel}")
    if wrong:
        raise SystemExit(f"not at {version}: " + ", ".join(wrong) + f"\nrun: python3 scripts/set_version.py {version}")
    if check:
        print(f"every package is at {version}")


if __name__ == "__main__":
    main()
