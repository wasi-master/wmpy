package com.wasimaster.wmpy.run

import com.intellij.execution.DefaultExecutionResult
import com.intellij.execution.ExecutionException
import com.intellij.execution.ExecutionResult
import com.intellij.execution.Executor
import com.intellij.execution.ProgramRunnerUtil
import com.intellij.execution.RunManager
import com.intellij.execution.configurations.CommandLineState
import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.ConfigurationTypeBase
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.configurations.PtyCommandLine
import com.intellij.execution.configurations.RunConfiguration
import com.intellij.execution.configurations.RunConfigurationBase
import com.intellij.execution.configurations.RunConfigurationOptions
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.process.ColoredProcessHandler
import com.intellij.execution.process.KillableColoredProcessHandler
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessTerminatedListener
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.ProgramRunner
import com.intellij.execution.ui.RunContentExecutor
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.terminal.TerminalExecutionConsole
import com.intellij.util.ui.FormBuilder
import com.wasimaster.wmpy.WmpyBinary
import com.wasimaster.wmpy.WmpyPlugins
import java.io.File
import javax.swing.JComponent
import javax.swing.JTextField

private val ICON = IconLoader.getIcon("/icons/wmpy.svg", WmpyConfigurationType::class.java)

/** Run | Edit Configurations | wmpy: "wmpy run" and "wmpy test". */
class WmpyConfigurationType : ConfigurationTypeBase(ID, "wmpy", "Run or test a WM Keyboard plugin", ICON) {
    init {
        addFactory(WmpyFactory(this, Kind.RUN))
        addFactory(WmpyFactory(this, Kind.TEST))
    }

    companion object {
        const val ID = "WmpyConfigurationType"

        fun get(): WmpyConfigurationType =
            com.intellij.execution.configurations.ConfigurationTypeUtil.findConfigurationType(WmpyConfigurationType::class.java)
    }
}

enum class Kind(val title: String) { RUN("wmpy run"), TEST("wmpy test") }

class WmpyFactory(type: WmpyConfigurationType, val kind: Kind) : ConfigurationFactory(type) {
    override fun getId(): String = kind.title
    override fun getName(): String = kind.title
    override fun getOptionsClass(): Class<WmpyOptions> = WmpyOptions::class.java
    override fun createTemplateConfiguration(project: Project): RunConfiguration = WmpyConfiguration(project, this, kind.title, kind)
}

class WmpyOptions : RunConfigurationOptions() {
    private val dirOption = string("").provideDelegate(this, "pluginDir")
    private val filterOption = string("").provideDelegate(this, "filter")

    var pluginDir: String
        get() = dirOption.getValue(this) ?: ""
        set(v) = dirOption.setValue(this, v)

    var filter: String
        get() = filterOption.getValue(this) ?: ""
        set(v) = filterOption.setValue(this, v)
}

class WmpyConfiguration(project: Project, factory: ConfigurationFactory, name: String, val kind: Kind) :
    RunConfigurationBase<WmpyOptions>(project, factory, name) {

    public override fun getOptions(): WmpyOptions = super.getOptions() as WmpyOptions

    var pluginDir: String
        get() = options.pluginDir
        set(v) {
            options.pluginDir = v
        }

    var filter: String
        get() = options.filter
        set(v) {
            options.filter = v
        }

    override fun checkConfiguration() {
        if (pluginDir.isBlank() || !File(pluginDir, WmpyPlugins.MANIFEST).isFile) {
            throw RuntimeConfigurationError("Choose a folder with a plugin.json")
        }
    }

    override fun getConfigurationEditor(): SettingsEditor<out RunConfiguration> = WmpyEditor(project, kind)

    override fun getState(executor: Executor, environment: ExecutionEnvironment): RunProfileState {
        val exe = WmpyBinary.require(project) ?: throw ExecutionException("The wmpy program was not found. See Settings | Tools | wmpy.")
        val dir = pluginDir
        return if (kind == Kind.RUN) {
            // `wmpy run` draws in the terminal, so it runs on a pty in a terminal console.
            object : CommandLineState(environment) {
                override fun startProcess(): ProcessHandler {
                    val line = PtyCommandLine(listOf(exe, "run", dir))
                    line.withInitialColumns(120)
                    line.withWorkDirectory(dir)
                    line.withCharset(Charsets.UTF_8)
                    val handler = KillableColoredProcessHandler(line)
                    ProcessTerminatedListener.attach(handler)
                    return handler
                }

                override fun execute(executor: Executor, runner: ProgramRunner<*>): ExecutionResult {
                    val handler = startProcess()
                    val console = TerminalExecutionConsole(project, handler)
                    return DefaultExecutionResult(console, handler)
                }
            }
        } else {
            object : CommandLineState(environment) {
                override fun startProcess(): ProcessHandler {
                    val args = mutableListOf(exe, "test", dir)
                    if (filter.isNotBlank()) args += listOf("-k", filter)
                    val handler = ColoredProcessHandler(GeneralCommandLine(args).withWorkDirectory(dir).withCharset(Charsets.UTF_8))
                    ProcessTerminatedListener.attach(handler)
                    return handler
                }
            }
        }
    }
}

class WmpyEditor(private val project: Project, private val kind: Kind) : SettingsEditor<WmpyConfiguration>() {
    private val dir = TextFieldWithBrowseButton()
    private val filter = JTextField()

    init {
        dir.addBrowseFolderListener(project, FileChooserDescriptorFactory.createSingleFolderDescriptor().withTitle("Plugin Folder"))
    }

    override fun resetEditorFrom(c: WmpyConfiguration) {
        dir.text = c.pluginDir
        filter.text = c.filter
    }

    override fun applyEditorTo(c: WmpyConfiguration) {
        c.pluginDir = dir.text.trim()
        c.filter = filter.text.trim()
    }

    override fun createEditor(): JComponent {
        val form = FormBuilder.createFormBuilder().addLabeledComponent("Plugin folder:", dir)
        if (kind == Kind.TEST) form.addLabeledComponent("Only tests matching (-k):", filter)
        return form.panel
    }
}

/** Starting wmpy from actions and code lenses. */
object WmpyRunner {
    private fun launch(project: Project, root: VirtualFile, kind: Kind, filter: String?) {
        val manager = RunManager.getInstance(project)
        val label = WmpyPlugins.label(root)
        val name = if (filter.isNullOrBlank()) "${kind.title}: $label" else "${kind.title}: $label ($filter)"
        val factory = WmpyConfigurationType.get().configurationFactories.first { (it as WmpyFactory).kind == kind }
        val settings = manager.findConfigurationByName(name) ?: manager.createConfiguration(name, factory).also {
            val c = it.configuration as WmpyConfiguration
            c.pluginDir = root.path
            c.filter = filter.orEmpty()
            it.isTemporary = true
            manager.addConfiguration(it)
        }
        manager.selectedConfiguration = settings
        ProgramRunnerUtil.executeConfiguration(settings, DefaultRunExecutor.getRunExecutorInstance())
    }

    fun run(project: Project, root: VirtualFile) = launch(project, root, Kind.RUN, null)

    fun test(project: Project, root: VirtualFile, filter: String?) = launch(project, root, Kind.TEST, filter)

    /** Runs `wmpy <args>` in the Run tool window, where it can also read what the user types. */
    fun console(project: Project, root: VirtualFile, title: String, args: List<String>, onDone: (Int) -> Unit = {}) {
        val exe = WmpyBinary.require(project) ?: return
        val handler = ColoredProcessHandler(GeneralCommandLine(listOf(exe) + args).withWorkDirectory(root.path).withCharset(Charsets.UTF_8))
        ProcessTerminatedListener.attach(handler)
        handler.addProcessListener(object : com.intellij.execution.process.ProcessListener {
            override fun processTerminated(event: com.intellij.execution.process.ProcessEvent) = onDone(event.exitCode)
        })
        RunContentExecutor(project, handler).withTitle(title).withActivateToolWindow(true).run()
    }
}
