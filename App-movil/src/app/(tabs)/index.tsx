import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { OptionSheet } from '@/components/common/OptionSheet';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { VetSuggestionCard } from '@/components/incidents/VetSuggestionCard';
import { TaskCard } from '@/components/tasks/TaskCard';
import { POSTPONE_OPTIONS } from '@/constants/options';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { useFocusData } from '@/hooks/useFocusData';
import { useNow } from '@/hooks/useNow';
import { type RealtimeSubscription, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { getIncidents } from '@/services/incidents';
import { cancelTaskNotifications, requestTaskNotificationSync } from '@/services/notifications';
import { getPets } from '@/services/pets';
import {
  ensureTasksGenerated,
  getTasksForDay,
  TaskAlreadyResolvedError,
  type TaskAction,
  updateTaskStatus,
} from '@/services/tasks';
import type { IncidentRow, PetRow, TaskWithContext } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';
import { formatDayHeading, formatTime, getDateKey } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { getVetSuggestions, getVetSuggestionWindowStart } from '@/utils/incidents';
import { getTaskEffectiveTime, isTaskActionable, isTaskOverdue } from '@/utils/schedules';

type TodayData = { tasks: TaskWithContext[]; activePets: PetRow[]; recentIncidents: IncidentRow[] };

const EMPTY_TASKS: TaskWithContext[] = [];
const EMPTY_INCIDENTS: IncidentRow[] = [];
const POSTPONE_SHEET_OPTIONS = POSTPONE_OPTIONS.map((option) => ({
  key: String(option.minutes),
  label: option.label,
  icon: 'time-outline' as const,
}));

function groupByTime(tasks: TaskWithContext[], timeZone: string) {
  const groups = new Map<string, TaskWithContext[]>();
  for (const task of tasks) {
    const key = formatTime(task.programada_para, timeZone);
    const items = groups.get(key) ?? [];
    items.push(task);
    groups.set(key, items);
  }
  return Array.from(groups.entries()).map(([time, items]) => ({
    time,
    items: [...items].sort(
      (left, right) =>
        left.mascota.nombre.localeCompare(right.mascota.nombre, 'es') || left.cuidado.nombre.localeCompare(right.cuidado.nombre, 'es'),
    ),
  }));
}

export default function TodayScreen() {
  const { user, displayName } = useSession();
  const { household, households, timeZone, getMemberName } = useHousehold();
  const householdId = household?.id ?? null;
  const userId = user?.id ?? null;
  const now = useNow(30_000);
  const todayKey = getDateKey(new Date(now), timeZone);
  const params = useLocalSearchParams<{ taskId?: string; notificationAction?: string }>();
  const focusedTaskId = typeof params.taskId === 'string' ? params.taskId : null;
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [postponeTarget, setPostponeTarget] = useState<TaskWithContext | null>(null);
  const [snoozeHandledFor, setSnoozeHandledFor] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loader = useMemo(
    () =>
      householdId
        ? async (): Promise<TodayData> => {
            await ensureTasksGenerated(householdId);
            const [tasks, pets, recentIncidents] = await Promise.all([
              getTasksForDay(householdId, todayKey, timeZone),
              getPets(householdId),
              getIncidents(householdId, { sinceIso: getVetSuggestionWindowStart(Date.now()) }),
            ]);
            return { tasks, activePets: pets.filter((pet) => pet.activa), recentIncidents };
          }
        : null,
    [householdId, timeZone, todayKey],
  );
  const { data, error, loading, refresh, refreshing, reload } = useFocusData(loader, {
    errorMessage: 'No se pudieron cargar las tareas de hoy.',
    resetKey: householdId ?? 'sin-hogar',
  });

  // Cualquier cambio de otro miembro (hecha, pospuesta, nuevas tareas) se refleja al instante.
  const subscriptions = useMemo<RealtimeSubscription[]>(
    () =>
      householdId
        ? [
            { table: 'tareas_programadas', filter: `hogar_id=eq.${householdId}` },
            { table: 'incidentes', filter: `hogar_id=eq.${householdId}` },
          ]
        : [],
    [householdId],
  );
  useRealtimeRefresh(householdId ? `hoy-${householdId}` : null, subscriptions, reload);

  const tasks = data?.tasks ?? EMPTY_TASKS;
  const recentIncidents = data?.recentIncidents ?? EMPTY_INCIDENTS;
  const suggestions = useMemo(() => getVetSuggestions(recentIncidents, now), [now, recentIncidents]);
  const petNames = new Map((data?.activePets ?? []).map((pet) => [pet.id, pet.nombre]));
  const focusedTask = focusedTaskId ? tasks.find((task) => task.id === focusedTaskId) ?? null : null;
  const groups = useMemo(
    () => groupByTime(focusedTask ? tasks.filter((task) => task.id !== focusedTask.id) : tasks, timeZone),
    [focusedTask, tasks, timeZone],
  );
  const notificationSnoozeTask =
    params.notificationAction === 'snooze' && focusedTask && isTaskActionable(focusedTask) && snoozeHandledFor !== focusedTask.id
      ? focusedTask
      : null;
  const sheetTask = postponeTarget ?? notificationSnoozeTask;

  const done = tasks.filter((task) => task.estado === 'hecha').length;
  const skipped = tasks.filter((task) => task.estado === 'omitida').length;
  const overdue = tasks.filter((task) => isTaskOverdue(task, now)).length;
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const nextTask = tasks
    .filter((task) => isTaskActionable(task) && getTaskEffectiveTime(task) > now)
    .sort((left, right) => getTaskEffectiveTime(left) - getTaskEffectiveTime(right))[0];

  function actorName(memberId: string | null) {
    if (memberId && memberId === userId) return 'ti';
    return getMemberName(memberId) ?? 'otro miembro';
  }

  async function changeTask(task: TaskWithContext, status: TaskAction, minutes?: number) {
    if (busyTaskId) return;
    setBusyTaskId(task.id);
    setActionError(null);
    try {
      await updateTaskStatus(task.id, status, minutes);
      void cancelTaskNotifications(task.id).catch(() => undefined);
      if (userId) requestTaskNotificationSync(userId, households);
      await reload();
    } catch (changeError) {
      if (changeError instanceof TaskAlreadyResolvedError) {
        const who = changeError.task.hecha_por === userId ? 'Tú ya la habías' : `${getMemberName(changeError.task.hecha_por) ?? 'Otro miembro'} ya la había`;
        setActionError(`${who} marcado como ${changeError.task.estado === 'hecha' ? 'hecha' : 'omitida'}.`);
        await reload();
      } else {
        setActionError(getErrorMessage(changeError, 'No se pudo actualizar la tarea.'));
      }
    } finally {
      setBusyTaskId(null);
    }
  }

  function confirmSkip(task: TaskWithContext) {
    Alert.alert(
      'Omitir tarea',
      `¿Omitir "${task.cuidado.nombre}" de ${task.mascota.nombre} (${formatTime(task.programada_para, timeZone)})? Quedará registrado en el historial.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Omitir', style: 'destructive', onPress: () => void changeTask(task, 'omitida') },
      ],
    );
  }

  function closeSheet() {
    if (notificationSnoozeTask) setSnoozeHandledFor(notificationSnoozeTask.id);
    setPostponeTarget(null);
  }

  function selectPostpone(key: string) {
    const task = sheetTask;
    closeSheet();
    const minutes = Number(key);
    if (task && POSTPONE_OPTIONS.some((option) => option.minutes === minutes)) {
      void changeTask(task, 'pospuesta', minutes);
    }
  }

  function renderTask(task: TaskWithContext, highlighted = false) {
    return (
      <TaskCard
        actorName={actorName}
        busy={busyTaskId === task.id}
        disabled={Boolean(busyTaskId)}
        highlighted={highlighted}
        key={task.id}
        now={now}
        onDone={() => void changeTask(task, 'hecha')}
        onPostpone={() => setPostponeTarget(task)}
        onSkip={() => confirmSkip(task)}
        task={task}
        timeZone={timeZone}
      />
    );
  }

  return (
    <AppScreen onRefresh={() => void refresh()} refreshing={refreshing}>
      <ScreenHeader
        subtitle={`${formatDayHeading(todayKey, timeZone)}${household ? ` · ${household.nombre}` : ''}`}
        title={`Hola, ${displayName.split(' ')[0]}`}
      />
      {actionError ? <Notice tone="error">{actionError}</Notice> : null}
      {loading ? <LoadingState label="Cargando tareas de hoy..." /> : null}
      {!loading && error && !data ? <ErrorState message={error} onRetry={() => void refresh()} retrying={refreshing} /> : null}
      {data ? (
        <>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {data.activePets.length ? (
            <View style={styles.quickActions}>
              <View style={styles.quickAction}>
                <AppButton compact icon="alert-circle-outline" onPress={() => router.push('/incident/add')} variant="outline">
                  Incidente
                </AppButton>
              </View>
              <View style={styles.quickAction}>
                <AppButton compact icon="walk-outline" onPress={() => router.push('/walk/add')} variant="outline">
                  Paseo
                </AppButton>
              </View>
            </View>
          ) : null}
          {suggestions.map((suggestion) => (
            <VetSuggestionCard
              key={`${suggestion.petId}-${suggestion.tipo}`}
              petName={petNames.get(suggestion.petId) ?? 'Tu mascota'}
              suggestion={suggestion}
            />
          ))}
          {data.activePets.length === 0 ? (
            <EmptyState
              action={<AppButton onPress={() => router.push('/pet/add')}>Agregar mascota</AppButton>}
              message="Agrega a tu primera mascota y sus cuidados con horario para ver aquí las tareas de cada día."
              title="Tu hogar empieza aquí"
            />
          ) : !tasks.length ? (
            <EmptyState
              action={
                <AppButton onPress={() => router.push('/(tabs)/pets')} variant="secondary">
                  Ir a Mascotas
                </AppButton>
              }
              icon="checkmark-done-outline"
              message="No hay tareas programadas para hoy. Agrega cuidados con horario desde la ficha de cada mascota."
              title="Sin tareas para hoy"
            />
          ) : (
            <>
              <Card>
                <View style={styles.progressHeader}>
                  <View style={styles.progressCopy}>
                    <Text style={styles.eyebrow}>PROGRESO DE HOY</Text>
                    <Text style={styles.progressTitle}>
                      {done} de {tasks.length} tareas hechas
                    </Text>
                  </View>
                  <Text style={styles.progressValue}>{progress}%</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressBar, { width: `${progress}%` }]} />
                </View>
                <Text style={styles.progressHint}>
                  {overdue
                    ? `${overdue} ${overdue === 1 ? 'tarea atrasada' : 'tareas atrasadas'}.`
                    : nextTask
                      ? `Siguiente: ${nextTask.cuidado.nombre} de ${nextTask.mascota.nombre} a las ${formatTime(new Date(getTaskEffectiveTime(nextTask)).toISOString(), timeZone)}.`
                      : 'No quedan tareas pendientes por hoy.'}
                  {skipped ? ` ${skipped} omitida${skipped === 1 ? '' : 's'}.` : ''}
                </Text>
              </Card>

              {focusedTask ? (
                <View style={styles.group}>
                  <View style={styles.groupHeader}>
                    <Ionicons color={colors.primary} name="notifications-outline" size={18} />
                    <Text style={styles.groupTitle}>Del recordatorio</Text>
                  </View>
                  {renderTask(focusedTask, true)}
                </View>
              ) : null}

              {groups.map((group) => {
                const resolved = group.items.filter((task) => !isTaskActionable(task)).length;
                return (
                  <View key={group.time} style={styles.group}>
                    <View style={styles.groupHeader}>
                      <Ionicons color={colors.primary} name="time-outline" size={18} />
                      <Text style={styles.groupTitle}>{group.time}</Text>
                      <Text style={styles.groupCount}>
                        {resolved}/{group.items.length}
                      </Text>
                    </View>
                    {group.items.map((task) => renderTask(task))}
                  </View>
                );
              })}
            </>
          )}
        </>
      ) : null}

      <OptionSheet
        message={sheetTask ? `${sheetTask.cuidado.nombre} de ${sheetTask.mascota.nombre}. ¿Cuándo te lo recordamos?` : undefined}
        onClose={closeSheet}
        onSelect={selectPostpone}
        options={POSTPONE_SHEET_OPTIONS}
        title="Posponer tarea"
        visible={Boolean(sheetTask)}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  progressHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  progressCopy: { flex: 1 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  progressTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 5 },
  progressValue: { color: colors.primary, fontSize: 25, fontWeight: '800' },
  progressTrack: { backgroundColor: colors.border, borderRadius: radius.pill, height: 9, marginTop: spacing.md, overflow: 'hidden' },
  progressBar: { backgroundColor: colors.secondary, borderRadius: radius.pill, height: '100%' },
  progressHint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  quickActions: { flexDirection: 'row', gap: spacing.sm },
  quickAction: { flex: 1 },
  group: { gap: spacing.sm },
  groupHeader: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: spacing.xs },
  groupTitle: { color: colors.text, flex: 1, fontSize: 18, fontWeight: '800' },
  groupCount: { color: colors.muted, fontSize: 13, fontWeight: '700' },
});
