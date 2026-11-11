package com.example.petwatch.presentation.ui.alarm

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
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.CompactButton
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import com.example.petwatch.R
import com.example.petwatch.presentation.data.model.CareType
import com.example.petwatch.presentation.data.model.POSTPONE_OPTIONS
import com.example.petwatch.presentation.ui.components.WideButton
import com.example.petwatch.presentation.ui.screens.postponeLabel

@Composable
fun TaskAlarmScreen(
    petName: String,
    careName: String,
    careType: CareType,
    timeLabel: String,
    onDone: () -> Unit,
    onPostpone: (Int) -> Unit,
    onSkip: () -> Unit,
    onSilence: () -> Unit
) {
    var showPostponeOptions by remember { mutableStateOf(false) }
    val listState = rememberScalingLazyListState()
    AppScaffold {
        ScreenScaffold(scrollState = listState) { contentPadding ->
            ScalingLazyColumn(
                state = listState,
                contentPadding = contentPadding,
                modifier = Modifier.fillMaxSize()
            ) {
                item {
                    Icon(
                        painter = painterResource(careType.iconRes),
                        contentDescription = careType.label,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(32.dp)
                    )
                }
                item {
                    Text(
                        text = petName,
                        color = MaterialTheme.colorScheme.primary,
                        fontSize = 22.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    Text(
                        text = careName,
                        style = MaterialTheme.typography.titleMedium,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                if (timeLabel.isNotBlank()) {
                    item {
                        Text(
                            text = timeLabel,
                            fontSize = 26.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
                item { WideButton(label = "Hecha", iconRes = R.drawable.ic_check, onClick = onDone) }
                if (showPostponeOptions) {
                    POSTPONE_OPTIONS.forEach { minutes ->
                        item {
                            WideButton(
                                label = "Posponer ${postponeLabel(minutes)}",
                                iconRes = R.drawable.ic_snooze,
                                colors = ButtonDefaults.filledTonalButtonColors(),
                                onClick = { onPostpone(minutes) }
                            )
                        }
                    }
                } else {
                    item {
                        WideButton(
                            label = "Posponer",
                            iconRes = R.drawable.ic_snooze,
                            colors = ButtonDefaults.filledTonalButtonColors(),
                            onClick = { showPostponeOptions = true }
                        )
                    }
                }
                item {
                    WideButton(
                        label = "Omitir",
                        iconRes = R.drawable.ic_close,
                        colors = ButtonDefaults.outlinedButtonColors(),
                        onClick = onSkip
                    )
                }
                item {
                    CompactButton(
                        onClick = onSilence,
                        colors = ButtonDefaults.filledTonalButtonColors(),
                        label = { Text("Silenciar") }
                    )
                }
            }
        }
    }
}
