"""Writes `<file>.sha256` beside each file, as `sha256sum` would: `<hex>  <name>`.

    python3 scripts/sha256.py dist/wmpy-x86_64-unknown-linux-musl.tar.gz [...]
"""
import hashlib
import pathlib
import sys

for arg in sys.argv[1:]:
    path = pathlib.Path(arg)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    path.with_name(path.name + ".sha256").write_text(f"{digest}  {path.name}\n")
    print(f"{digest}  {path.name}")
