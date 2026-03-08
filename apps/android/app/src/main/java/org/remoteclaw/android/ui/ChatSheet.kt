package org.remoteclaw.android.ui

import androidx.compose.runtime.Composable
import org.remoteclaw.android.MainViewModel
import org.remoteclaw.android.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
