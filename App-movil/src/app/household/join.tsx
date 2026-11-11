import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { Card } from '@/components/common/Card';
import { Notice } from '@/components/common/Notice';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { TextField } from '@/components/common/TextField';
import { useHousehold } from '@/contexts/HouseholdContext';
import { joinHouseholdWithCode } from '@/services/households';
import { spacing } from '@/theme/colors';
import { getErrorMessage } from '@/utils/errors';
import { formatInviteCode, isValidInviteCode } from '@/utils/validation';

export default function JoinHouseholdScreen() {
  const { selectHousehold } = useHousehold();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    setError(null);
    if (!isValidInviteCode(code)) {
      setError('El código tiene 8 caracteres, por ejemplo ABCD-2345.');
      return;
    }
    setLoading(true);
    try {
      const householdId = await joinHouseholdWithCode(code);
      await selectHousehold(householdId);
      Alert.alert('¡Listo!', 'Ya formas parte del hogar. Ahora verás sus mascotas y tareas.', [
        { text: 'Continuar', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (joinError) {
      setError(getErrorMessage(joinError, 'No se pudo unir al hogar.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppScreen>
      <ScreenHeader
        back
        subtitle="Pide el código a alguien del hogar. Lo encuentra en Ajustes > Hogar."
        title="Unirme a un hogar"
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Card>
        <View style={styles.form}>
          <TextField
            autoCapitalize="characters"
            autoCorrect={false}
            icon="key-outline"
            label="Código de invitación"
            maxLength={9}
            onChangeText={(value) => setCode(formatInviteCode(value))}
            onSubmitEditing={() => void handleJoin()}
            placeholder="ABCD-2345"
            value={code}
          />
          <AppButton loading={loading} onPress={() => void handleJoin()}>
            Unirme
          </AppButton>
        </View>
      </Card>
      <Notice tone="info">
        Si tu hogar actual no tiene mascotas, paseos ni otros miembros, se elimina al unirte para no dejar hogares vacíos.
      </Notice>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
});
