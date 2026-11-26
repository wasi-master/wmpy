package com.wasimaster.wmpy

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import com.intellij.util.EnvironmentUtil
import com.intellij.util.io.Decompressor
import com.intellij.util.io.HttpRequests
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest

/**
 * Finding the wmpy program: the setting, then PATH (the login shell's, which
 * a GUI-started IDE on macOS reads through EnvironmentUtil), then the usual
 * install folders, then a copy downloaded from the wmpy GitHub releases and
 * checked against the release's SHA-256.
 */
object WmpyBinary {
    private const val RELEASES = "https://github.com/wasi-master/wmpy/releases"
    private val exe = if (SystemInfo.isWindows) "wmpy.exe" else "wmpy"

    private fun pluginVersion(): String =
        PluginManagerCore.getPlugin(PluginId.getId("com.wasimaster.wmpy"))?.version ?: "0.0.0"

    /** Where a downloaded copy lives: one folder per plugin version. */
    fun downloadedPath(): Path = Path.of(PathManager.getSystemPath(), "wmpy", pluginVersion(), exe)

    private fun usable(f: File): Boolean = f.isFile && (SystemInfo.isWindows || f.canExecute())

    /** The program, or null. Never asks anything. */
    fun find(): String? {
        val setting = WmpySettings.get().path
        if (setting.isNotEmpty()) {
            val f = File(if (setting.startsWith("~")) System.getProperty("user.home") + setting.substring(1) else setting)
            return f.takeIf(::usable)?.absolutePath
        }
        val path = EnvironmentUtil.getValue("PATH") ?: System.getenv("PATH") ?: ""
        val home = System.getProperty("user.home")
        val dirs = path.split(File.pathSeparatorChar) + listOf("$home/.local/bin", "$home/.cargo/bin", "/opt/homebrew/bin", "/usr/local/bin")
        for (dir in dirs.filter { it.isNotBlank() }) {
            val f = File(dir.trim().removeSurrounding("\""), exe)
            if (usable(f)) return f.absolutePath
        }
        return downloadedPath().toFile().takeIf(::usable)?.absolutePath
    }

    /** The program; when there is none, a notification offering to download it, and null. */
    fun require(project: Project?): String? {
        find()?.let { return it }
        val group = NotificationGroupManager.getInstance().getNotificationGroup("wmpy")
        val setting = WmpySettings.get().path
        val text = if (setting.isNotEmpty()) {
            "The wmpy program is set to $setting, which is not a program. Change it in Settings | Tools | wmpy."
        } else {
            "The wmpy plugin needs the wmpy program, which is not on PATH."
        }
        val n = group.createNotification("wmpy not found", text, NotificationType.WARNING)
        if (setting.isEmpty()) {
            n.addAction(NotificationAction.createSimpleExpiring("Download wmpy") { download(project) {} })
            n.addAction(NotificationAction.createSimple("Other ways to install") { BrowserUtil.browse("https://wmkeyboard.pages.dev/plugins/wmpy/") })
        }
        n.notify(project)
        return null
    }

    /** Downloads the release matching this plugin's version (or the latest), checks it, and calls [then]. */
    fun download(project: Project?, then: (String) -> Unit) {
        val asset = WmpyText.assetFor(System.getProperty("os.name"), System.getProperty("os.arch"))
        val group = NotificationGroupManager.getInstance().getNotificationGroup("wmpy")
        if (asset == null) {
            group.createNotification("wmpy has no build for this computer. Install it with cargo.", NotificationType.ERROR).notify(project)
            return
        }
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Downloading $asset", true) {
            private var result: String? = null

            override fun run(indicator: ProgressIndicator) {
                val version = pluginVersion()
                val tags = if (Regex("^\\d+\\.\\d+\\.\\d+$").matches(version) && version != "0.0.0") {
                    listOf("download/v$version", "latest/download")
                } else {
                    listOf("latest/download")
                }
                val work = Files.createTempDirectory("wmpy-download")
                try {
                    var lastError: Exception? = null
                    for (tag in tags) {
                        try {
                            val archive = work.resolve(asset)
                            HttpRequests.request("$RELEASES/$tag/$asset").productNameAsUserAgent().saveToFile(archive.toFile(), indicator)
                            val sums = HttpRequests.request("$RELEASES/$tag/$asset.sha256").productNameAsUserAgent().readString(indicator)
                            val want = WmpyText.sha256Of(sums, asset) ?: error("$asset.sha256 holds no SHA-256")
                            val got = MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(archive)).joinToString("") { "%02x".format(it) }
                            check(got == want) { "$asset does not match its SHA-256 (expected $want, got $got)" }
                            val out = work.resolve("out")
                            if (asset.endsWith(".zip")) Decompressor.Zip(archive).extract(out) else Decompressor.Tar(archive).extract(out)
                            val found = Files.walk(out).use { s -> s.filter { it.fileName.toString() == exe }.findFirst().orElse(null) }
                                ?: error("$asset has no $exe in it")
                            val dest = downloadedPath()
                            Files.createDirectories(dest.parent)
                            Files.copy(found, dest, java.nio.file.StandardCopyOption.REPLACE_EXISTING)
                            dest.toFile().setExecutable(true)
                            result = dest.toString()
                            return
                        } catch (e: HttpRequests.HttpStatusException) {
                            lastError = e
                            if (e.statusCode != 404) throw e
                        }
                    }
                    throw lastError ?: IllegalStateException("no release has $asset")
                } finally {
                    work.toFile().deleteRecursively()
                }
            }

            override fun onSuccess() {
                result?.let {
                    group.createNotification("Downloaded wmpy to $it", NotificationType.INFORMATION).notify(project)
                    then(it)
                }
            }

            override fun onThrowable(error: Throwable) {
                group.createNotification("Could not download wmpy", error.message ?: error.toString(), NotificationType.ERROR).notify(project)
            }
        })
    }
}
