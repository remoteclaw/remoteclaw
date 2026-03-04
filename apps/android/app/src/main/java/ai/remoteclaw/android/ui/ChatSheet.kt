package ai.remoteclaw.android.ui

import androidx.compose.runtime.Composable
import ai.remoteclaw.android.MainViewModel
import ai.remoteclaw.android.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
