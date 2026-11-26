"""wmpy, the command-line tool for WM Keyboard's Python plugins.

This package only carries the program: `pip install wmpy` puts `wmpy` on
PATH, and `python -m wmpy` runs it too. See https://wmkeyboard.pages.dev/plugins/wmpy/
"""

import os
import sys
import sysconfig


def find_wmpy_bin() -> str:
    """The path of the wmpy program this package installed."""
    exe = "wmpy.exe" if sys.platform == "win32" else "wmpy"
    candidates = [sysconfig.get_path("scripts")]
    try:
        candidates.append(sysconfig.get_path("scripts", f"{os.name}_user"))
    except KeyError:
        pass
    # pip install --target puts scripts in bin/ beside the package folder.
    candidates.append(os.path.join(os.path.dirname(os.path.dirname(__file__)), "bin"))
    for folder in candidates:
        path = os.path.join(folder, exe)
        if os.path.isfile(path):
            return path
    raise FileNotFoundError(f"{exe} is not where pip put this package's scripts: {', '.join(candidates)}")
