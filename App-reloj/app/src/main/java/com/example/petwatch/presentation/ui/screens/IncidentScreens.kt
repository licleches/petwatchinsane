package com.example.petwatch.presentation.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import com.example.petwatch.R
import com.example.petwatch.presentation.data.model.IncidentType
import com.example.petwatch.presentation.data.model.Pet
import com.example.petwatch.presentation.data.repository.IncidentResult
import com.example.petwatch.presentation.ui.components.OfflineNotice
import com.example.petwatch.presentation.ui.components.ScrollScreen
import com.example.petwatch.presentation.ui.components.WideButton
import com.example.petwatch.presentation.viewmodel.PetsUiState
import kotlinx.coroutines.delay

/** Incidente, paso 1: ¿a qué mascota le pasó? (las del paseo en curso aparecen primero). */
@Composable
fun IncidentPetScreen(
    state: PetsUiState,
    walkPetIds: List<String>,
    onPick: (Pet) -> Unit,
    onRetry: () -> Unit,
    onCredentialInvalid: () -> Unit
) {
    LaunchedEffect(state) {
        if (state is PetsUiState.CredentialInvalid) onCredentialInvalid()
    }
    val listState = rememberScalingLazyListState()
    ScreenScaffold(scrollState = listState) { contentPadding ->
        ScalingLazyColumn(
            state = listState,
            contentPadding = contentPadding,
            modifier = Modifier.fillMaxSize()
        ) {
            item { ListHeader { Text("¿A quién le pasó?") } }
            when (state) {
                PetsUiState.Loading, PetsUiState.CredentialInvalid -> item {
                    CircularProgressIndicator(modifier = Modifier.size(32.dp))
                }
                is PetsUiState.Error -> {
                    item {
                        Text(
                            text = state.message,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    item { WideButton(label = "Reintentar", iconRes = R.drawable.ic_refresh, onClick = onRetry) }
                }
                is PetsUiState.Ready -> {
                    if (state.offlineMessage != null) item { OfflineNotice(state.offlineMessage) }
                    val (inWalk, others) = state.data.pets.partition { it.id in walkPetIds }
                    if (inWalk.isNotEmpty()) {
                        item { ListHeader { Text("En el paseo") } }
                        items(inWalk, key = { it.id }) { pet -> PetButton(pet, onPick) }
                        if (others.isNotEmpty()) item { ListHeader { Text("Otras mascotas") } }
                    }
                    items(others, key = { it.id }) { pet -> PetButton(pet, onPick) }
                    if (state.data.pets.isEmpty()) {
                        item {
                            Text(
                                text = "No hay mascotas activas.",
                                style = MaterialTheme.typography.bodySmall,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PetButton(pet: Pet, onPick: (Pet) -> Unit) {
    Button(
        onClick = { onPick(pet) },
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.filledTonalButtonColors(),
        label = { Text("${pet.emoji} ${pet.name}", maxLines = 2) }
    )
}

/** Incidente, paso 2: cuadrícula de tipos. Un toque lo registra y vibra. */
@Composable
fun IncidentTypeScreen(
    petName: String,
    result: IncidentResult?,
    onPick: (IncidentType) -> Unit,
    onDone: () -> Unit
) {
    if (result != null) {
        LaunchedEffect(result) {
            delay(CONFIRMATION_MILLIS)
            onDone()
        }
        ScrollScreen {
            Icon(
                painter = painterResource(R.drawable.ic_check),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(40.dp)
            )
            Spacer(Modifier.height(6.dp))
            Text("Incidente registrado", style = MaterialTheme.typography.titleSmall, textAlign = TextAlign.Center)
            Spacer(Modifier.height(4.dp))
            Text(
                text = when (result) {
                    IncidentResult.IN_WALK -> "Con la ubicación del paseo. Se enviará con el paseo."
                    IncidentResult.QUEUED -> "Se enviará en cuanto haya conexión."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }
        return
    }

    val listState = rememberScalingLazyListState()
    ScreenScaffold(scrollState = listState) { contentPadding ->
        ScalingLazyColumn(
            state = listState,
            contentPadding = contentPadding,
            modifier = Modifier.fillMaxSize()
        ) {
            item { ListHeader { Text(petName, maxLines = 1) } }
            IncidentType.entries.chunked(2).forEach { row ->
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        row.forEach { type ->
                            Button(
                                onClick = { onPick(type) },
                                modifier = Modifier
                                    .weight(1f)
                                    .height(64.dp),
                                colors = ButtonDefaults.filledTonalButtonColors(),
                                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 4.dp)
                            ) {
                                Column(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Text(type.emoji, fontSize = 20.sp)
                                    Text(
                                        text = type.label,
                                        style = MaterialTheme.typography.labelSmall,
                                        maxLines = 1,
                                        textAlign = TextAlign.Center
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private const val CONFIRMATION_MILLIS = 1_500L
