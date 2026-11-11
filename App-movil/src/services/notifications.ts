import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';

import { getRemindersEnabled } from '@/services/preferences';
import { ensureTasksGenerated, getTasksInRange } from '@/services/tasks';
import type { TaskWithContext } from '@/types/database';
import { formatTime, getDeviceTimeZone, getSafeTimeZone } from '@/utils/dates';

export const REMINDER_CHANNEL_ID = 'petwatch-recordatorios';
export const INCIDENT_CHANNEL_ID = 'petwatch-incidentes';
export const TASK_CATEGORY_ID = 'petwatchTarea';
export const COMPLETE_TASK_ACTION = 'completeTask';
export const SNOOZE_TASK_ACTION = 'snoozeTask';
export const REMINDER_WINDOW_DAYS = 7;
/** iOS permite 64 notificaciones programadas; se deja margen. */
export const MAX_SCHEDULED_REMINDERS = 60;
const REMINDER_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type ReminderKind = 'task' | 'taskSnooze';
const reminderKinds = new Set<string>(['task', 'taskSnooze']);

export type ReminderHousehold = { id: string; zona_horaria: string };

type TaskReminder = {
  task: TaskWithContext;
  kind: ReminderKind;
  triggerAt: Date;
};

type NotificationSynchronization = {
  generation: number;
  key: string;
  promise: Promise<boolean>;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let channelsConfigured = false;
let categoriesConfigured = false;
let synchronization: NotificationSynchronization | null = null;
let synchronizationGeneration = 0;

function logNotificationDiagnostic(operation: string, context: Record<string, string | undefined> = {}) {
  if (process.env.NODE_ENV === 'production') return;
  console.info(`[Notifications] ${operation}`, context);
}

async function ensureAndroidChannels() {
  if (Platform.OS !== 'android' || channelsConfigured) return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Recordatorios de cuidados',
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#C2410C',
  });
  await Notifications.setNotificationChannelAsync(INCIDENT_CHANNEL_ID, {
    name: 'Incidentes del hogar',
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: '#DC2626',
  });
  channelsConfigured = true;
}

export async function configureNotificationCategories() {
  if (Platform.OS === 'web' || categoriesConfigured) return;
  try {
    await Notifications.setNotificationCategoryAsync(TASK_CATEGORY_ID, [
      {
        identifier: COMPLETE_TASK_ACTION,
        buttonTitle: 'Hecho',
        options: { opensAppToForeground: true },
      },
      {
        identifier: SNOOZE_TASK_ACTION,
        buttonTitle: 'Posponer',
        options: { opensAppToForeground: true },
      },
    ]);
    categoriesConfigured = true;
  } catch (error) {
    logNotificationDiagnostic('category.setupFailed', { message: error instanceof Error ? error.message : 'unknown' });
  }
}

function isAllowed(permission: Notifications.NotificationPermissionsStatus) {
  return permission.granted || permission.ios?.status === IosAuthorizationStatus.PROVISIONAL;
}

export async function requestNotificationPermissions() {
  if (Platform.OS === 'web') return false;
  await ensureAndroidChannels();
  await configureNotificationCategories();

  const current = await Notifications.getPermissionsAsync();
  if (isAllowed(current)) return true;
  if (!current.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return isAllowed(requested);
}

async function cancelScheduledReminders(
  predicate: (data: Record<string, unknown>) => boolean = (data) => reminderKinds.has(String(data.kind)),
) {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => predicate(request.content.data ?? {}))
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

export async function cancelTaskNotifications(taskId: string) {
  await cancelScheduledReminders((data) => reminderKinds.has(String(data.kind)) && data.taskId === taskId);
}

export async function cancelAllReminderNotifications() {
  synchronizationGeneration += 1;
  await cancelScheduledReminders();
}

function getTaskReminders(tasks: TaskWithContext[], now: number) {
  const reminders: TaskReminder[] = [];
  for (const task of tasks) {
    if (task.estado === 'hecha' || task.estado === 'omitida') continue;
    if (!task.mascota.activa || !task.cuidado.activo || !task.horario.activo) continue;

    if (task.estado === 'pospuesta') {
      const postponedUntil = task.pospuesta_hasta ? Date.parse(task.pospuesta_hasta) : Number.NaN;
      if (Number.isFinite(postponedUntil) && postponedUntil > now) {
        reminders.push({ task, kind: 'taskSnooze', triggerAt: new Date(postponedUntil) });
      }
      continue;
    }

    const scheduledAt = Date.parse(task.programada_para);
    if (Number.isFinite(scheduledAt) && scheduledAt > now) {
      reminders.push({ task, kind: 'task', triggerAt: new Date(scheduledAt) });
    }
  }
  return reminders.sort((left, right) => left.triggerAt.getTime() - right.triggerAt.getTime());
}

async function getNotificationDelivery() {
  if (Platform.OS !== 'android') return undefined;
  try {
    const exactAlarm = await Notifications.getExactAlarmPermissionsAsync();
    return exactAlarm.granted ? ('alarmClock' as const) : ('bestEffort' as const);
  } catch {
    return 'bestEffort' as const;
  }
}

async function syncTaskNotificationsInternal(userId: string, households: ReminderHousehold[], generation: number) {
  if (Platform.OS === 'web') return false;
  if (!(await getRemindersEnabled(userId))) {
    if (generation === synchronizationGeneration) await cancelScheduledReminders();
    return false;
  }

  const allowed = await requestNotificationPermissions();
  if (!allowed) {
    if (generation === synchronizationGeneration) await cancelScheduledReminders();
    return false;
  }

  await Promise.all(households.map((household) => ensureTasksGenerated(household.id).catch(() => 0)));
  if (generation !== synchronizationGeneration) return false;

  const now = Date.now();
  const tasks = await getTasksInRange(
    households.map((household) => household.id),
    new Date(now - REMINDER_LOOKBACK_MS).toISOString(),
    new Date(now + REMINDER_WINDOW_DAYS * DAY_MS).toISOString(),
  );
  if (generation !== synchronizationGeneration) return false;

  const timeZones = new Map(households.map((household) => [household.id, getSafeTimeZone(household.zona_horaria)]));
  const delivery = await getNotificationDelivery();
  const reminders = getTaskReminders(tasks, now).slice(0, MAX_SCHEDULED_REMINDERS);

  await cancelScheduledReminders();
  for (const reminder of reminders) {
    if (generation !== synchronizationGeneration) {
      await cancelScheduledReminders();
      return false;
    }

    const { task, kind, triggerAt } = reminder;
    const timeZone = timeZones.get(task.hogar_id) ?? getDeviceTimeZone();
    const scheduledTime = formatTime(task.programada_para, timeZone);
    const detail = task.cuidado.detalle ? ` ${task.cuidado.detalle}` : '';

    await Notifications.scheduleNotificationAsync({
      content: {
        title:
          kind === 'taskSnooze'
            ? `Recordatorio: ${task.cuidado.nombre} de ${task.mascota.nombre}`
            : `${task.mascota.nombre}: ${task.cuidado.nombre}`,
        body: kind === 'taskSnooze' ? `Pospuesta desde las ${scheduledTime}.${detail}` : `Es la hora (${scheduledTime}).${detail}`,
        categoryIdentifier: TASK_CATEGORY_ID,
        data: { kind, userId, taskId: task.id, householdId: task.hogar_id },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerAt,
        channelId: REMINDER_CHANNEL_ID,
        ...(delivery ? { delivery } : {}),
      },
    });
  }

  if (generation !== synchronizationGeneration) {
    await cancelScheduledReminders();
    return false;
  }

  logNotificationDiagnostic('sync.completed', {
    userId,
    scheduled: String(reminders.length),
    households: String(households.length),
    delivery: delivery ?? 'system',
  });
  return true;
}

/** Reprograma los recordatorios locales de las tareas de todos los hogares del usuario. */
export function syncTaskNotifications(userId: string, households: ReminderHousehold[]) {
  const key = `${userId}|${households.map((household) => `${household.id}:${household.zona_horaria}`).join(',')}`;
  const current = synchronization;
  if (current && current.key === key && current.generation === synchronizationGeneration) {
    return current.promise;
  }

  synchronizationGeneration += 1;
  const generation = synchronizationGeneration;
  const previous = current?.promise;
  const nextSync = previous
    ? previous.catch(() => false).then(() => syncTaskNotificationsInternal(userId, households, generation))
    : syncTaskNotificationsInternal(userId, households, generation);
  const promise: Promise<boolean> = nextSync.finally(() => {
    if (synchronization?.promise === promise) synchronization = null;
  });
  synchronization = { generation, key, promise };
  return promise;
}

let pendingSyncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSyncArgs: { userId: string; households: ReminderHousehold[] } | null = null;

/** Agrupa varias peticiones seguidas en una sola sincronización. Nunca lanza errores. */
export function requestTaskNotificationSync(userId: string, households: ReminderHousehold[]) {
  pendingSyncArgs = { userId, households };
  if (pendingSyncTimer) clearTimeout(pendingSyncTimer);
  pendingSyncTimer = setTimeout(() => {
    pendingSyncTimer = null;
    const args = pendingSyncArgs;
    pendingSyncArgs = null;
    if (args) {
      void syncTaskNotifications(args.userId, args.households).catch((error: unknown) => {
        logNotificationDiagnostic('sync.failed', { message: error instanceof Error ? error.message : 'unknown' });
      });
    }
  }, 1000);
}

/** Muestra de inmediato el aviso de un incidente registrado por otro miembro. */
export async function presentIncidentNotification({
  title,
  body,
  data,
}: {
  title: string;
  body: string;
  data: Record<string, string>;
}) {
  if (Platform.OS === 'web') return false;
  const permission = await Notifications.getPermissionsAsync();
  if (!isAllowed(permission)) return false;
  await ensureAndroidChannels();
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { kind: 'incident', ...data }, sound: 'default' },
    trigger: Platform.OS === 'android' ? { channelId: INCIDENT_CHANNEL_ID } : null,
  });
  return true;
}
