import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/common/Card';
import { Tag } from '@/components/common/Tag';
import { WatchOriginBadge } from '@/components/watch/WatchOriginBadge';
import type { WalkWithPets } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';
import { formatDateTime, formatDuration } from '@/utils/dates';
import { formatDistance } from '@/utils/walks';
import { isFromWatch } from '@/utils/watch';

type WalkCardProps = {
  walk: WalkWithPets;
  petNames: string[];
  timeZone: string;
  onPress: () => void;
};

export function WalkCard({ walk, petNames, timeZone, onPress }: WalkCardProps) {
  const title = `${formatDuration(walk.duracion_seg)}${walk.distancia_m !== null ? ` · ${formatDistance(walk.distancia_m)}` : ''}`;
  const fromWatch = isFromWatch(walk);
  return (
    <Pressable accessibilityLabel={`Ver paseo de ${title}`} accessibilityRole="button" onPress={onPress}>
      <Card>
        <View style={styles.top}>
          <View style={styles.icon}>
            <Ionicons color={colors.green} name="walk-outline" size={22} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.meta}>{formatDateTime(walk.iniciado_en, timeZone)}</Text>
            {petNames.length ? <Text style={styles.meta}>{petNames.join(', ')}</Text> : null}
          </View>
          <View style={styles.tags}>
            {!fromWatch ? <Tag label="Manual" /> : null}
            {walk.puntos_ruta >= 2 ? <Tag icon="map-outline" label="Ruta" tone="success" /> : null}
          </View>
        </View>
        {fromWatch ? (
          <View style={styles.watchRow}>
            <WatchOriginBadge />
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  icon: { alignItems: 'center', backgroundColor: colors.greenSoft, borderRadius: radius.pill, height: 42, justifyContent: 'center', width: 42 },
  copy: { flex: 1 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  tags: { alignItems: 'flex-end', gap: 4 },
  watchRow: { marginTop: spacing.sm },
});
