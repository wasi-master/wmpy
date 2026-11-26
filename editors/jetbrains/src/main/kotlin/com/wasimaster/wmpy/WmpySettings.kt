package com.wasimaster.wmpy

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.ui.DialogPanel
import com.intellij.ui.dsl.builder.COLUMNS_LARGE
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.columns
import com.intellij.ui.dsl.builder.panel

/** The plugin's one setting: where the wmpy program is. */
@State(name = "WmpySettings", storages = [Storage("wmpy.xml")])
class WmpySettings : PersistentStateComponent<WmpySettings.Data> {
    class Data {
        var path: String = ""
    }

    private var data = Data()

    var path: String
        get() = data.path
        set(value) {
            data.path = value.trim()
        }

    override fun getState(): Data = data

    override fun loadState(state: Data) {
        data = state
    }

    companion object {
        fun get(): WmpySettings = ApplicationManager.getApplication().getService(WmpySettings::class.java)
    }
}

/** Settings | Tools | wmpy. */
class WmpyConfigurable : BoundConfigurable("wmpy") {
    override fun createPanel(): DialogPanel = panel {
        row("wmpy program:") {
            textField()
                .bindText({ WmpySettings.get().path }, { WmpySettings.get().path = it })
                .columns(COLUMNS_LARGE)
                .comment("Empty looks on PATH, in ~/.cargo/bin and ~/.local/bin, then in the copy this plugin downloaded.")
        }
    }
}
