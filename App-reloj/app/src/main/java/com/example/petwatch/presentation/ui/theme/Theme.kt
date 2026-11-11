package com.example.petwatch.presentation.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material3.ColorScheme
import androidx.wear.compose.material3.MaterialTheme

// Naranja cálido (primario), verde azulado (secundario) y lavanda (terciario).
private val PetWatchColorScheme = ColorScheme(
    primary = Color(0xFFFFB86B),
    primaryDim = Color(0xFFE89A4D),
    primaryContainer = Color(0xFF6B3A00),
    onPrimary = Color(0xFF3D2000),
    onPrimaryContainer = Color(0xFFFFDDBA),
    secondary = Color(0xFF7FD6C2),
    secondaryDim = Color(0xFF5FB9A5),
    secondaryContainer = Color(0xFF005046),
    onSecondary = Color(0xFF00382F),
    onSecondaryContainer = Color(0xFFA0F2DD),
    tertiary = Color(0xFFC3C8FF),
    tertiaryDim = Color(0xFFA5ABEB),
    tertiaryContainer = Color(0xFF353C7A),
    onTertiary = Color(0xFF1D2563),
    onTertiaryContainer = Color(0xFFE0E0FF),
)

@Composable
fun PetWatchTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = PetWatchColorScheme,
        content = content
    )
}
