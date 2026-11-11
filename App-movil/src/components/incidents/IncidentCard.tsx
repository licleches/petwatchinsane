import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/common/Card';
import { WatchOriginBadge } from '@/components/watch/WatchOriginBadge';
import { INCIDENT_TYPES } from '@/constants/options';
import type { IncidentRow } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';
import { formatDateTime } from '@/utils/dates';
import { isFromWatch } from '@/utils/watch';

type IncidentCardProps = {
  incident: IncidentRow;
  timeZone: string;
  reporterName: string | null;
  petName?: string;
  onPress: () => void;
};

export function IncidentCard({ incident, timeZone, reporterName, petName, onPress }: IncidentCardProps) {
  const info = INCIDENT_TYPES[incident.tipo];
  return (
    <Pressable accessibilityLabel={`Ver incidente: ${info.label}`} accessibilityRole="button" onPress={onPress}>
      <Card>
        <View style={styles.top}>
          <View style={styles.icon}>
            <Ionicons color={colors.error} name={info.icon} size={20} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>
              {info.label}
              {petName ? ` · ${petName}` : ''}
            </Text>
            <Text style={styles.meta}>
              {formatDateTime(incident.ocurrido_en, timeZone)}
              {reporterName ? ` · ${reporterName}` : ''}
            </Text>
          </View>
        </View>
        {isFromWatch(incident) ? (
          <View style={styles.watchRow}>
            <WatchOriginBadge />
          </View>
        ) : null}
        {incident.nota ? (
          <Text numberOfLines={2} style={styles.note}>
            {incident.nota}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  icon: { alignItems: 'center', backgroundColor: colors.errorSoft, borderRadius: radius.pill, height: 40, justifyContent: 'center', width: 40 },
  copy: { flex: 1 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  note: { color: colors.text, fontSize: 14, lineHeight: 19, marginTop: spacing.sm },
  watchRow: { marginTop: spacing.sm },
});
