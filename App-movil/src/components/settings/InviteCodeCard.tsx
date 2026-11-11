import { useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import { Notice } from '@/components/common/Notice';
import { SettingsCardTitle } from '@/components/settings/SettingsParts';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useNow } from '@/hooks/useNow';
import { generateInviteCode } from '@/services/households';
import { colors, radius, spacing } from '@/theme/colors';
import { formatDateTime } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { formatInviteCode } from '@/utils/validation';

export function InviteCodeCard() {
  const { household, refreshHouseholds, timeZone } = useHousehold();
  const now = useNow();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!household) return null;
  const currentHousehold = household;
  const code = currentHousehold.codigo_invitacion;
  const expiresAt = currentHousehold.codigo_expira_en;
  const isValid = Boolean(code && expiresAt && Date.parse(expiresAt) > now);

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      await generateInviteCode(currentHousehold.id);
      await refreshHouseholds(currentHousehold.id);
    } catch (generateError) {
      setError(getErrorMessage(generateError, 'No se pudo generar el código.'));
    } finally {
      setGenerating(false);
    }
  }

  function confirmRegenerate() {
    Alert.alert('Generar un código nuevo', 'El código actual dejará de funcionar.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Generar', onPress: () => void generate() },
    ]);
  }

  async function share() {
    if (!code || !expiresAt) return;
    try {
      await Share.share({
        message: `Únete a "${currentHousehold.nombre}" en PetWatch con el código ${formatInviteCode(code)}. En la app ve a Ajustes > Unirme a otro hogar. Vence el ${formatDateTime(expiresAt, timeZone)}.`,
      });
    } catch (shareError) {
      setError(getErrorMessage(shareError, 'No se pudo compartir el código.'));
    }
  }

  return (
    <Card>
      <SettingsCardTitle icon="key-outline" subtitle="Cualquier miembro puede invitar. El código vence en 7 días." title="Invitar con código" />
      <View style={styles.content}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {isValid && code && expiresAt ? (
          <>
            <View style={styles.codeBox}>
              <Text accessibilityLabel={`Código ${code.split('').join(' ')}`} selectable style={styles.code}>
                {formatInviteCode(code)}
              </Text>
              <Text style={styles.expires}>Vence el {formatDateTime(expiresAt, timeZone)}</Text>
            </View>
            <View style={styles.actions}>
              <View style={styles.action}>
                <AppButton icon="share-social-outline" onPress={() => void share()}>
                  Compartir
                </AppButton>
              </View>
              <View style={styles.action}>
                <AppButton icon="refresh-outline" loading={generating} onPress={confirmRegenerate} variant="secondary">
                  Nuevo código
                </AppButton>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.helper}>{code ? 'El código anterior ya venció.' : 'Genera un código para que tu familia se una a este hogar.'}</Text>
            <AppButton icon="key-outline" loading={generating} onPress={() => void generate()}>
              Generar código
            </AppButton>
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  codeBox: { alignItems: 'center', backgroundColor: colors.softPrimary, borderRadius: radius.md, gap: spacing.xs, padding: spacing.md },
  code: { color: colors.primaryDark, fontSize: 30, fontWeight: '800', letterSpacing: 3 },
  expires: { color: colors.primaryDark, fontSize: 12 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  helper: { color: colors.muted, fontSize: 14, lineHeight: 20 },
});
