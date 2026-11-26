"""Repacks the release archives into one wheel per platform.

    python3 packaging/pypi/build_wheels.py <version> <dir with the release archives> <out dir>

Each wheel holds the release's own wmpy program under `.data/scripts`, so pip,
pipx and uv put it on PATH, plus the small `wmpy` package for `python -m wmpy`.
Standard library only.
"""
import base64
import hashlib
import io
import pathlib
import sys
import tarfile
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent

# Rust's default deployment targets: macOS 10.12 on Intel, 11.0 on Apple
# silicon. The Linux builds are static musl, so they run on glibc too.
TAGS = {
    "aarch64-apple-darwin": "macosx_11_0_arm64",
    "x86_64-apple-darwin": "macosx_10_12_x86_64",
    "aarch64-unknown-linux-musl": "manylinux_2_17_aarch64.manylinux2014_aarch64.musllinux_1_2_aarch64",
    "x86_64-unknown-linux-musl": "manylinux_2_17_x86_64.manylinux2014_x86_64.musllinux_1_2_x86_64",
    "aarch64-pc-windows-msvc": "win_arm64",
    "x86_64-pc-windows-msvc": "win_amd64",
}


def program(archive: pathlib.Path, exe: str) -> bytes:
    if archive.suffix == ".zip":
        with zipfile.ZipFile(archive) as z:
            name = next(n for n in z.namelist() if n.rsplit("/", 1)[-1] == exe)
            return z.read(name)
    with tarfile.open(archive, "r:gz") as t:
        member = next(m for m in t.getmembers() if m.isfile() and m.name.rsplit("/", 1)[-1] == exe)
        return t.extractfile(member).read()


def record_line(name: str, data: bytes) -> str:
    digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode()
    return f"{name},sha256={digest},{len(data)}"


def metadata(version: str) -> str:
    readme = (HERE / "README.md").read_text()
    return (
        "Metadata-Version: 2.4\n"
        "Name: wmpy\n"
        f"Version: {version}\n"
        "Summary: Make, check, test, preview and pack WM Keyboard's Python plugins\n"
        "Home-page: https://wmkeyboard.pages.dev/plugins/wmpy/\n"
        "Project-URL: Source, https://github.com/wasi-master/wmpy\n"
        "Project-URL: Documentation, https://wmkeyboard.pages.dev/plugins/wmpy/\n"
        "Author: Wasi Master\n"
        "License-Expression: MIT\n"
        "License-File: LICENSE\n"
        "Requires-Python: >=3.8\n"
        "Classifier: Environment :: Console\n"
        "Classifier: Programming Language :: Rust\n"
        "Classifier: Topic :: Software Development :: Code Generators\n"
        "Description-Content-Type: text/markdown\n"
        "\n" + readme
    )


def wheel(version: str, triple: str, archive: pathlib.Path, out: pathlib.Path) -> pathlib.Path:
    tag = TAGS[triple]
    exe = "wmpy.exe" if "windows" in triple else "wmpy"
    dist = f"wmpy-{version}"
    files = [
        ("wmpy/__init__.py", (HERE / "wmpy" / "__init__.py").read_bytes(), 0o644),
        ("wmpy/__main__.py", (HERE / "wmpy" / "__main__.py").read_bytes(), 0o644),
        (f"{dist}.data/scripts/{exe}", program(archive, exe), 0o755),
        (f"{dist}.dist-info/METADATA", metadata(version).encode(), 0o644),
        (f"{dist}.dist-info/WHEEL", f"Wheel-Version: 1.0\nGenerator: wmpy build_wheels.py\nRoot-Is-Purelib: false\nTag: py3-none-{tag}\n".encode(), 0o644),
        (f"{dist}.dist-info/licenses/LICENSE", (ROOT / "LICENSE").read_bytes(), 0o644),
    ]
    record = f"{dist}.dist-info/RECORD"
    lines = [record_line(n, d) for n, d, _ in files] + [f"{record},,"]
    files.append((record, ("\n".join(lines) + "\n").encode(), 0o644))
    path = out / f"wmpy-{version}-py3-none-{tag}.whl"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data, mode in files:
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.external_attr = (0o100000 | mode) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    return path


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    version, dist, out = sys.argv[1].lstrip("v"), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    for triple in TAGS:
        ext = "zip" if "windows" in triple else "tar.gz"
        archive = dist / f"wmpy-{triple}.{ext}"
        if not archive.exists():
            raise SystemExit(f"missing {archive}")
        print(wheel(version, triple, archive, out).name)


if __name__ == "__main__":
    main()
