package com.wasimaster.wmpy

import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity

/** When a project has a plugin folder and wmpy is missing, offers to download it once. */
class WmpyStartup : ProjectActivity {
    override suspend fun execute(project: Project) {
        if (WmpyBinary.find() != null) return
        DumbService.getInstance(project).runWhenSmart {
            if (!project.isDisposed && WmpyPlugins.all(project).isNotEmpty()) WmpyBinary.require(project)
        }
    }
}
