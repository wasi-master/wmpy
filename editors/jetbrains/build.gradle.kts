import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import org.jetbrains.kotlin.gradle.dsl.KotlinVersion

plugins {
    id("org.jetbrains.kotlin.jvm") version "2.4.21"
    id("org.jetbrains.intellij.platform") version "2.20.1"
}

group = "com.wasimaster"
version = providers.gradleProperty("pluginVersion").get()

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

kotlin {
    jvmToolchain(21)
    compilerOptions {
        // 2025.1 bundles Kotlin 2.1's standard library.
        apiVersion.set(KotlinVersion.KOTLIN_2_1)
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity(providers.gradleProperty("platformVersion"))
        bundledPlugin("com.intellij.modules.json")
        plugin("com.redhat.devtools.lsp4ij", providers.gradleProperty("lsp4ijVersion").get())
        pluginVerifier()
        zipSigner()
        testFramework(TestFrameworkType.Platform)
    }
    testImplementation("junit:junit:4.13.2")
}

intellijPlatform {
    pluginConfiguration {
        id = "com.wasimaster.wmpy"
        name = "wmpy"
        version = providers.gradleProperty("pluginVersion")
        ideaVersion {
            sinceBuild = providers.gradleProperty("sinceBuild")
            untilBuild = provider { null }
        }
    }
    publishing {
        token = providers.environmentVariable("JETBRAINS_TOKEN")
    }
    pluginVerification {
        ides {
            create(IntelliJPlatformType.PyCharmCommunity, "2025.1.7")
            create(IntelliJPlatformType.PyCharm, "2026.2.5")
            create(IntelliJPlatformType.IntellijIdea, "2026.2.5")
        }
    }
}

// The plugin.json schema is shared with the VS Code and Zed extensions.
tasks.processResources {
    from("../schemas/plugin.schema.json") {
        into("schemas")
    }
}
