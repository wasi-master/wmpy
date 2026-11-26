# wmpy for VS Code

Write Python plugins for [WM Keyboard](https://wmkeyboard.pages.dev) in VS Code,
VSCodium, Cursor, Windsurf and the other VS Code forks.

- Checks, completions, hover help and quick fixes from the `wmpy` language
  server, for the Python files of every folder with a `plugin.json`.
- **▶ Preview** above `def render`, and the Preview button in the editor
  title: the plugin's panel in a tab beside the code, redrawn as you save.
  It works in remote windows, dev containers and Codespaces too.
- Your `test_*` functions in the Test Explorer, run with `wmpy test`.
- Commands for a new plugin from a template, run in the terminal, check,
  pack a `.wmplugin`, add a PyPI package, publish, and write type stubs.
- The `plugin.json` schema: completions, hover text and errors for every
  manifest field.

The extension needs the `wmpy` program. It looks at the `wmpy.path` setting,
then `PATH`, and otherwise offers to download the release that matches it.
Other ways to install it: <https://wmkeyboard.pages.dev/plugins/wmpy/>.

Guide: <https://wmkeyboard.pages.dev/plugins/editors/>
