package org.remoteclaw.app.ui

import androidx.compose.runtime.Composable
import org.remoteclaw.app.MainViewModel
import org.remoteclaw.app.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
