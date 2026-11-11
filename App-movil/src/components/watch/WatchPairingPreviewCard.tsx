import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import type { WatchPairingPreview } from '@/types/watch';
import { colors, spacing } from '@/theme/colors';
import { formatTime } from '@/utils/dates';

export function WatchPairingPreviewCard({
  preview,
  timeZone,
  loading = false,
  onApprove,
  onCancel,
}: {
  preview: WatchPairingPreview;
  timeZone: string;
  loading?: boolean;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const rows = [
    { label: 'Nombre', value: preview.deviceName },
    { label: 'Tipo', value: preview.deviceType === 'wear_os' ? 'Wear OS' : preview.deviceType },
    { label: 'Código válido hasta', value: formatTime(preview.expiresAt, timeZone) },
  ];
  return (
    <Card style={styles.card}>
      <Text style={styles.eyebrow}>Revisión de seguridad</Text>
      <Text style={styles.title}>¿Vincular este reloj?</Text>
      <View style={styles.details}>
        {rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value}>{row.value}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.message}>
        El reloj podrá ver las mascotas y tareas de todos tus hogares, y registrar paseos e incidentes a tu nombre.
      </Text>
      <View style={styles.actions}>
        {preview.canApprove ? (
          <AppButton disabled={loading} icon="checkmark" loading={loading} onPress={onApprove}>
            Aprobar vinculación
          </AppButton>
        ) : (
          <Text style={styles.message}>Esta solicitud ya fue aprobada. Abre PetWatch en el reloj para terminar.</Text>
        )}
        <AppButton compact disabled={loading} onPress={onCancel} variant="ghost">
          Cancelar
        </AppButton>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: colors.secondary, borderWidth: 2 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: spacing.xs },
  details: { gap: spacing.xs, marginVertical: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  label: { color: colors.muted, fontSize: 13 },
  value: { color: colors.text, flexShrink: 1, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  message: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  actions: { gap: spacing.xs, marginTop: spacing.md },
});
