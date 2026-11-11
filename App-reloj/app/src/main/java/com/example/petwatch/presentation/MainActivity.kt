package com.example.petwatch.presentation

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.mutableStateOf
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.example.petwatch.presentation.navigation.PetWatchApp

class MainActivity : ComponentActivity() {
    /** Pantalla pedida por el tile o por la notificación del paseo. */
    private val destination = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setTheme(android.R.style.Theme_DeviceDefault)

        val container = appContainer
        if (savedInstanceState == null) destination.value = intent?.getStringExtra(EXTRA_DESTINATION)
        // Si la app se cerró durante un paseo, el servicio vuelve a primer plano.
        container.walkRepository.restoreServiceIfNeeded()

        setContent {
            PetWatchApp(
                container = container,
                destination = destination.value,
                onDestinationHandled = { destination.value = null }
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        destination.value = intent.getStringExtra(EXTRA_DESTINATION)
    }

    companion object {
        const val EXTRA_DESTINATION = "destino"
        const val DESTINATION_WALK = "paseo"
        const val DESTINATION_INCIDENT = "incidente"
    }
}
