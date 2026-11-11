import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import { CharacterCountField } from '@/components/common/CharacterCountField';
import { Notice } from '@/components/common/Notice';
import { normalizeWatchPairingCode, validateWatchPairingCode, WATCH_PAIRING_CODE_LENGTH } from '@/services/watchService';
import { colors, spacing } from '@/theme/colors';

export function WatchPairingForm({
  loading = false,
  onSubmit,
}: {
  loading?: boolean;
  onSubmit: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const normalized = normalizeWatchPairingCode(code);
    if (!validateWatchPairingCode(normalized)) {
      setError(`Escribe el código de ${WATCH_PAIRING_CODE_LENGTH} dígitos que muestra PetWatch en el reloj.`);
      return;
    }
    setError(null);
    await onSubmit(normalized);
  }

  return (
    <Card>
      <Text style={styles.title}>Vincular con código</Text>
      <Text style={styles.description}>
        Primero verás el nombre del reloj. La vinculación solo se completa cuando la apruebas.
      </Text>
      <View style={styles.form}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <CharacterCountField
          autoCapitalize="none"
          autoCorrect={false}
          icon="keypad-outline"
          keyboardType="number-pad"
          label="Código del reloj"
          maxLength={WATCH_PAIRING_CODE_LENGTH}
          onChangeText={(value) => setCode(normalizeWatchPairingCode(value))}
          onSubmitEditing={() => void submit()}
          placeholder="123456"
          value={code}
        />
        <AppButton disabled={loading} icon="search-outline" loading={loading} onPress={() => void submit()}>
          Revisar código
        </AppButton>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  description: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 5 },
  form: { gap: spacing.md, marginTop: spacing.md },
});
