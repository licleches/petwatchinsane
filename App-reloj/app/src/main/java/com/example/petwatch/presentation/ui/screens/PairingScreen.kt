package com.example.petwatch.presentation.ui.screens

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import com.example.petwatch.R
import com.example.petwatch.presentation.ui.components.ScrollScreen
import com.example.petwatch.presentation.ui.components.WideButton
import com.example.petwatch.presentation.viewmodel.PairingUiState
import java.util.Locale

@Composable
fun PairingScreen(
    state: PairingUiState,
    onStartPairing: () -> Unit
) {
    ScrollScreen {
        Text(
            text = "PetWatch",
            color = MaterialTheme.colorScheme.primary,
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(Modifier.height(4.dp))
        when (state) {
            PairingUiState.Starting -> {
                Text("Vincular reloj", style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(10.dp))
                CircularProgressIndicator(modifier = Modifier.size(36.dp))
                Spacer(Modifier.height(8.dp))
                Hint("Solicitando código seguro...")
            }
            is PairingUiState.Pending -> {
                Hint("Escribe este código en la app PetWatch del teléfono: Ajustes > Smartwatch")
                Spacer(Modifier.height(8.dp))
                Text(
                    text = state.pairingCode,
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 34.sp,
                    letterSpacing = 4.sp
                )
                Spacer(Modifier.height(4.dp))
                Hint("Expira en ${formatRemaining(state.remainingSeconds)}")
                Spacer(Modifier.height(4.dp))
                Text(
                    text = state.errorMessage ?: "Esperando autorización...",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (state.errorMessage == null) {
                        MaterialTheme.colorScheme.secondary
                    } else {
                        MaterialTheme.colorScheme.error
                    },
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(10.dp))
                WideButton(
                    label = "Otro código",
                    onClick = onStartPairing,
                    iconRes = R.drawable.ic_refresh,
                    colors = ButtonDefaults.filledTonalButtonColors()
                )
            }
            PairingUiState.Expired -> {
                Text(
                    text = "El código expiró",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.titleSmall,
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(10.dp))
                WideButton(label = "Generar código", onClick = onStartPairing, iconRes = R.drawable.ic_refresh)
            }
            is PairingUiState.Error -> {
                Text(
                    text = state.message,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(10.dp))
                WideButton(label = "Intentar de nuevo", onClick = onStartPairing, iconRes = R.drawable.ic_refresh)
            }
            PairingUiState.Ready -> {
                Text(
                    text = "Reloj vinculado",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.titleSmall
                )
                Spacer(Modifier.height(8.dp))
                CircularProgressIndicator(modifier = Modifier.size(28.dp))
            }
        }
    }
}

@Composable
private fun Hint(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center
    )
}

private fun formatRemaining(seconds: Long): String =
    String.format(Locale.US, "%02d:%02d", seconds / 60, seconds % 60)
