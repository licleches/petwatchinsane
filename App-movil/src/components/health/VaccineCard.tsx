import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/common/Card';
import { Tag, type TagTone } from '@/components/common/Tag';
import type { VaccineRow } from '@/types/database';
import { colors, spacing } from '@/theme/colors';
import { formatDateForDisplay } from '@/utils/dates';
import type { VaccineStatusInfo } from '@/utils/vaccines';

export function describeVaccineStatus(info: VaccineStatusInfo): { label: string; tone: TagTone } {
  const days = info.daysUntil ?? 0;
  switch (info.status) {
    case 'vencida':
      return { label: days === -1 ? 'Venció ayer' : `Vencida hace ${Math.abs(days)} días`, tone: 'error' };
    case 'proxima':
      return { label: days === 0 ? 'Toca hoy' : days === 1 ? 'Toca mañana' : `Toca en ${days} días`, tone: 'warning' };
    case 'al_dia':
      return { label: 'Al día', tone: 'success' };
    case 'sin_refuerzo':
      return { label: 'Sin próxima dosis', tone: 'neutral' };
    default:
      return { label: 'Aplicación anterior', tone: 'neutral' };
  }
}

export function VaccineCard({ vaccine, info, onPress }: { vaccine: VaccineRow; info: VaccineStatusInfo; onPress: () => void }) {
  const status = describeVaccineStatus(info);
  return (
    <Pressable accessibilityLabel={`Editar vacuna ${vaccine.nombre}`} accessibilityRole="button" onPress={onPress}>
      <Card style={[info.status === 'vencida' && styles.overdue, info.status === 'proxima' && styles.upcoming, info.status === 'historial' && styles.history]}>
        <View style={styles.top}>
          <Ionicons color={info.status === 'vencida' ? colors.error : colors.primary} name="medical-outline" size={22} />
          <Text style={styles.name}>{vaccine.nombre}</Text>
          <Tag label={status.label} tone={status.tone} />
        </View>
        <View style={styles.rows}>
          <Text style={styles.row}>Aplicada: {formatDateForDisplay(vaccine.aplicada_en)}</Text>
          {vaccine.proxima_en ? <Text style={styles.row}>Próxima dosis: {formatDateForDisplay(vaccine.proxima_en)}</Text> : null}
          {vaccine.veterinario ? <Text style={styles.row}>{vaccine.veterinario}</Text> : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overdue: { borderColor: colors.error, borderWidth: 2 },
  upcoming: { borderColor: colors.alert, borderWidth: 2 },
  history: { opacity: 0.7 },
  top: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  name: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '800' },
  rows: { gap: 2, marginTop: spacing.sm },
  row: { color: colors.muted, fontSize: 13 },
});
