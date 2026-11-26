import os
import subprocess
import sys

from wmpy import find_wmpy_bin


def main() -> None:
    exe = find_wmpy_bin()
    if sys.platform == "win32":
        sys.exit(subprocess.run([exe, *sys.argv[1:]]).returncode)
    os.execv(exe, [exe, *sys.argv[1:]])


if __name__ == "__main__":
    main()
