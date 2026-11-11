import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import { Notice } from '@/components/common/Notice';
import { SelectField } from '@/components/common/SelectField';
import { TextField } from '@/components/common/TextField';
import { SettingsCardTitle } from '@/components/settings/SettingsParts';
import { getConfiguredTimeZone, TIME_ZONE_OPTIONS } from '@/constants/options';
import { useSession } from '@/contexts/SessionContext';
import { updateUserProfile } from '@/services/auth';
import { spacing } from '@/theme/colors';
import { getErrorMessage } from '@/utils/errors';

/** Se monta con key = id del perfil, así toma los valores al cargar sin efectos. */
export function ProfileCard() {
  const { profile, session, refreshProfile } = useSession();
  const [name, setName] = useState(profile?.nombre ?? '');
  const [timeZone, setTimeZone] = useState(getConfiguredTimeZone(profile?.zona_horaria));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  async function save() {
    setMessage(null);
    setSaving(true);
    try {
      await updateUserProfile({ nombre: name, zona_horaria: timeZone });
      await refreshProfile();
      setMessage({ tone: 'success', text: 'Tu perfil fue actualizado.' });
    } catch (error) {
      setMessage({ tone: 'error', text: getErrorMessage(error, 'No se pudo actualizar tu perfil.') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <SettingsCardTitle icon="person-outline" subtitle="Así te ven los demás miembros." title="Perfil" />
      <View style={styles.form}>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <TextField icon="person-outline" label="Nombre" maxLength={80} onChangeText={setName} value={name} />
        <TextField editable={false} icon="mail-outline" label="Correo electrónico" value={session?.user.email ?? ''} />
        <SelectField label="Tu zona horaria" onChange={setTimeZone} options={TIME_ZONE_OPTIONS} value={timeZone} />
        <AppButton loading={saving} onPress={() => void save()}>
          Guardar perfil
        </AppButton>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
});
