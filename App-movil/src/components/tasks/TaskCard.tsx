import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import { StatusPill } from '@/components/common/StatusPill';
import { PetAvatar } from '@/components/pets/PetAvatar';
import { WatchOriginBadge } from '@/components/watch/WatchOriginBadge';
import { CARE_TYPES } from '@/constants/options';
import type { TaskWithContext } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';
import { formatTime } from '@/utils/dates';
import { isTaskActionable, isTaskOverdue } from '@/utils/schedules';
import { isFromWatch } from '@/utils/watch';

type TaskCardProps = {
  task: TaskWithContext;
  timeZone: string;
  now: number;
  /** Nombre de quien resolvió la tarea ("ti" si fue el usuario actual). */
  actorName: (userId: string | null) => string;
  busy?: boolean;
  disabled?: boolean;
  highlighted?: boolean;
  onDone?: () => void;
  onPostpone?: () => void;
  onSkip?: () => void;
};

export function describeTaskStatus(task: TaskWithContext, timeZone: string, now: number, actorName: (userId: string | null) => string) {
  if (task.estado === 'hecha' && task.hecha_en) {
    return `Hecha por ${actorName(task.hecha_por)} a las ${formatTime(task.hecha_en, timeZone)}`;
  }
  if (task.estado === 'omitida' && task.hecha_en) {
    return `Omitida por ${actorName(task.hecha_por)} a las ${formatTime(task.hecha_en, timeZone)}`;
  }
  if (task.estado === 'pospuesta' && task.pospuesta_hasta) {
    return `Pospuesta hasta las ${formatTime(task.pospuesta_hasta, timeZone)}`;
  }
  if (isTaskOverdue(task, now)) return `Debía hacerse a las ${formatTime(task.programada_para, timeZone)}`;
  return null;
}

export function TaskCard({
  task,
  timeZone,
  now,
  actorName,
  busy = false,
  disabled = false,
  highlighted = false,
  onDone,
  onPostpone,
  onSkip,
}: TaskCardProps) {
  const info = CARE_TYPES[task.cuidado.tipo];
  const actionable = isTaskActionable(task);
  const overdue = isTaskOverdue(task, now);
  const statusText = describeTaskStatus(task, timeZone, now, actorName);

  return (
    <Card style={highlighted && styles.highlighted}>
      <View style={styles.top}>
        <PetAvatar pet={task.mascota} size={44} />
        <View style={styles.copy}>
          <Text style={styles.title}>{task.cuidado.nombre}</Text>
          <Text style={styles.subtitle}>
            {task.mascota.nombre} · {info.label}
          </Text>
        </View>
        <View style={[styles.typeIcon, { backgroundColor: info.soft }]}>
          <Ionicons color={info.color} name={info.icon} size={18} />
        </View>
      </View>
      {task.cuidado.detalle ? <Text style={styles.detail}>{task.cuidado.detalle}</Text> : null}
      <View style={styles.statusRow}>
        <StatusPill overdue={overdue} status={task.estado} />
        {statusText ? (
          <Text style={[styles.statusText, task.estado === 'hecha' && styles.doneText]}>{statusText}</Text>
        ) : null}
      </View>
      {isFromWatch(task) ? (
        <View style={styles.watchRow}>
          <WatchOriginBadge />
        </View>
      ) : null}
      {actionable && (onDone || onPostpone || onSkip) ? (
        <View style={styles.actions}>
          {onDone ? (
            <View style={styles.mainAction}>
              <AppButton compact disabled={disabled} icon="checkmark" loading={busy} onPress={onDone}>
                Hecho
              </AppButton>
            </View>
          ) : null}
          {onPostpone ? (
            <AppButton compact disabled={disabled || busy} icon="time-outline" onPress={onPostpone} variant="secondary">
              Posponer
            </AppButton>
          ) : null}
          {onSkip ? (
            <AppButton compact disabled={disabled || busy} onPress={onSkip} variant="ghost">
              Omitir
            </AppButton>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  highlighted: { borderColor: colors.secondary, borderWidth: 2 },
  top: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  copy: { flex: 1 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 2 },
  typeIcon: { alignItems: 'center', borderRadius: radius.sm, height: 34, justifyContent: 'center', width: 34 },
  detail: { color: colors.text, fontSize: 14, lineHeight: 19, marginTop: spacing.sm },
  statusRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  statusText: { color: colors.muted, flexShrink: 1, fontSize: 12, fontWeight: '600' },
  doneText: { color: colors.success },
  watchRow: { marginTop: spacing.xs },
  actions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  mainAction: { flex: 1 },
});
