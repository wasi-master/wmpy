package com.wasimaster.wmpy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WmpyTextTest {
    @Test
    fun manifestsAreToldFromOtherPluginJsonFiles() {
        assertTrue(WmpyText.isManifest("""{"format": "wmkeyboard-plugin", "id": "a.b.c"}"""))
        assertTrue(WmpyText.isManifest("""{"id": "a.b.c", "apiVersion": 5}"""))
        assertFalse(WmpyText.isManifest("""{"name": "claude-plugin", "version": "1.0.0"}"""))
        assertEquals("Coin \\\"Flip\\\"", WmpyText.manifestName("""{"name": "Coin \"Flip\"", "id": "x"}"""))
        assertNull(WmpyText.manifestName("""{"id": "x"}"""))
    }

    @Test
    fun thePreviewLineGivesTheAddress() {
        assertEquals("http://127.0.0.1:41234/?t=abc", WmpyText.previewUrl("""{"url":"http://127.0.0.1:41234/?t=abc","port":41234}"""))
        assertEquals("http://127.0.0.1:1/?t=x", WmpyText.previewUrl("http://127.0.0.1:1/?t=x\n"))
        assertNull(WmpyText.previewUrl("starting"))
    }

    @Test
    fun theEmbedAddressKeepsTheToken() {
        assertEquals("http://h:1/?t=abc&embed=1&theme=dark", WmpyText.embedUrl("http://h:1/?t=abc", true))
        assertEquals("http://h:1/?t=abc&embed=1&theme=light", WmpyText.embedUrl("http://h:1/?t=abc&embed=1&theme=dark", false))
        assertEquals("http://h:1/?embed=1&theme=light", WmpyText.embedUrl("http://h:1/", false))
    }

    @Test
    fun assetsAndFolderNames() {
        assertEquals("wmpy-aarch64-apple-darwin.tar.gz", WmpyText.assetFor("Mac OS X", "aarch64"))
        assertEquals("wmpy-x86_64-pc-windows-msvc.zip", WmpyText.assetFor("Windows 11", "amd64"))
        assertEquals("wmpy-x86_64-unknown-linux-musl.tar.gz", WmpyText.assetFor("Linux", "amd64"))
        assertNull(WmpyText.assetFor("Linux", "x86"))
        assertEquals("coin-flip", WmpyText.folderName("Coin Flip!"))
        assertEquals("cafe", WmpyText.folderName("Café"))
        val hex = "ab".repeat(32)
        assertEquals(hex, WmpyText.sha256Of("$hex  wmpy-x.zip\n", "wmpy-x.zip"))
        assertNull(WmpyText.sha256Of("$hex  other.zip\n", "wmpy-x.zip"))
    }
}
