# wmpy for JetBrains IDEs

PyCharm (2025.1 and later, with or without a Pro subscription, and
PyCharm Community 2025.1 and 2025.2) and IntelliJ IDEA with the Python
plugin.

- The `wmpy` language server through [LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij),
  which the IDE installs with this plugin. LSP4IJ runs in every edition and
  shows the server's ▶ Preview and Run tests code lenses.
- The wmpy Preview tool window: the plugin's panel in a JCEF browser.
- Run configurations for `wmpy run` (in a terminal console) and `wmpy test`.
- File | New | wmpy Plugin, and Tools | wmpy for check, pack, pip, stubs and
  publish.
- The `plugin.json` schema, shared with the other editors in `../schemas`.

## Building

The Gradle wrapper jar and scripts are not committed. Make them once with a
Gradle 9.9 install, then build:

```sh
gradle wrapper --gradle-version 9.9.2
./gradlew buildPlugin        # build/distributions/wmpy-<version>.zip
./gradlew verifyPlugin       # PyCharm Community 2025.1, PyCharm and IDEA 2026.2
./gradlew runIde             # a sandbox IDE with the plugin
```

Why LSP4IJ and not the platform's own LSP API: the platform API reached the
free editions only in 2025.1 (PyCharm) and 2025.2.1 (`com.intellij.modules.lsp`),
gained code lenses only in 2026.1, and renamed its descriptor class in
2026.1.4. LSP4IJ has had code lenses and client-side command handling
(`LSPCommandAction`) in every 2024 and later IDE, and it is not in an
open-source build's way either.
