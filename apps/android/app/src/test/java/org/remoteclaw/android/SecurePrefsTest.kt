package org.remoteclaw.android

import android.content.Context
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class SecurePrefsTest {
  @Test
  fun loadLocationMode_migratesLegacyAlwaysValue() {
    val context = RuntimeEnvironment.getApplication()
    val prefs = context.getSharedPreferences("remoteclaw.node.secure", Context.MODE_PRIVATE)
    prefs.edit().clear().putString("location.enabledMode", "always").commit()

    val securePrefs = SecurePrefs(context)

    assertEquals(LocationMode.WhileUsing, securePrefs.locationMode.value)
    assertEquals("whileUsing", prefs.getString("location.enabledMode", null))
  }
}
