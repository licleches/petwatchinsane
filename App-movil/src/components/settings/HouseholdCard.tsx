import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import { Notice } from '@/components/common/Notice';
import { SelectField } from '@/components/common/SelectField';
import { TextField } from '@/components/common/TextField';
import { SettingsCardTitle } from '@/components/settings/SettingsParts';
import { getConfiguredTimeZone, TIME_ZONE_OPTIONS } from '@/constants/options';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { updateHousehold } from '@/services/households';
import { requestTaskNotificationSync } from '@/services/notifications';
import { colors, spacing } from '@/theme/colors';
import { getErrorMessage } from '@/utils/errors';

/** Se monta con key = id del hogar activo: al cambiar de hogar toma sus valores. */
export function HouseholdCard() {
  const { user } = useSession();
  const { households, household, refreshHouseholds, selectHousehold } = useHousehold();
  const [name, setName] = useState(household?.nombre ?? '');
  const [timeZone, setTimeZone] = useState(getConfiguredTimeZone(household?.zona_horaria));
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  if (!household) return null;
  const currentHousehold = household;

  async function save() {
    setMessage(null);
    setSaving(true);
    const timeZoneChanged = timeZone !== currentHousehold.zona_horaria;
    try {
      await updateHousehold(currentHousehold.id, { nombre: name, zona_horaria: timeZone });
      await refreshHouseholds(currentHousehold.id);
      if (timeZoneChanged && user) requestTaskNotificationSync(user.id, households);
      setMessage({
        tone: 'success',
        text: timeZoneChanged ? 'Hogar actualizado. Las tareas pendientes se reprogramaron a la nueva zona horaria.' : 'Hogar actualizado.',
      });
    } catch (error) {
      setMessage({ tone: 'error', text: getErrorMessage(error, 'No se pudo actualizar el hogar.') });
    } finally {
      setSaving(false);
    }
  }

  async function switchTo(householdId: string) {
    if (householdId === currentHousehold.id) return;
    setSwitching(true);
    try {
      await selectHousehold(householdId);
    } catch (error) {
      setMessage({ tone: 'error', text: getErrorMessage(error, 'No se pudo cambiar de hogar.') });
      setSwitching(false);
    }
  }

  return (
    <Card>
      <SettingsCardTitle icon="home-outline" subtitle="Todos los miembros pueden editarlo." title="Hogar" />
      <View style={styles.form}>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        {households.length > 1 ? (
          <View style={styles.section}>
            <SelectField
              label={switching ? 'Cambiando de hogar...' : 'Hogar activo'}
              onChange={(value) => void switchTo(value)}
              options={households.map((item) => ({ label: item.nombre, value: item.id }))}
              value={currentHousehold.id}
            />
            <Text style={styles.helper}>Perteneces a {households.length} hogares. Todas las pantallas muestran el hogar activo.</Text>
          </View>
        ) : null}
        <TextField icon="home-outline" label="Nombre del hogar" maxLength={80} onChangeText={setName} value={name} />
        <View style={styles.section}>
          <SelectField label="Zona horaria del hogar" onChange={setTimeZone} options={TIME_ZONE_OPTIONS} value={timeZone} />
          <Text style={styles.helper}>Las tareas se programan con esta zona horaria para todos los miembros.</Text>
        </View>
        <AppButton loading={saving} onPress={() => void save()}>
          Guardar hogar
        </AppButton>
        <AppButton icon="enter-outline" onPress={() => router.push('/household/join')} variant="ghost">
          Unirme a otro hogar con un código
        </AppButton>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  section: { gap: spacing.xs },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});
