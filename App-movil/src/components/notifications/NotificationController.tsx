import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import {
  cancelTaskNotifications,
  COMPLETE_TASK_ACTION,
  configureNotificationCategories,
  requestTaskNotificationSync,
  SNOOZE_TASK_ACTION,
} from '@/services/notifications';
import { TaskAlreadyResolvedError, updateTaskStatus } from '@/services/tasks';
import { getErrorMessage } from '@/utils/errors';

const TASK_SUBSCRIPTIONS = [{ table: 'tareas_programadas' }] as const;

function responseKey(response: Notifications.NotificationResponse) {
  return `${response.notification.request.identifier}:${response.actionIdentifier}`;
}

/**
 * Adaptado de MedTime: atiende los toques y botones de las notificaciones y
 * mantiene los recordatorios al día (al abrir la app y cuando otro miembro
 * cambia una tarea, vía Realtime).
 */
export function NotificationController() {
  const { isLoading, user } = useSession();
  const { household, households, selectHousehold } = useHousehold();
  const userId = user?.id ?? null;
  const handledResponses = useRef(new Set<string>());
  const householdsRef = useRef(households);
  const [pendingResponse, setPendingResponse] = useState<Notifications.NotificationResponse | null>(null);
  const householdsKey = households.map((item) => `${item.id}:${item.zona_horaria}`).join('|');

  useEffect(() => {
    householdsRef.current = households;
  }, [households]);

  const handleResponse = useCallback(
    async (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data ?? {};
      const kind = typeof data.kind === 'string' ? data.kind : null;

      if (kind === 'incident') {
        const petId = typeof data.petId === 'string' ? data.petId : null;
        if (petId) router.push({ pathname: '/pet/[id]', params: { id: petId, tab: 'incidentes' } });
        return;
      }
      if (kind !== 'task' && kind !== 'taskSnooze') return;

      const taskId = typeof data.taskId === 'string' ? data.taskId : null;
      const householdId = typeof data.householdId === 'string' ? data.householdId : null;
      if (!taskId || !userId || data.userId !== userId) return;

      if (householdId && householdId !== household?.id && householdsRef.current.some((item) => item.id === householdId)) {
        await selectHousehold(householdId);
      }

      if (response.actionIdentifier === COMPLETE_TASK_ACTION) {
        try {
          await updateTaskStatus(taskId, 'hecha');
        } catch (error) {
          if (!(error instanceof TaskAlreadyResolvedError)) {
            Alert.alert('No se pudo marcar la tarea', getErrorMessage(error));
          }
        }
        await cancelTaskNotifications(taskId).catch(() => undefined);
        requestTaskNotificationSync(userId, householdsRef.current);
      }

      const params = response.actionIdentifier === SNOOZE_TASK_ACTION ? { taskId, notificationAction: 'snooze' } : { taskId };
      router.push({ pathname: '/(tabs)', params });
    },
    [household?.id, selectHousehold, userId],
  );

  useEffect(() => {
    let mounted = true;
    void configureNotificationCategories();

    void Notifications.getLastNotificationResponseAsync().then((lastResponse) => {
      if (mounted && lastResponse) setPendingResponse(lastResponse);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      setPendingResponse(response);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pendingResponse || isLoading || !userId) return;
    const response = pendingResponse;
    const key = responseKey(response);
    if (handledResponses.current.has(key)) return;

    handledResponses.current.add(key);
    void handleResponse(response)
      .catch((error: unknown) => {
        Alert.alert('No se pudo procesar la notificación', getErrorMessage(error));
      })
      .finally(() => {
        Notifications.clearLastNotificationResponse();
        setPendingResponse((current) => (current === response ? null : current));
      });
  }, [handleResponse, isLoading, pendingResponse, userId]);

  // Sincroniza al iniciar sesión, al cambiar de hogares y al volver a primer plano.
  useEffect(() => {
    if (isLoading || !userId || !householdsKey) return;
    requestTaskNotificationSync(userId, householdsRef.current);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') requestTaskNotificationSync(userId, householdsRef.current);
    });
    return () => subscription.remove();
  }, [householdsKey, isLoading, userId]);

  // Si otro miembro resuelve o pospone una tarea, se reprograman los recordatorios.
  useRealtimeRefresh(userId && householdsKey ? `recordatorios-${userId}` : null, TASK_SUBSCRIPTIONS, () => {
    if (userId) requestTaskNotificationSync(userId, householdsRef.current);
  });

  return null;
}
