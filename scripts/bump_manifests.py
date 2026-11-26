"""Writes a release's version and SHA-256s into Formula/wmpy.rb and bucket/wmpy.json.

    python3 scripts/bump_manifests.py 0.2.0 dist/SHA256SUMS

SHA256SUMS holds `<sha256>  <asset>` lines, as sha256sum writes them.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FORMULA = ROOT / "Formula" / "wmpy.rb"
BUCKET = ROOT / "bucket" / "wmpy.json"
RELEASES = "https://github.com/wasi-master/wmpy/releases/download"


def sums(path: pathlib.Path) -> dict:
    out = {}
    for line in path.read_text().splitlines():
        m = re.match(r"^([0-9a-fA-F]{64})\s+\*?(\S+)\s*$", line)
        if m:
            out[m.group(2)] = m.group(1).lower()
    return out


def bump_formula(text: str, version: str, digests: dict) -> str:
    text = re.sub(r'(?m)^(\s*version )"[^"]*"', rf'\g<1>"{version}"', text, count=1)

    def one(m: re.Match) -> str:
        asset = m.group(2)
        if asset not in digests:
            raise SystemExit(f"SHA256SUMS has no {asset}")
        return f'{m.group(1)}{m.group(3)}"{digests[asset]}"'

    # Each url line names its asset; the sha256 line after it gets that asset's digest.
    return re.sub(r'(url "[^"]*/(wmpy-[^"/]+)"\n)(\s*sha256 )"[0-9a-f]*"', one, text)


def bump_bucket(data: dict, version: str, digests: dict) -> dict:
    data["version"] = version
    for arch in data["architecture"].values():
        asset = arch["url"].rsplit("/", 1)[1]
        if asset not in digests:
            raise SystemExit(f"SHA256SUMS has no {asset}")
        arch["url"] = f"{RELEASES}/v{version}/{asset}"
        arch["hash"] = digests[asset]
    return data


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    version = sys.argv[1].lstrip("v")
    digests = sums(pathlib.Path(sys.argv[2]))
    FORMULA.write_text(bump_formula(FORMULA.read_text(), version, digests))
    BUCKET.write_text(json.dumps(bump_bucket(json.loads(BUCKET.read_text()), version, digests), indent=2) + "\n")
    print(f"Formula and bucket now at {version}")


if __name__ == "__main__":
    main()
