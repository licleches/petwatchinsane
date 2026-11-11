package com.example.petwatch.presentation

import android.app.Application
import android.content.Context

class PetWatchApplication : Application() {
    val container: AppContainer by lazy { AppContainer(this) }

    override fun onCreate() {
        super.onCreate()
        container.onAppStart()
    }
}

/** Contenedor de dependencias desde cualquier Context (Activity, receiver, worker o servicio). */
val Context.appContainer: AppContainer
    get() = (applicationContext as PetWatchApplication).container
