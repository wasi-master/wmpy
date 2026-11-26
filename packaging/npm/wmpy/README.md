# wmpy

The command-line tool for [WM Keyboard](https://wmkeyboard.pages.dev)'s Python
plugins: it makes, checks, tests, runs, previews and packs them, and runs the
language server editors use.

```sh
npx wmpy new coin-flip --template blank --name "Coin flip"
npx wmpy preview coin-flip
```

npm installs the build for your computer as an optional dependency
(`@wmpy/darwin-arm64`, `@wmpy/linux-x64`, `@wmpy/win32-x64` and so on).
Guide: <https://wmkeyboard.pages.dev/plugins/wmpy/>
