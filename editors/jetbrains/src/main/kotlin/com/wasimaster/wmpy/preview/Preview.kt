package com.wasimaster.wmpy.preview

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessListener
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.ide.BrowserUtil
import com.intellij.ide.ui.LafManager
import com.intellij.ide.ui.LafManagerListener
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBLabel
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.util.ui.JBUI
import com.wasimaster.wmpy.WmpyBinary
import com.wasimaster.wmpy.WmpyPlugins
import com.wasimaster.wmpy.WmpyText
import java.util.concurrent.ConcurrentHashMap
import javax.swing.SwingConstants

const val TOOL_WINDOW_ID = "wmpy Preview"

/** The tool window, empty until a plugin is previewed. */
class PreviewToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        if (toolWindow.contentManager.contentCount == 0) {
            val hint = JBLabel("Open a plugin's file and choose Tools | wmpy | Preview.", SwingConstants.CENTER)
            hint.border = JBUI.Borders.empty(16)
            toolWindow.contentManager.addContent(ContentFactory.getInstance().createContent(hint, "", false))
        }
    }
}

/**
 * One `wmpy preview` per plugin folder, shown in a JCEF browser in the tool
 * window. Without JCEF the page opens in the system browser instead.
 */
@Service(Service.Level.PROJECT)
class PreviewService(private val project: Project) : Disposable {
    private class Running(val handler: OSProcessHandler, val url: String, val browser: JBCefBrowser?)

    private val running = ConcurrentHashMap<String, Running>()

    init {
        ApplicationManager.getApplication().messageBus.connect(this)
            .subscribe(LafManagerListener.TOPIC, LafManagerListener { _: LafManager -> retheme() })
    }

    private fun dark(): Boolean = !JBColor.isBright()

    /** Shows [root]'s preview, starting `wmpy preview` for it the first time. */
    fun show(root: VirtualFile) {
        running[root.path]?.let { r ->
            if (!r.handler.isProcessTerminated) {
                if (r.browser != null) reveal(root) else BrowserUtil.browse(WmpyText.embedUrl(r.url, dark()))
                return
            }
            running.remove(root.path)
        }
        val exe = WmpyBinary.require(project) ?: return
        val line = GeneralCommandLine(exe, "preview", root.path, "--port", "0", "--no-open", "--print-url")
            .withWorkDirectory(root.path)
            .withCharset(Charsets.UTF_8)
        val handler = OSProcessHandler(line)
        var seen = false
        val stderr = StringBuilder()
        handler.addProcessListener(object : ProcessListener {
            override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                if (outputType == ProcessOutputTypes.STDERR) stderr.append(event.text)
                if (seen || outputType != ProcessOutputTypes.STDOUT) return
                val url = WmpyText.previewUrl(event.text) ?: return
                seen = true
                ApplicationManager.getApplication().invokeLater { open(root, handler, url) }
            }

            override fun processTerminated(event: ProcessEvent) {
                if (!seen) {
                    ApplicationManager.getApplication().invokeLater {
                        NotificationGroupManager.getInstance().getNotificationGroup("wmpy")
                            .createNotification("The preview did not start", stderr.toString().trim().ifEmpty { "wmpy preview exited with ${event.exitCode}" }, NotificationType.ERROR)
                            .notify(project)
                    }
                }
            }
        })
        handler.startNotify()
    }

    private fun open(root: VirtualFile, handler: OSProcessHandler, url: String) {
        if (project.isDisposed) {
            handler.destroyProcess()
            return
        }
        if (!JBCefApp.isSupported()) {
            running[root.path] = Running(handler, url, null)
            BrowserUtil.browse(WmpyText.embedUrl(url, dark()))
            return
        }
        val window = ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID) ?: return
        val browser = JBCefBrowser(WmpyText.embedUrl(url, dark()))
        val content = ContentFactory.getInstance().createContent(browser.component, WmpyPlugins.label(root), false)
        content.description = root.path
        Disposer.register(content, browser)
        Disposer.register(content, Disposable { running.remove(root.path)?.handler?.destroyProcess() })
        val manager = window.contentManager
        manager.contents.filter { it.description == null || it.description == root.path }.forEach { manager.removeContent(it, true) }
        running[root.path] = Running(handler, url, browser)
        manager.addContent(content)
        manager.setSelectedContent(content)
        window.show()
    }

    private fun reveal(root: VirtualFile) {
        val window = ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID) ?: return
        window.contentManager.contents.firstOrNull { it.description == root.path }?.let { window.contentManager.setSelectedContent(it) }
        window.show()
    }

    private fun retheme() {
        for (r in running.values) r.browser?.loadURL(WmpyText.embedUrl(r.url, dark()))
    }

    override fun dispose() {
        for (r in running.values) r.handler.destroyProcess()
        running.clear()
    }

    companion object {
        fun get(project: Project): PreviewService = project.getService(PreviewService::class.java)
    }
}
