# wmpy

The command-line tool for [WM Keyboard](https://wmkeyboard.pages.dev)'s Python
plugins: it makes, checks, tests, runs, previews and packs them, and runs the
language server that editors use.

```sh
pipx install wmpy        # or: uv tool install wmpy
wmpy new coin-flip --template blank --name "Coin flip"
wmpy preview coin-flip
```

These wheels hold the same program as the GitHub releases, one wheel per
operating system and CPU. Guide: <https://wmkeyboard.pages.dev/plugins/wmpy/>
