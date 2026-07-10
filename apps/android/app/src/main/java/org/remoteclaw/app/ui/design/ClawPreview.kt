package org.remoteclaw.app.ui.design

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview

@Preview(
  name = "RemoteClaw Design System",
  showBackground = true,
  backgroundColor = 0xFF030303,
)
@Composable
private fun ClawComponentShowcasePreview() {
  ClawDesignTheme {
    ClawComponentShowcase()
  }
}
