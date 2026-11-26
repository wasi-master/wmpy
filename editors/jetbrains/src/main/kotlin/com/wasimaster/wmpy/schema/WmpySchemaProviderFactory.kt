package com.wasimaster.wmpy.schema

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.jetbrains.jsonSchema.extension.JsonSchemaFileProvider
import com.jetbrains.jsonSchema.extension.JsonSchemaProviderFactory
import com.jetbrains.jsonSchema.extension.SchemaType

/**
 * The plugin.json schema, the same file the VS Code and Zed extensions use.
 * It is offered for every plugin.json; the schema itself checks only files
 * that have format, pluginVersion or apiVersion, so other tools' plugin.json
 * files get no errors from it.
 */
class WmpySchemaProviderFactory : JsonSchemaProviderFactory {
    override fun getProviders(project: Project): List<JsonSchemaFileProvider> = listOf(Provider)

    private object Provider : JsonSchemaFileProvider {
        override fun isAvailable(file: VirtualFile): Boolean = file.name == "plugin.json"
        override fun getName(): String = "WM Keyboard plugin"
        override fun getSchemaFile(): VirtualFile? =
            JsonSchemaProviderFactory.getResourceFile(WmpySchemaProviderFactory::class.java, "/schemas/plugin.schema.json")
        override fun getSchemaType(): SchemaType = SchemaType.embeddedSchema
        override fun getRemoteSource(): String = "https://raw.githubusercontent.com/wasi-master/wmpy/main/editors/schemas/plugin.schema.json"
    }
}
