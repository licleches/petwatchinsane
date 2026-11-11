package com.example.petwatch.presentation.ui.screens

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.CompactButton
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import com.example.petwatch.R
import com.example.petwatch.presentation.data.model.PetTask
import com.example.petwatch.presentation.data.model.TaskStatus
import com.example.petwatch.presentation.ui.components.OfflineNotice
import com.example.petwatch.presentation.ui.components.WideButton
import com.example.petwatch.presentation.utils.formatRelative
import com.example.petwatch.presentation.utils.formatTime
import com.example.petwatch.presentation.viewmodel.HomeUiState
import java.time.Instant
import kotlinx.coroutines.delay

/** Aviso de permiso que falta, con su botón para resolverlo. */
data class PermissionCard(
    val message: String,
    val actionLabel: String,
    val onAction: () -> Unit
)

@Composable
fun HomeScreen(
    state: HomeUiState,
    notice: String?,
    actionInProgress: String?,
    walkInProgress: Boolean,
    walkSummary: String?,
    pendingUploads: Int,
    failedWalks: Int,
    permissionCards: List<PermissionCard>,
    onTaskClick: (String) -> Unit,
    onWalk: () -> Unit,
    onIncident: () -> Unit,
    onRefresh: () -> Unit,
    onDismissNotice: () -> Unit,
    onDiscardFailedWalks: () -> Unit,
    onCredentialInvalid: () -> Unit
) {
    LaunchedEffect(state) {
        if (state is HomeUiState.CredentialInvalid) onCredentialInvalid()
    }
    LaunchedEffect(notice) {
        if (notice != null) {
            delay(NOTICE_MILLIS)
            onDismissNotice()
        }
    }
    var showUnlinkHelp by remember { mutableStateOf(false) }
    val listState = rememberScalingLazyListState()

    ScreenScaffold(scrollState = listState) { contentPadding ->
        ScalingLazyColumn(
            state = listState,
            contentPadding = contentPadding,
            modifier = Modifier.fillMaxSize()
        ) {
            item { ListHeader { Text("Hoy") } }
            if (notice != null) {
                item {
                    Text(
                        text = notice,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.secondary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            item {
                WideButton(
                    label = if (walkInProgress) "Paseo en curso" else "Paseo",
                    secondaryLabel = walkSummary,
                    iconRes = R.drawable.ic_paseo,
                    onClick = onWalk
                )
            }
            item {
                WideButton(
                    label = "Incidente",
                    iconRes = R.drawable.ic_incidente,
                    onClick = onIncident,
                    colors = ButtonDefaults.filledTonalButtonColors()
                )
            }
            if (pendingUploads > 0) {
                item { OfflineNotice("$pendingUploads registro(s) por enviar. Se suben solos al tener conexión.") }
            }
            if (failedWalks > 0) {
                item {
                    WideButton(
                        label = "$failedWalks paseo(s) rechazado(s)",
                        secondaryLabel = "Toca para descartar",
                        iconRes = R.drawable.ic_close,
                        onClick = onDiscardFailedWalks,
                        colors = ButtonDefaults.filledTonalButtonColors()
                    )
                }
            }
            permissionCards.forEach { card ->
                item {
                    WideButton(
                        label = card.actionLabel,
                        secondaryLabel = card.message,
                        onClick = card.onAction,
                        colors = ButtonDefaults.filledVariantButtonColors()
                    )
                }
            }

            when (state) {
                HomeUiState.Loading, HomeUiState.CredentialInvalid -> item {
                    CircularProgressIndicator(modifier = Modifier.size(32.dp))
                }
                is HomeUiState.Error -> {
                    item {
                        Text(
                            text = state.message,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    item {
                        WideButton(label = "Reintentar", iconRes = R.drawable.ic_refresh, onClick = onRefresh)
                    }
                }
                is HomeUiState.Ready -> {
                    if (state.offlineMessage != null) {
                        item { OfflineNotice(state.offlineMessage) }
                    }
                    if (state.openTasks.isEmpty() && state.doneTasks.isEmpty()) {
                        item {
                            Text(
                                text = "No hay tareas para hoy",
                                style = MaterialTheme.typography.bodyMedium,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                    if (state.openTasks.isNotEmpty()) {
                        item { ListHeader { Text("Pendientes (${state.openTasks.size})") } }
                        items(state.openTasks, key = { it.id }) { task ->
                            TaskButton(
                                task = task,
                                busy = actionInProgress == task.id,
                                onClick = { onTaskClick(task.id) }
                            )
                        }
                    }
                    if (state.doneTasks.isNotEmpty()) {
                        item { ListHeader { Text("Completadas") } }
                        items(state.doneTasks, key = { it.id }) { task ->
                            TaskButton(task = task, busy = false, onClick = { onTaskClick(task.id) })
                        }
                    }
                    item {
                        CompactButton(
                            onClick = onRefresh,
                            icon = {
                                Icon(
                                    painter = painterResource(R.drawable.ic_refresh),
                                    contentDescription = null,
                                    modifier = Modifier.size(ButtonDefaults.ExtraSmallIconSize)
                                )
                            },
                            label = { Text("Actualizar · ${formatTime(state.fetchedAt)}") }
                        )
                    }
                }
            }

            item {
                CompactButton(
                    onClick = { showUnlinkHelp = !showUnlinkHelp },
                    colors = ButtonDefaults.filledTonalButtonColors(),
                    label = { Text("Desvincular") }
                )
            }
            if (showUnlinkHelp) {
                item {
                    Text(
                        text = "Desvincula este reloj desde la app PetWatch del teléfono (Ajustes > Smartwatch). El reloj te pedirá vincularlo de nuevo.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 6.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun TaskButton(task: PetTask, busy: Boolean, onClick: () -> Unit) {
    val now = Instant.now()
    val colors = when {
        !task.isOpen -> ButtonDefaults.filledTonalButtonColors()
        !task.effectiveAt.isAfter(now) -> ButtonDefaults.buttonColors()
        else -> ButtonDefaults.filledTonalButtonColors()
    }
    Button(
        onClick = onClick,
        enabled = !busy,
        modifier = Modifier.fillMaxWidth(),
        colors = colors,
        icon = {
            Icon(
                painter = painterResource(task.careType.iconRes),
                contentDescription = task.careType.label,
                modifier = Modifier.size(ButtonDefaults.IconSize)
            )
        },
        label = { Text("${task.petName} · ${task.careName}", maxLines = 2) },
        secondaryLabel = { Text(taskStatusLine(task, now), maxLines = 2) }
    )
}

fun taskStatusLine(task: PetTask, now: Instant = Instant.now()): String {
    val line = when (task.status) {
        TaskStatus.HECHA -> listOfNotNull(
            "Hecha",
            task.doneAt?.let(::formatTime),
            task.doneByName
        ).joinToString(" · ")
        TaskStatus.OMITIDA -> listOfNotNull("Omitida", task.doneByName).joinToString(" · ")
        TaskStatus.POSPUESTA -> "Pospuesta a ${formatTime(task.effectiveAt)}"
        TaskStatus.PENDIENTE -> if (task.effectiveAt.isAfter(now)) {
            "${formatTime(task.effectiveAt)} · ${formatRelative(task.effectiveAt, now)}"
        } else {
            "${formatTime(task.effectiveAt)} · Atrasada"
        }
    }
    return if (task.pendingSync) "$line · sin enviar" else line
}

private const val NOTICE_MILLIS = 3_000L
