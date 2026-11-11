import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/common/Card';
import { Notice } from '@/components/common/Notice';
import { SettingsCardTitle, SettingSwitch } from '@/components/settings/SettingsParts';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { cancelAllReminderNotifications, requestNotificationPermissions, syncTaskNotifications } from '@/services/notifications';
import { getIncidentAlertsEnabled, getRemindersEnabled, setIncidentAlertsEnabled, setRemindersEnabled } from '@/services/preferences';
import { spacing } from '@/theme/colors';
import { getErrorMessage } from '@/utils/errors';

const PERMISSION_DENIED = 'No hay permiso para notificaciones. Actívalo en los ajustes del teléfono para PetWatch (o Expo Go).';

export function NotificationsCard() {
  const { user } = useSession();
  const { households } = useHousehold();
  const userId = user?.id ?? null;
  const [reminders, setReminders] = useState(true);
  const [alerts, setAlerts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void Promise.all([getRemindersEnabled(userId), getIncidentAlertsEnabled(userId)]).then(([remindersEnabled, alertsEnabled]) => {
      if (!active) return;
      setReminders(remindersEnabled);
      setAlerts(alertsEnabled);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  async function toggleReminders(enabled: boolean) {
    if (!userId) return;
    setBusy(true);
    setMessage(null);
    setReminders(enabled);
    try {
      await setRemindersEnabled(userId, enabled);
      if (enabled) {
        const synced = await syncTaskNotifications(userId, households);
        if (!synced) {
          setReminders(false);
          await setRemindersEnabled(userId, false);
          setMessage({ tone: 'error', text: PERMISSION_DENIED });
        } else {
          setMessage({ tone: 'success', text: 'Recordatorios activados para los próximos 7 días.' });
        }
      } else {
        await cancelAllReminderNotifications();
        setMessage({ tone: 'success', text: 'Recordatorios desactivados en este teléfono.' });
      }
    } catch (error) {
      setReminders(!enabled);
      await setRemindersEnabled(userId, !enabled).catch(() => undefined);
      setMessage({ tone: 'error', text: getErrorMessage(error, 'No se pudieron actualizar los recordatorios.') });
    } finally {
      setBusy(false);
    }
  }

  async function toggleAlerts(enabled: boolean) {
    if (!userId) return;
    setBusy(true);
    setMessage(null);
    setAlerts(enabled);
    try {
      if (enabled && !(await requestNotificationPermissions())) {
        setAlerts(false);
        await setIncidentAlertsEnabled(userId, false);
        setMessage({ tone: 'error', text: PERMISSION_DENIED });
        return;
      }
      await setIncidentAlertsEnabled(userId, enabled);
      setMessage({ tone: 'success', text: enabled ? 'Avisos de incidentes activados.' : 'Avisos de incidentes desactivados.' });
    } catch (error) {
      setAlerts(!enabled);
      setMessage({ tone: 'error', text: getErrorMessage(error, 'No se pudieron actualizar los avisos.') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SettingsCardTitle icon="notifications-outline" subtitle="Notificaciones locales de este teléfono." title="Notificaciones" />
      <View style={styles.content}>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <SettingSwitch
          description="Avisos de comidas, medicamentos y paseos de los próximos 7 días, aunque la app esté cerrada."
          disabled={busy}
          onValueChange={(value) => void toggleReminders(value)}
          title="Recordatorios de tareas"
          value={reminders}
        />
        <SettingSwitch
          description="Te avisamos cuando otro miembro registra un incidente. En Expo Go llega con la app abierta o recién minimizada."
          disabled={busy}
          onValueChange={(value) => void toggleAlerts(value)}
          title="Avisos de incidentes"
          value={alerts}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
});
