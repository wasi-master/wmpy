package com.wasimaster.wmpy.lsp

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.redhat.devtools.lsp4ij.AbstractDocumentMatcher
import com.redhat.devtools.lsp4ij.LanguageServerFactory
import com.redhat.devtools.lsp4ij.client.features.LSPClientFeatures
import com.redhat.devtools.lsp4ij.commands.LSPCommand
import com.redhat.devtools.lsp4ij.commands.LSPCommandAction
import com.redhat.devtools.lsp4ij.server.ProcessStreamConnectionProvider
import com.redhat.devtools.lsp4ij.server.StreamConnectionProvider
import com.wasimaster.wmpy.WmpyBinary
import com.wasimaster.wmpy.WmpyPlugins
import com.wasimaster.wmpy.preview.PreviewService
import com.wasimaster.wmpy.run.WmpyRunner
import org.eclipse.lsp4j.InitializeParams
import java.net.URI

/** `wmpy lsp` over stdio, through LSP4IJ. */
class WmpyServerFactory : LanguageServerFactory {
    override fun createConnectionProvider(project: Project): StreamConnectionProvider = WmpyServer(project)

    override fun createClientFeatures(): LSPClientFeatures = WmpyClientFeatures()
}

class WmpyServer(project: Project) : ProcessStreamConnectionProvider() {
    init {
        // When wmpy is missing the start fails, and WmpyStartup has already offered the download.
        super.setCommands(listOf(WmpyBinary.find() ?: "wmpy", "lsp"))
        super.setWorkingDirectory(project.basePath)
    }
}

/** Tells the server the client shows previews itself, in the wmpy Preview tool window. */
class WmpyClientFeatures : LSPClientFeatures() {
    override fun initializeParams(initializeParams: InitializeParams) {
        super.initializeParams(initializeParams)
        initializeParams.initializationOptions = mapOf("preview" to "client")
    }
}

/** Python files inside a plugin folder. */
class InPluginFolder : AbstractDocumentMatcher() {
    override fun match(file: VirtualFile, project: Project): Boolean = WmpyPlugins.rootFor(file) != null
}

/** A WM Keyboard plugin.json, not another tool's. */
class IsPluginManifest : AbstractDocumentMatcher() {
    override fun match(file: VirtualFile, project: Project): Boolean = WmpyPlugins.isManifest(file)
}

/** The plugin folder a server command names as its first argument, a file URI. */
internal fun folderArgument(command: LSPCommand): VirtualFile? {
    val raw = textArgument(command, 0) ?: return null
    val path = runCatching { if (raw.startsWith("file:")) java.nio.file.Path.of(URI(raw)).toString() else raw }.getOrNull() ?: return null
    return LocalFileSystem.getInstance().refreshAndFindFileByPath(path)
}

internal fun textArgument(command: LSPCommand, i: Int): String? =
    (runCatching { command.getArgumentAt(i, String::class.java) }.getOrNull() ?: command.getArgumentAt(i)?.toString())
        ?.trim()?.removeSurrounding("\"")?.takeIf { it.isNotEmpty() && it != "null" }

/** ▶ Preview above `def render`: the preview tool window. */
class PreviewLensAction : LSPCommandAction() {
    override fun commandPerformed(command: LSPCommand, e: AnActionEvent) {
        val project = e.project ?: return
        val root = folderArgument(command) ?: WmpyPlugins.rootFor(e.getData(com.intellij.openapi.actionSystem.CommonDataKeys.VIRTUAL_FILE)) ?: return
        PreviewService.get(project).show(root)
    }
}

/** Run tests on a test file or a `def test_*`: a wmpy test run configuration. */
class TestLensAction : LSPCommandAction() {
    override fun commandPerformed(command: LSPCommand, e: AnActionEvent) {
        val project = e.project ?: return
        val root = folderArgument(command) ?: return
        WmpyRunner.test(project, root, textArgument(command, 1))
    }
}

/** The server's `wmpy.run`: a wmpy run configuration. */
class RunLensAction : LSPCommandAction() {
    override fun commandPerformed(command: LSPCommand, e: AnActionEvent) {
        val project = e.project ?: return
        val root = folderArgument(command) ?: return
        WmpyRunner.run(project, root)
    }
}
