package com.wasimaster.wmpy

/**
 * The parts of the plugin that are plain text work: no IDE classes, so the
 * unit tests run them directly.
 */
object WmpyText {
    /** The templates `wmpy new --template` takes, with a line about each. */
    val TEMPLATES: List<Pair<String, String>> = listOf(
        "blank" to "Blank: a title and a button",
        "text-tools" to "Text tools: change case, encode and count text typed into a box",
        "cipher" to "Cipher: Caesar and Vigenere, encode and decode",
        "todo" to "To-do list: storage, due dates and reminders",
        "kitchen-sink" to "Kitchen sink: every widget and every event, to copy from",
        "text-generator" to "Text generator: placeholder words, sentences and paragraphs",
        "weather" to "Weather: today's forecast from Open-Meteo, over the network",
        "text-actions" to "Text actions: buttons on the bar over selected text",
    )

    private val FORMAT = Regex("\"format\"\\s*:\\s*\"wmkeyboard-plugin\"")
    private val KEY = Regex("\"(pluginVersion|apiVersion)\"\\s*:")

    /**
     * Whether [text] is a WM Keyboard plugin.json rather than another tool's:
     * it names the format, or has `pluginVersion` or `apiVersion`.
     */
    fun isManifest(text: String): Boolean = FORMAT.containsMatchIn(text) || KEY.containsMatchIn(text)

    private val NAME = Regex("\"name\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"")

    /** The manifest's `name`, or null. */
    fun manifestName(text: String): String? = NAME.find(text)?.groupValues?.get(1)?.takeIf { it.isNotBlank() }

    private val URL = Regex("\"url\"\\s*:\\s*\"(https?://[^\"]+)\"")

    /** The address in `wmpy preview --print-url`'s line, `{"url": "...", "port": N}`, or a bare URL. */
    fun previewUrl(line: String): String? {
        val t = line.trim()
        URL.find(t)?.let { return it.groupValues[1].replace("\\/", "/") }
        return t.takeIf { it.startsWith("http://") || it.startsWith("https://") }
    }

    /** [url] with `embed=1` and `theme`, replacing earlier values and keeping the token. */
    fun embedUrl(url: String, dark: Boolean): String {
        val hash = url.indexOf('#').let { if (it < 0) "" else url.substring(it) }
        val base = url.removeSuffix(hash)
        val q = base.indexOf('?')
        val path = if (q < 0) base else base.substring(0, q)
        val kept = if (q < 0) emptyList() else base.substring(q + 1).split('&').filter {
            it.isNotEmpty() && !it.startsWith("embed=") && !it.startsWith("theme=")
        }
        val query = kept + listOf("embed=1", "theme=" + if (dark) "dark" else "light")
        return path + "?" + query.joinToString("&") + hash
    }

    /** `Coin Flip!` as a folder name: `coin-flip`. */
    fun folderName(name: String): String {
        val plain = java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFKD).replace(Regex("\\p{M}+"), "")
        return plain.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-').ifEmpty { "plugin" }
    }

    /** The release asset for an OS and architecture as Java names them, or null. */
    fun assetFor(osName: String, osArch: String): String? {
        val os = osName.lowercase()
        val arm = osArch.lowercase().let { it == "aarch64" || it == "arm64" }
        val x64 = osArch.lowercase().let { it == "amd64" || it == "x86_64" }
        if (!arm && !x64) return null
        val cpu = if (arm) "aarch64" else "x86_64"
        return when {
            os.startsWith("mac") -> "wmpy-$cpu-apple-darwin.tar.gz"
            os.startsWith("windows") -> "wmpy-$cpu-pc-windows-msvc.zip"
            os.startsWith("linux") -> "wmpy-$cpu-unknown-linux-musl.tar.gz"
            else -> null
        }
    }

    /** The hex digest in a `.sha256` file as `sha256sum` writes it. */
    fun sha256Of(text: String, name: String?): String? = text.lineSequence()
        .mapNotNull { Regex("^\\s*([0-9a-fA-F]{64})(?:\\s+\\*?(\\S.*?))?\\s*$").find(it) }
        .firstOrNull { name == null || it.groupValues[2].isEmpty() || it.groupValues[2] == name }
        ?.groupValues?.get(1)?.lowercase()
}
