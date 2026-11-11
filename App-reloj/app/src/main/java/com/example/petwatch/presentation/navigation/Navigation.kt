package com.example.petwatch.presentation.navigation

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import com.example.petwatch.presentation.AppContainer
import com.example.petwatch.presentation.MainActivity
import com.example.petwatch.presentation.data.repository.IncidentResult
import com.example.petwatch.presentation.ui.screens.HomeScreen
import com.example.petwatch.presentation.ui.screens.IncidentPetScreen
import com.example.petwatch.presentation.ui.screens.IncidentTypeScreen
import com.example.petwatch.presentation.ui.screens.PairingScreen
import com.example.petwatch.presentation.ui.screens.PermissionCard
import com.example.petwatch.presentation.ui.screens.TaskDetailScreen
import com.example.petwatch.presentation.ui.screens.WalkActiveScreen
import com.example.petwatch.presentation.ui.screens.WalkPermissionScreen
import com.example.petwatch.presentation.ui.screens.WalkPetPickerScreen
import com.example.petwatch.presentation.ui.screens.WalkSummaryScreen
import com.example.petwatch.presentation.ui.screens.rememberNow
import com.example.petwatch.presentation.ui.theme.PetWatchTheme
import com.example.petwatch.presentation.utils.Haptics
import com.example.petwatch.presentation.utils.PermissionSnapshot
import com.example.petwatch.presentation.utils.Permissions
import com.example.petwatch.presentation.utils.formatDuration
import com.example.petwatch.presentation.viewmodel.HomeViewModel
import com.example.petwatch.presentation.viewmodel.PairingUiState
import com.example.petwatch.presentation.viewmodel.PairingViewModel
import com.example.petwatch.presentation.viewmodel.PetsUiState
import com.example.petwatch.presentation.viewmodel.WalkViewModel

const val PAIRING_ROUTE = "pairing"
const val HOME_ROUTE = "home"
const val TASK_ROUTE = "task/{taskId}"
const val WALK_PETS_ROUTE = "walk/pets"
const val WALK_ACTIVE_ROUTE = "walk/active"
const val WALK_SUMMARY_ROUTE = "walk/summary"
const val INCIDENT_PETS_ROUTE = "incident"
const val INCIDENT_TYPES_ROUTE = "incident/{petId}"

fun taskRoute(taskId: String) = "task/$taskId"

fun incidentTypesRoute(petId: String) = "incident/$petId"

@Composable
fun PetWatchApp(
    container: AppContainer,
    destination: String?,
    onDestinationHandled: () -> Unit
) {
    PetWatchTheme {
        AppScaffold {
            val navController = rememberSwipeDismissableNavController()
            val pairingViewModel: PairingViewModel = viewModel(
                factory = remember(container) { PairingViewModel.Factory(container.pairingRepository) }
            )
            // Con alcance de la Activity: las pantallas comparten datos y estado.
            val homeViewModel: HomeViewModel = viewModel(
                factory = remember(container) {
                    HomeViewModel.Factory(
                        taskRepository = container.taskRepository,
                        petRepository = container.petRepository,
                        onTasksLoaded = container::onTasksLoaded
                    )
                }
            )
            val walkViewModel: WalkViewModel = viewModel(
                factory = remember(container) {
                    WalkViewModel.Factory(container.walkRepository, container.petRepository)
                }
            )
            val pairingState by pairingViewModel.state.collectAsStateWithLifecycle()
            val walkSession by walkViewModel.session.collectAsStateWithLifecycle()
            val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route

            // Igual que MedTime: sin credencial válida solo se muestra la vinculación.
            LaunchedEffect(pairingState, currentRoute) {
                if (currentRoute == null) return@LaunchedEffect
                if (pairingState == PairingUiState.Ready) {
                    if (currentRoute == PAIRING_ROUTE) navController.navigateClearingStack(HOME_ROUTE)
                } else if (currentRoute != PAIRING_ROUTE) {
                    navController.navigateClearingStack(PAIRING_ROUTE)
                }
            }

            // Accesos directos del tile y de la notificación del paseo.
            LaunchedEffect(destination, pairingState, currentRoute) {
                if (destination == null || pairingState != PairingUiState.Ready) return@LaunchedEffect
                if (currentRoute == null || currentRoute == PAIRING_ROUTE) return@LaunchedEffect
                when (destination) {
                    MainActivity.DESTINATION_WALK -> navController.navigate(
                        if (walkSession != null) WALK_ACTIVE_ROUTE else WALK_PETS_ROUTE
                    ) { launchSingleTop = true }
                    MainActivity.DESTINATION_INCIDENT -> navController.navigate(INCIDENT_PETS_ROUTE) {
                        launchSingleTop = true
                    }
                }
                onDestinationHandled()
            }

            SwipeDismissableNavHost(
                navController = navController,
                startDestination = PAIRING_ROUTE
            ) {
                composable(PAIRING_ROUTE) {
                    PairingScreen(
                        state = pairingState,
                        onStartPairing = pairingViewModel::startPairing
                    )
                }

                composable(HOME_ROUTE) {
                    val context = LocalContext.current
                    var permissions by remember { mutableStateOf(PermissionSnapshot.read(context)) }
                    var askedNotifications by rememberSaveable { mutableStateOf(false) }
                    val notificationLauncher = rememberLauncherForActivityResult(
                        ActivityResultContracts.RequestPermission()
                    ) { permissions = PermissionSnapshot.read(context) }
                    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
                        permissions = PermissionSnapshot.read(context)
                        homeViewModel.refresh()
                    }
                    val permissionCards = buildList {
                        if (!permissions.notifications) {
                            add(PermissionCard("Para que suenen las alarmas de las tareas.", "Permitir avisos") {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !askedNotifications) {
                                    askedNotifications = true
                                    notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                } else {
                                    Permissions.open(context, Permissions.notificationSettingsIntent(context))
                                }
                            })
                        }
                        if (!permissions.exactAlarms) {
                            add(PermissionCard("Para avisarte a la hora exacta de cada tarea.", "Alarmas exactas") {
                                Permissions.open(context, Permissions.exactAlarmSettingsIntent(context))
                            })
                        }
                        if (!permissions.fullScreen) {
                            add(PermissionCard("Para mostrar la alarma aunque el reloj esté bloqueado.", "Pantalla completa") {
                                Permissions.open(context, Permissions.fullScreenSettingsIntent(context))
                            })
                        }
                    }
                    val homeState by homeViewModel.state.collectAsStateWithLifecycle()
                    val notice by homeViewModel.notice.collectAsStateWithLifecycle()
                    val actionInProgress by homeViewModel.actionInProgress.collectAsStateWithLifecycle()
                    val outboxCounts by container.outboxStore.counts.collectAsStateWithLifecycle()
                    val now by rememberNow(intervalMillis = 15_000L)
                    HomeScreen(
                        state = homeState,
                        notice = notice,
                        actionInProgress = actionInProgress,
                        walkInProgress = walkSession != null,
                        walkSummary = walkSession?.let { session ->
                            "${formatDuration(session.activeDurationAt(now) / 1000)} · ${session.petsLabel}"
                        },
                        pendingUploads = outboxCounts.pending,
                        failedWalks = outboxCounts.failedWalks,
                        permissionCards = permissionCards,
                        onTaskClick = { navController.navigate(taskRoute(it)) },
                        onWalk = {
                            navController.navigate(if (walkSession != null) WALK_ACTIVE_ROUTE else WALK_PETS_ROUTE)
                        },
                        onIncident = { navController.navigate(INCIDENT_PETS_ROUTE) },
                        onRefresh = homeViewModel::refresh,
                        onDismissNotice = homeViewModel::clearNotice,
                        onDiscardFailedWalks = container.outboxStore::discardFailedWalks,
                        onCredentialInvalid = pairingViewModel::clearAndStartPairing
                    )
                }

                composable(TASK_ROUTE) { entry ->
                    val taskId = entry.arguments?.getString("taskId").orEmpty()
                    val context = LocalContext.current
                    // Leer el estado hace que la pantalla se actualice cuando cambian las tareas.
                    val homeState by homeViewModel.state.collectAsStateWithLifecycle()
                    val actionInProgress by homeViewModel.actionInProgress.collectAsStateWithLifecycle()
                    var errorMessage by remember { mutableStateOf<String?>(null) }
                    val task = homeState.let { homeViewModel.task(taskId) }
                    TaskDetailScreen(
                        task = task,
                        inProgress = actionInProgress == taskId,
                        errorMessage = errorMessage,
                        onAction = { action, minutes ->
                            errorMessage = null
                            homeViewModel.applyAction(taskId, action, minutes) { success, message ->
                                if (success) {
                                    Haptics.confirm(context)
                                    navController.popBackStack()
                                } else {
                                    Haptics.reject(context)
                                    errorMessage = message
                                }
                            }
                        },
                        onClose = { navController.popBackStack() }
                    )
                }

                composable(WALK_PETS_ROUTE) {
                    val context = LocalContext.current
                    LaunchedEffect(Unit) { walkViewModel.loadPets() }
                    val petsState by walkViewModel.pets.collectAsStateWithLifecycle()
                    val selection by walkViewModel.selection.collectAsStateWithLifecycle()
                    var showPermissions by remember { mutableStateOf(false) }
                    var permissionDenied by remember { mutableStateOf(false) }
                    val startWalk = {
                        if (walkViewModel.start()) {
                            Haptics.confirm(context)
                            navController.navigate(WALK_ACTIVE_ROUTE) {
                                popUpTo(HOME_ROUTE)
                                launchSingleTop = true
                            }
                        }
                    }
                    val permissionLauncher = rememberLauncherForActivityResult(
                        ActivityResultContracts.RequestMultiplePermissions()
                    ) {
                        if (Permissions.hasActivityRecognition(context)) {
                            showPermissions = false
                            startWalk()
                        } else {
                            permissionDenied = true
                        }
                    }
                    if (showPermissions) {
                        WalkPermissionScreen(
                            denied = permissionDenied,
                            onRequest = { permissionLauncher.launch(Permissions.walkPermissions) },
                            onOpenSettings = { Permissions.open(context, Permissions.appDetailsIntent(context)) },
                            onCancel = {
                                showPermissions = false
                                permissionDenied = false
                            }
                        )
                    } else {
                        WalkPetPickerScreen(
                            state = petsState,
                            selection = selection,
                            onToggle = walkViewModel::toggle,
                            onStart = {
                                val missing = !Permissions.hasActivityRecognition(context) ||
                                    !Permissions.hasLocation(context)
                                if (missing) showPermissions = true else startWalk()
                            },
                            onRetry = walkViewModel::loadPets,
                            onCredentialInvalid = pairingViewModel::clearAndStartPairing
                        )
                    }
                }

                composable(WALK_ACTIVE_ROUTE) {
                    val gpsStatus by walkViewModel.gpsStatus.collectAsStateWithLifecycle()
                    val lastSummary by walkViewModel.lastSummary.collectAsStateWithLifecycle()
                    var finishing by remember { mutableStateOf(false) }
                    LaunchedEffect(walkSession, finishing) {
                        if (walkSession == null) {
                            if (finishing || lastSummary != null) {
                                navController.navigate(WALK_SUMMARY_ROUTE) {
                                    popUpTo(HOME_ROUTE)
                                    launchSingleTop = true
                                }
                            } else {
                                navController.popBackStack()
                            }
                        }
                    }
                    WalkActiveScreen(
                        session = walkSession,
                        gpsStatus = gpsStatus,
                        onIncident = { navController.navigate(INCIDENT_PETS_ROUTE) },
                        onPause = walkViewModel::pause,
                        onResume = walkViewModel::resume,
                        onFinish = {
                            finishing = true
                            walkViewModel.finish()
                        }
                    )
                }

                composable(INCIDENT_PETS_ROUTE) {
                    LaunchedEffect(Unit) { walkViewModel.loadPets() }
                    val petsState by walkViewModel.pets.collectAsStateWithLifecycle()
                    val walkPetIds = walkSession?.petIds.orEmpty()
                    // Se omite la elección en un paseo de una sola mascota (o si solo hay una).
                    val onlyPetId = when {
                        walkPetIds.size == 1 -> walkPetIds.first()
                        walkPetIds.isEmpty() -> (petsState as? PetsUiState.Ready)?.data?.pets
                            ?.singleOrNull()?.id
                        else -> null
                    }
                    LaunchedEffect(onlyPetId) {
                        if (onlyPetId != null) {
                            navController.navigate(incidentTypesRoute(onlyPetId)) {
                                popUpTo(INCIDENT_PETS_ROUTE) { inclusive = true }
                            }
                        }
                    }
                    IncidentPetScreen(
                        state = petsState,
                        walkPetIds = walkPetIds,
                        onPick = { pet -> navController.navigate(incidentTypesRoute(pet.id)) },
                        onRetry = walkViewModel::loadPets,
                        onCredentialInvalid = pairingViewModel::clearAndStartPairing
                    )
                }

                composable(INCIDENT_TYPES_ROUTE) { entry ->
                    val petId = entry.arguments?.getString("petId").orEmpty()
                    val context = LocalContext.current
                    val petsState by walkViewModel.pets.collectAsStateWithLifecycle()
                    var result by rememberSaveable { mutableStateOf<IncidentResult?>(null) }
                    val petName = (petsState as? PetsUiState.Ready)?.data?.pets?.firstOrNull { it.id == petId }?.name
                        ?: walkSession?.let { session ->
                            session.petNames.getOrNull(session.petIds.indexOf(petId))
                        }
                        ?: "Mascota"
                    IncidentTypeScreen(
                        petName = petName,
                        result = result,
                        onPick = { type ->
                            result = container.incidentRepository.record(petId, type)
                            Haptics.confirm(context)
                        },
                        onDone = {
                            if (!navController.popBackStack(INCIDENT_PETS_ROUTE, inclusive = true)) {
                                navController.popBackStack()
                            }
                        }
                    )
                }

                composable(WALK_SUMMARY_ROUTE) {
                    val summary by walkViewModel.lastSummary.collectAsStateWithLifecycle()
                    val outboxCounts by container.outboxStore.counts.collectAsStateWithLifecycle()
                    WalkSummaryScreen(
                        summary = summary,
                        uploaded = outboxCounts.walks == 0 && outboxCounts.failedWalks == 0,
                        onDone = { navController.popBackStack(HOME_ROUTE, inclusive = false) }
                    )
                }
            }
        }
    }
}

private fun NavHostController.navigateClearingStack(route: String) {
    navigate(route) {
        popUpTo(graph.id) { inclusive = true }
        launchSingleTop = true
    }
}
