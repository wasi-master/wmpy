package com.wasimaster.wmpy.actions

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.util.ExecUtil
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.ide.actions.RevealFileAction
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import com.wasimaster.wmpy.WmpyBinary
import com.wasimaster.wmpy.WmpyPlugins
import com.wasimaster.wmpy.WmpyText
import com.wasimaster.wmpy.preview.PreviewService
import com.wasimaster.wmpy.run.WmpyRunner
import java.io.File
import javax.swing.JComponent

private fun notify(project: Project?, title: String, text: String, type: NotificationType = NotificationType.INFORMATION) =
    NotificationGroupManager.getInstance().getNotificationGroup("wmpy").createNotification(title, text, type).also { it.notify(project) }

/** An action on one plugin folder, shown when the project has a plugin.json. */
abstract class PluginAction : AnAction(), DumbAware {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null
    }

    final override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val root = WmpyPlugins.pick(project, e) ?: return
        FileEditorManager.getInstance(project).selectedFiles.forEach { com.intellij.openapi.fileEditor.FileDocumentManager.getInstance().getDocument(it)?.let { d -> com.intellij.openapi.fileEditor.FileDocumentManager.getInstance().saveDocument(d) } }
        perform(project, root)
    }

    abstract fun perform(project: Project, root: VirtualFile)
}

class PreviewAction : PluginAction() {
    override fun perform(project: Project, root: VirtualFile) = PreviewService.get(project).show(root)
}

class RunAction : PluginAction() {
    override fun perform(project: Project, root: VirtualFile) = WmpyRunner.run(project, root)
}

class TestAction : PluginAction() {
    override fun perform(project: Project, root: VirtualFile) = WmpyRunner.test(project, root, null)
}

class CheckAction : PluginAction() {
    override fun perform(project: Project, root: VirtualFile) =
        WmpyRunner.console(project, root, "wmpy check: ${WmpyPlugins.label(root)}", listOf("check", root.path))
}

class PackAction : PluginAction() {
    override fun perform(project: Project, root: VirtualFile) {
        val exe = WmpyBinary.require(project) ?: return
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Packing ${WmpyPlugins.label(root)}", false) {
            override fun run(indicator: ProgressIndicator) {
                val out = ExecUtil.execAndGetOutput(GeneralCommandLine(exe, "pack", root.path).withWorkDirectory(root.path).withCharset(Charsets.UTF_8))
                val text = (out.stdout + out.stderr).trim()
                if (out.exitCode != 0) {
                    notify(project, "wmpy pack failed", text, NotificationType.ERROR)
                    return
                }
                val packed = root.toNioPath().toFile().walkTopDown().maxDepth(2).filter { it.extension == "wmplugin" }.maxByOrNull { it.lastModified() }
                val n = notify(project, "Packed ${WmpyPlugins.label(root)}", text.ifEmpty { packed?.name ?: "" })
                if (packed != null) n.addAction(NotificationAction.createSimple("Reveal") { RevealFileAction.openFile(packed) })
            }
        })
    }
}

class StubsAction : PluginAction() {
    override fun perform(project: Project, root: VirtualFile) =
        WmpyRunner.console(project, root, "wmpy stubs", listOf("stubs", root.path)) { code ->
            if (code == 0) {
                LocalFileSystem.getInstance().refreshAndFindFileByPath(root.path + "/.wmpy/stubs")
                notify(
                    project,
                    "Wrote .wmpy/stubs",
                    "PyCharm reads them once the folder is on the interpreter's paths, or marked as a Sources Root (right-click .wmpy/stubs, Mark Directory as).",
                )
            }
        }
}

class PublishAction : PluginAction() {
    override fun perform(project: Project, root: VirtualFile) =
        WmpyRunner.console(project, root, "wmpy publish: ${WmpyPlugins.label(root)}", listOf("publish", root.path))
}

private val PACKAGE = Regex("^[A-Za-z0-9][A-Za-z0-9._\\-\\[\\],<>=!~ ]*$")

abstract class PipAction(private val verb: String, private val prompt: String) : PluginAction() {
    override fun perform(project: Project, root: VirtualFile) {
        val name = Messages.showInputDialog(project, prompt, "wmpy pip $verb", null)?.trim() ?: return
        if (!PACKAGE.matches(name)) {
            Messages.showErrorDialog(project, "\"$name\" is not a package name.", "wmpy pip $verb")
            return
        }
        WmpyRunner.console(project, root, "wmpy pip $verb $name", listOf("pip", verb) + name.split(Regex("\\s+")))
    }
}

class PipInstallAction : PipAction("install", "A pure-Python package from PyPI, such as python-dateutil or humanize==4.9:")

class PipRemoveAction : PipAction("remove", "The package to take out of the plugin:")

/** File | New | wmpy Plugin. */
class NewPluginAction : AnAction(), DumbAware {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project
        val selected = e.getData(CommonDataKeys.VIRTUAL_FILE)
        val parent = (if (selected?.isDirectory == true) selected else selected?.parent)?.path ?: project?.basePath ?: System.getProperty("user.home")
        val dialog = NewPluginDialog(project, parent)
        if (!dialog.showAndGet()) return
        val exe = WmpyBinary.require(project) ?: return
        val dir = File(dialog.location, WmpyText.folderName(dialog.name))
        val out = ExecUtil.execAndGetOutput(GeneralCommandLine(exe, "new", dir.path, "--template", dialog.template, "--name", dialog.name).withCharset(Charsets.UTF_8))
        if (out.exitCode != 0) {
            Messages.showErrorDialog(project, (out.stderr + out.stdout).trim(), "wmpy new")
            return
        }
        val folder = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(dir) ?: return
        folder.refresh(false, true)
        val main = folder.findChild("main.py")
        if (project != null && main != null) FileEditorManager.getInstance(project).openFile(main, true)
    }
}

class NewPluginDialog(project: Project?, parent: String) : DialogWrapper(project) {
    private val templates = ComboBox(WmpyText.TEMPLATES.map { it.second }.toTypedArray())
    private val nameField = JBTextField("My plugin")
    private val locationField = TextFieldWithBrowseButton()

    val template: String get() = WmpyText.TEMPLATES[templates.selectedIndex.coerceAtLeast(0)].first
    val name: String get() = nameField.text.trim()
    val location: String get() = locationField.text.trim()

    init {
        title = "New wmpy Plugin"
        locationField.text = parent
        locationField.addBrowseFolderListener(project, FileChooserDescriptorFactory.createSingleFolderDescriptor().withTitle("Make It In"))
        init()
    }

    override fun createCenterPanel(): JComponent = FormBuilder.createFormBuilder()
        .addLabeledComponent("Template:", templates)
        .addLabeledComponent("Name:", nameField)
        .addLabeledComponent("Make it in:", locationField)
        .addComponentToRightColumn(com.intellij.ui.components.JBLabel("The folder is named after the plugin."))
        .panel

    override fun doValidate(): ValidationInfo? = when {
        name.isEmpty() -> ValidationInfo("Type a name", nameField)
        name.length > 40 -> ValidationInfo("Up to 40 characters", nameField)
        !File(location).isDirectory -> ValidationInfo("Not a folder", locationField)
        File(location, WmpyText.folderName(name)).exists() -> ValidationInfo("${WmpyText.folderName(name)} already exists there", nameField)
        else -> null
    }

    override fun getPreferredFocusedComponent(): JComponent = nameField
}
