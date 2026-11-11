package com.example.petwatch.presentation.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.AlertDialog
import androidx.wear.compose.material3.AlertDialogDefaults
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.CheckboxButton
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.EdgeButton
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import com.example.petwatch.R
import com.example.petwatch.presentation.data.model.Pet
import com.example.petwatch.presentation.data.model.WalkSession
import com.example.petwatch.presentation.data.model.WalkSummary
import com.example.petwatch.presentation.data.repository.GpsStatus
import com.example.petwatch.presentation.ui.components.LoadingScreen
import com.example.petwatch.presentation.ui.components.OfflineNotice
import com.example.petwatch.presentation.ui.components.ScrollScreen
import com.example.petwatch.presentation.ui.components.WideButton
import com.example.petwatch.presentation.utils.formatDistance
import com.example.petwatch.presentation.utils.formatDuration
import com.example.petwatch.presentation.utils.formatKilometers
import com.example.petwatch.presentation.viewmodel.PetsUiState
import kotlinx.coroutines.delay

/** Hora actual que se actualiza cada segundo mientras la pantalla está visible. */
@Composable
fun rememberNow(intervalMillis: Long = 1_000L): State<Long> =
    produceState(System.currentTimeMillis()) {
        while (true) {
            value = System.currentTimeMillis()
            delay(intervalMillis)
        }
    }

/** Paso 1 del paseo: elegir una o varias mascotas (de un solo hogar) e iniciar. */
@Composable
fun WalkPetPickerScreen(
    state: PetsUiState,
    selection: Set<String>,
    onToggle: (Pet) -> Unit,
    onStart: () -> Unit,
    onRetry: () -> Unit,
    onCredentialInvalid: () -> Unit
) {
    LaunchedEffect(state) {
        if (state is PetsUiState.CredentialInvalid) onCredentialInvalid()
    }
    val listState = rememberScalingLazyListState()
    ScreenScaffold(
        scrollState = listState,
        edgeButton = {
            EdgeButton(onClick = onStart, enabled = selection.isNotEmpty()) {
                Text("Iniciar")
            }
        }
    ) { contentPadding ->
        ScalingLazyColumn(
            state = listState,
            contentPadding = contentPadding,
            modifier = Modifier.fillMaxSize()
        ) {
            item { ListHeader { Text("¿Con quién paseas?") } }
            when (state) {
                PetsUiState.Loading, PetsUiState.CredentialInvalid -> item {
                    CircularProgressIndicator(modifier = Modifier.size(32.dp))
                }
                is PetsUiState.Error -> {
                    item { ErrorText(state.message) }
                    item { WideButton(label = "Reintentar", iconRes = R.drawable.ic_refresh, onClick = onRetry) }
                }
                is PetsUiState.Ready -> {
                    if (state.offlineMessage != null) item { OfflineNotice(state.offlineMessage) }
                    if (state.data.pets.isEmpty()) {
                        item { ErrorText("No hay mascotas activas. Agrégalas en la app del teléfono.") }
                    }
                    val byHousehold = state.data.pets.groupBy { it.householdId }
                    byHousehold.forEach { (householdId, pets) ->
                        if (byHousehold.size > 1) {
                            item { ListHeader { Text(state.data.householdName(householdId)) } }
                        }
                        items(pets, key = { it.id }) { pet ->
                            CheckboxButton(
                                checked = pet.id in selection,
                                onCheckedChange = { onToggle(pet) },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("${pet.emoji} ${pet.name}", maxLines = 2) }
                            )
                        }
                    }
                    if (byHousehold.size > 1) {
                        item { OfflineNotice("Un paseo incluye mascotas de un solo hogar.") }
                    }
                }
            }
        }
    }
}

/** Explicación antes de pedir los permisos del paseo. */
@Composable
fun WalkPermissionScreen(
    denied: Boolean,
    onRequest: () -> Unit,
    onOpenSettings: () -> Unit,
    onCancel: () -> Unit
) {
    ScrollScreen {
        Icon(
            painter = painterResource(R.drawable.ic_paseo),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(28.dp)
        )
        Spacer(Modifier.height(4.dp))
        Text("Permisos del paseo", style = MaterialTheme.typography.titleSmall, textAlign = TextAlign.Center)
        Spacer(Modifier.height(4.dp))
        Text(
            text = if (denied) {
                "Sin «Actividad física» no se pueden contar los pasos. Actívala en Ajustes > Permisos."
            } else {
                "PetWatch usa «Actividad física» para contar los pasos y «Ubicación» para la ruta y la distancia, solo mientras registras un paseo."
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(8.dp))
        if (denied) {
            WideButton(label = "Abrir ajustes", onClick = onOpenSettings)
        } else {
            WideButton(label = "Permitir", iconRes = R.drawable.ic_check, onClick = onRequest)
        }
        Spacer(Modifier.height(4.dp))
        WideButton(label = "Cancelar", onClick = onCancel, colors = ButtonDefaults.filledTonalButtonColors())
    }
}

/** Paseo en curso: tiempo, km y pasos, con Incidente, Pausa y Terminar. */
@Composable
fun WalkActiveScreen(
    session: WalkSession?,
    gpsStatus: GpsStatus,
    onIncident: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onFinish: () -> Unit
) {
    if (session == null) {
        LoadingScreen("Guardando paseo...")
        return
    }
    val now by rememberNow()
    var confirmFinish by remember { mutableStateOf(false) }
    val listState = rememberScalingLazyListState()

    ScreenScaffold(scrollState = listState) { contentPadding ->
        ScalingLazyColumn(
            state = listState,
            contentPadding = contentPadding,
            modifier = Modifier.fillMaxSize()
        ) {
            item {
                Text(
                    text = if (session.paused) "En pausa" else session.petsLabel,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (session.paused) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.secondary,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            item {
                Text(
                    text = formatDuration(session.activeDurationAt(now) / 1000),
                    fontSize = 36.sp,
                    color = MaterialTheme.colorScheme.primary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    Metric(value = formatKilometers(session.distanceMeters), label = "km")
                    Metric(value = session.steps?.toString() ?: "—", label = "pasos")
                }
            }
            item {
                Text(
                    text = gpsLabel(session, gpsStatus),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            if (session.incidents.isNotEmpty()) {
                item {
                    Text(
                        text = "${session.incidents.size} incidente(s) en este paseo",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.tertiary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            item {
                WideButton(
                    label = "Incidente",
                    iconRes = R.drawable.ic_incidente,
                    colors = ButtonDefaults.filledTonalButtonColors(),
                    onClick = onIncident
                )
            }
            item {
                if (session.paused) {
                    WideButton(label = "Reanudar", iconRes = R.drawable.ic_play, onClick = onResume)
                } else {
                    WideButton(
                        label = "Pausa",
                        iconRes = R.drawable.ic_pause,
                        colors = ButtonDefaults.filledTonalButtonColors(),
                        onClick = onPause
                    )
                }
            }
            item {
                WideButton(
                    label = "Terminar",
                    iconRes = R.drawable.ic_stop,
                    colors = ButtonDefaults.filledVariantButtonColors(),
                    onClick = { confirmFinish = true }
                )
            }
        }
    }

    AlertDialog(
        visible = confirmFinish,
        onDismissRequest = { confirmFinish = false },
        confirmButton = {
            AlertDialogDefaults.ConfirmButton(onClick = {
                confirmFinish = false
                onFinish()
            })
        },
        title = { Text("¿Terminar el paseo?") },
        text = { Text("Se guarda en el reloj y se envía al tener conexión.") }
    )
}

/** Resumen al terminar el paseo. */
@Composable
fun WalkSummaryScreen(
    summary: WalkSummary?,
    uploaded: Boolean,
    onDone: () -> Unit
) {
    ScrollScreen {
        Icon(
            painter = painterResource(R.drawable.ic_check),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(28.dp)
        )
        Text("Paseo guardado", style = MaterialTheme.typography.titleSmall)
        if (summary != null) {
            Text(
                text = summary.petNames.joinToString(", "),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.secondary,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = formatDuration(summary.activeSeconds),
                fontSize = 28.sp,
                color = MaterialTheme.colorScheme.primary
            )
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                Metric(value = formatDistance(summary.distanceMeters), label = "distancia")
                Metric(value = summary.steps?.toString() ?: "—", label = "pasos")
            }
            if (summary.incidents > 0) {
                Text(
                    text = "${summary.incidents} incidente(s)",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.tertiary
                )
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            text = if (uploaded) "Enviado a PetWatch" else "Se enviará solo al tener conexión",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(8.dp))
        WideButton(label = "Listo", onClick = onDone)
    }
}

@Composable
private fun Metric(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleMedium)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ErrorText(message: String) {
    Text(
        text = message,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.error,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth()
    )
}

private fun gpsLabel(session: WalkSession, status: GpsStatus): String = when {
    !session.usesHealthServices -> "Solo tiempo (sin sensores)"
    !session.gpsEnabled -> "Sin GPS · pasos y distancia estimada"
    status == GpsStatus.READY -> "GPS listo · ${session.routePoints} puntos"
    status == GpsStatus.UNAVAILABLE -> "GPS no disponible"
    else -> "Buscando GPS..."
}
