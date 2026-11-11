import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/common/Card';
import { Tag } from '@/components/common/Tag';
import { CARE_TYPES } from '@/constants/options';
import type { CareWithSchedules } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';
import { formatTime } from '@/utils/dates';
import { formatWeekdays } from '@/utils/schedules';

/** Agrupa los horarios que comparten días: "08:00 · 20:00 — Todos los días". */
function describeSchedules(care: CareWithSchedules) {
  const groups = new Map<string, { days: number[]; times: string[] }>();
  for (const schedule of care.horarios) {
    const key = [...schedule.dias_semana].sort().join(',');
    const group = groups.get(key) ?? { days: schedule.dias_semana, times: [] };
    group.times.push(formatTime(schedule.hora));
    groups.set(key, group);
  }
  return Array.from(groups.values()).map((group) => `${group.times.join(' · ')} — ${formatWeekdays(group.days)}`);
}

export function CareCard({ care, onPress }: { care: CareWithSchedules; onPress: () => void }) {
  const info = CARE_TYPES[care.tipo];
  const scheduleLines = describeSchedules(care);
  return (
    <Pressable accessibilityLabel={`Editar ${care.nombre}`} accessibilityRole="button" onPress={onPress}>
      <Card style={!care.activo && styles.inactive}>
        <View style={styles.top}>
          <View style={[styles.icon, { backgroundColor: info.soft }]}>
            <Ionicons color={info.color} name={info.icon} size={22} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.name}>{care.nombre}</Text>
            <Text style={styles.type}>{info.label}</Text>
          </View>
          {care.activo ? <Ionicons color={colors.muted} name="chevron-forward" size={20} /> : <Tag label="Pausado" />}
        </View>
        {care.detalle ? <Text style={styles.detail}>{care.detalle}</Text> : null}
        <View style={styles.schedules}>
          {scheduleLines.length ? (
            scheduleLines.map((line) => (
              <View key={line} style={styles.scheduleRow}>
                <Ionicons color={colors.primary} name="time-outline" size={15} />
                <Text style={styles.scheduleText}>{line}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.scheduleText}>Sin horarios activos</Text>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inactive: { opacity: 0.7 },
  top: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  icon: { alignItems: 'center', borderRadius: radius.sm + 4, height: 44, justifyContent: 'center', width: 44 },
  copy: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' },
  type: { color: colors.muted, fontSize: 13, marginTop: 2 },
  detail: { color: colors.text, fontSize: 14, lineHeight: 19, marginTop: spacing.sm },
  schedules: { borderTopColor: colors.border, borderTopWidth: 1, gap: 4, marginTop: spacing.sm, paddingTop: spacing.sm },
  scheduleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  scheduleText: { color: colors.muted, flexShrink: 1, fontSize: 13 },
});
