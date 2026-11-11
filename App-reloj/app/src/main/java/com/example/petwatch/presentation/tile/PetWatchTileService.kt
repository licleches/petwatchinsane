package com.example.petwatch.presentation.tile

import android.content.Context
import androidx.concurrent.futures.CallbackToFutureAdapter
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders
import androidx.wear.protolayout.DeviceParametersBuilders
import androidx.wear.protolayout.DimensionBuilders
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.material.Chip
import androidx.wear.protolayout.material.ChipColors
import androidx.wear.protolayout.material.Text
import androidx.wear.protolayout.material.Typography
import androidx.wear.protolayout.material.layouts.PrimaryLayout
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.example.petwatch.R
import com.example.petwatch.presentation.MainActivity
import com.example.petwatch.presentation.appContainer
import com.google.common.util.concurrent.ListenableFuture

/** Tile con accesos rápidos a «Paseo» e «Incidente». */
class PetWatchTileService : TileService() {
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val walkInProgress = runCatching { appContainer.walkRepository.current() != null }.getOrDefault(false)
        val layout = layout(this, requestParams.deviceConfiguration, walkInProgress)
        val tile = TileBuilders.Tile.Builder()
            .setResourcesVersion(RESOURCES_VERSION)
            .setFreshnessIntervalMillis(FRESHNESS_MILLIS)
            .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(layout))
            .build()
        return immediate(tile)
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest
    ): ListenableFuture<ResourceBuilders.Resources> {
        val resources = ResourceBuilders.Resources.Builder()
            .setVersion(RESOURCES_VERSION)
            .addIdToImageMapping(ICON_WALK, imageResource(R.drawable.ic_paseo))
            .addIdToImageMapping(ICON_INCIDENT, imageResource(R.drawable.ic_incidente))
            .build()
        return immediate(resources)
    }

    private fun layout(
        context: Context,
        deviceParameters: DeviceParametersBuilders.DeviceParameters,
        walkInProgress: Boolean
    ): LayoutElementBuilders.LayoutElement {
        val walkChip = Chip.Builder(context, launch(MainActivity.DESTINATION_WALK), deviceParameters)
            .setPrimaryLabelContent(if (walkInProgress) "Paseo en curso" else "Paseo")
            .setIconContent(ICON_WALK)
            .setChipColors(ChipColors(PRIMARY, ON_PRIMARY))
            .setWidth(DimensionBuilders.expand())
            .build()
        val incidentChip = Chip.Builder(context, launch(MainActivity.DESTINATION_INCIDENT), deviceParameters)
            .setPrimaryLabelContent("Incidente")
            .setIconContent(ICON_INCIDENT)
            .setChipColors(ChipColors(SECONDARY_CONTAINER, ON_SECONDARY_CONTAINER))
            .setWidth(DimensionBuilders.expand())
            .build()
        val content = LayoutElementBuilders.Column.Builder()
            .setWidth(DimensionBuilders.expand())
            .addContent(walkChip)
            .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(DimensionBuilders.dp(6f)).build())
            .addContent(incidentChip)
            .build()
        return PrimaryLayout.Builder(deviceParameters)
            .setResponsiveContentInsetEnabled(true)
            .setPrimaryLabelTextContent(
                Text.Builder(context, "PetWatch")
                    .setTypography(Typography.TYPOGRAPHY_CAPTION1)
                    .setColor(ColorBuilders.argb(PRIMARY))
                    .build()
            )
            .setContent(content)
            .build()
    }

    /** Abre MainActivity directo en la pantalla del paseo o del incidente. */
    private fun launch(destination: String): ModifiersBuilders.Clickable =
        ModifiersBuilders.Clickable.Builder()
            .setId(destination)
            .setOnClick(
                ActionBuilders.LaunchAction.Builder()
                    .setAndroidActivity(
                        ActionBuilders.AndroidActivity.Builder()
                            .setPackageName(packageName)
                            .setClassName(MainActivity::class.java.name)
                            .addKeyToExtraMapping(
                                MainActivity.EXTRA_DESTINATION,
                                ActionBuilders.AndroidStringExtra.Builder().setValue(destination).build()
                            )
                            .build()
                    )
                    .build()
            )
            .build()

    private fun imageResource(drawable: Int): ResourceBuilders.ImageResource =
        ResourceBuilders.ImageResource.Builder()
            .setAndroidResourceByResId(
                ResourceBuilders.AndroidImageResourceByResId.Builder().setResourceId(drawable).build()
            )
            .build()

    private fun <T> immediate(value: T): ListenableFuture<T> =
        CallbackToFutureAdapter.getFuture { completer ->
            completer.set(value)
            "petwatch-tile"
        }

    companion object {
        private const val RESOURCES_VERSION = "1"
        private const val FRESHNESS_MILLIS = 15 * 60_000L
        private const val ICON_WALK = "paseo"
        private const val ICON_INCIDENT = "incidente"
        private const val PRIMARY = 0xFFFFB86B.toInt()
        private const val ON_PRIMARY = 0xFF3D2000.toInt()
        private const val SECONDARY_CONTAINER = 0xFF005046.toInt()
        private const val ON_SECONDARY_CONTAINER = 0xFFA0F2DD.toInt()

        /** Pide al sistema que vuelva a dibujar el tile (al iniciar o terminar un paseo). */
        fun requestUpdate(context: Context) {
            runCatching { getUpdater(context).requestUpdate(PetWatchTileService::class.java) }
        }
    }
}
