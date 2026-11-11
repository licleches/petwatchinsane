package com.example.petwatch.presentation.ui.screens

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import com.example.petwatch.R
import com.example.petwatch.presentation.data.model.POSTPONE_OPTIONS
import com.example.petwatch.presentation.data.model.PetTask
import com.example.petwatch.presentation.data.model.TaskAction
import com.example.petwatch.presentation.ui.components.MessageScreen
import com.example.petwatch.presentation.ui.components.WideButton

/** Acciones directas de una tarea: Hecha, Posponer (15/30/60/120) u Omitir. */
@Composable
fun TaskDetailScreen(
    task: PetTask?,
    inProgress: Boolean,
    errorMessage: String?,
    onAction: (TaskAction, Int?) -> Unit,
    onClose: () -> Unit
) {
    if (task == null) {
        MessageScreen(
            title = "Tarea no disponible",
            message = "Vuelve a Inicio para actualizar la lista.",
            primaryLabel = "Volver",
            onPrimary = onClose
        )
        return
    }
    var showPostpone by remember { mutableStateOf(false) }
    val listState = rememberScalingLazyListState()

    ScreenScaffold(scrollState = listState) { contentPadding ->
        ScalingLazyColumn(
            state = listState,
            contentPadding = contentPadding,
            modifier = Modifier.fillMaxSize()
        ) {
            item {
                Icon(
                    painter = painterResource(task.careType.iconRes),
                    contentDescription = task.careType.label,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(28.dp)
                )
            }
            item { ListHeader { Text(task.petName, textAlign = TextAlign.Center) } }
            item {
                Text(
                    text = task.careName,
                    style = MaterialTheme.typography.titleMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            if (!task.careDetail.isNullOrBlank()) {
                item {
                    Text(
                        text = task.careDetail,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            item {
                Text(
                    text = taskStatusLine(task),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.secondary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            if (errorMessage != null) {
                item {
                    Text(
                        text = errorMessage,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            if (inProgress) {
                item { CircularProgressIndicator(modifier = Modifier.size(28.dp)) }
            }
            if (task.isOpen && !task.pendingSync) {
                item {
                    WideButton(
                        label = "Hecha",
                        iconRes = R.drawable.ic_check,
                        enabled = !inProgress,
                        onClick = { onAction(TaskAction.DONE, null) }
                    )
                }
                if (showPostpone) {
                    POSTPONE_OPTIONS.forEach { minutes ->
                        item {
                            WideButton(
                                label = postponeLabel(minutes),
                                iconRes = R.drawable.ic_snooze,
                                enabled = !inProgress,
                                colors = ButtonDefaults.filledTonalButtonColors(),
                                onClick = { onAction(TaskAction.POSTPONE, minutes) }
                            )
                        }
                    }
                } else {
                    item {
                        WideButton(
                            label = "Posponer",
                            iconRes = R.drawable.ic_snooze,
                            enabled = !inProgress,
                            colors = ButtonDefaults.filledTonalButtonColors(),
                            onClick = { showPostpone = true }
                        )
                    }
                }
                item {
                    WideButton(
                        label = "Omitir",
                        iconRes = R.drawable.ic_close,
                        enabled = !inProgress,
                        colors = ButtonDefaults.outlinedButtonColors(),
                        onClick = { onAction(TaskAction.SKIP, null) }
                    )
                }
            } else {
                item {
                    WideButton(label = "Volver", onClick = onClose, colors = ButtonDefaults.filledTonalButtonColors())
                }
            }
        }
    }
}

fun postponeLabel(minutes: Int): String =
    if (minutes < 60) "$minutes min" else "${minutes / 60} h"
