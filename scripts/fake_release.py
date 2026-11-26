"""Makes a release folder like the release workflow's, with stand-in programs,
for testing the packaging without a Rust build.

    python3 scripts/fake_release.py <out dir> <version>

The stand-in `wmpy` is a shell script that prints `wmpy <version> (fake)`.
"""
import hashlib
import io
import pathlib
import sys
import tarfile
import zipfile

TRIPLES = [
    "aarch64-apple-darwin", "x86_64-apple-darwin",
    "aarch64-unknown-linux-musl", "x86_64-unknown-linux-musl",
    "aarch64-pc-windows-msvc", "x86_64-pc-windows-msvc",
]
ROOT = pathlib.Path(__file__).resolve().parent.parent


def main() -> None:
    out, version = pathlib.Path(sys.argv[1]), sys.argv[2]
    out.mkdir(parents=True, exist_ok=True)
    program = f'#!/bin/sh\necho "wmpy {version} (fake)"\n'.encode()
    license_text = (ROOT / "LICENSE").read_bytes()
    lines = []
    for triple in TRIPLES:
        if "windows" in triple:
            name = f"wmpy-{triple}.zip"
            with zipfile.ZipFile(out / name, "w", zipfile.ZIP_DEFLATED) as z:
                z.writestr("wmpy.exe", program)
                z.writestr("LICENSE", license_text)
        else:
            name = f"wmpy-{triple}.tar.gz"
            with tarfile.open(out / name, "w:gz") as t:
                for member, data, mode in (("wmpy", program, 0o755), ("LICENSE", license_text, 0o644)):
                    info = tarfile.TarInfo(member)
                    info.size, info.mode = len(data), mode
                    t.addfile(info, io.BytesIO(data))
        digest = hashlib.sha256((out / name).read_bytes()).hexdigest()
        (out / f"{name}.sha256").write_text(f"{digest}  {name}\n")
        lines.append(f"{digest}  {name}")
    (out / "SHA256SUMS").write_text("\n".join(lines) + "\n")
    print(f"fake release {version} in {out}")


if __name__ == "__main__":
    main()
