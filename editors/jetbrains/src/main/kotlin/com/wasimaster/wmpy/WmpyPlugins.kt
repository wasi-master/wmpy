package com.wasimaster.wmpy

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.search.FilenameIndex
import com.intellij.psi.search.GlobalSearchScope

/** Plugin folders: folders whose plugin.json is a WM Keyboard manifest. */
object WmpyPlugins {
    const val MANIFEST = "plugin.json"

    fun isManifest(file: VirtualFile): Boolean =
        file.name == MANIFEST && !file.isDirectory && runCatching { WmpyText.isManifest(VfsUtilCore.loadText(file)) }.getOrDefault(false)

    /** The plugin folder [file] is in: the nearest folder above it with a manifest. */
    fun rootFor(file: VirtualFile?): VirtualFile? {
        var dir = when {
            file == null -> return null
            file.isDirectory -> file
            else -> file.parent
        }
        while (dir != null) {
            val manifest = dir.findChild(MANIFEST)
            if (manifest != null && isManifest(manifest)) return dir
            dir = dir.parent
        }
        return null
    }

    /** Every plugin folder in the project. Needs indexes, so not in dumb mode. */
    fun all(project: Project): List<VirtualFile> = ReadAction.compute<List<VirtualFile>, RuntimeException> {
        FilenameIndex.getVirtualFilesByName(MANIFEST, GlobalSearchScope.projectScope(project))
            .filter(::isManifest)
            .mapNotNull { it.parent }
            .sortedBy { it.path }
    }

    fun label(root: VirtualFile): String =
        root.findChild(MANIFEST)?.let { runCatching { WmpyText.manifestName(VfsUtilCore.loadText(it)) }.getOrNull() } ?: root.name

    /**
     * The plugin an action works on: the one the selected file or the open
     * editor is in, the only one in the project, or one the user picks.
     */
    fun pick(project: Project, e: AnActionEvent?): VirtualFile? {
        rootFor(e?.getData(CommonDataKeys.VIRTUAL_FILE))?.let { return it }
        rootFor(FileEditorManager.getInstance(project).selectedFiles.firstOrNull())?.let { return it }
        val all = all(project)
        return when (all.size) {
            0 -> {
                Messages.showInfoMessage(project, "There is no plugin.json in this project. Make one with File | New | wmpy Plugin.", "wmpy")
                null
            }
            1 -> all[0]
            else -> {
                val names = all.map { "${label(it)}  (${it.path})" }.toTypedArray()
                val i = Messages.showChooseDialog(project, "Which plugin?", "wmpy", null, names, names[0])
                all.getOrNull(i)
            }
        }
    }
}
