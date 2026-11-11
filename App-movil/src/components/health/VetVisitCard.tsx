import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/common/Card';
import { formatCost } from '@/services/vetVisits';
import type { VetVisitRow } from '@/types/database';
import { colors, spacing } from '@/theme/colors';
import { formatDateForDisplay } from '@/utils/dates';

export function VetVisitCard({ visit, onPress }: { visit: VetVisitRow; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={`Ver visita: ${visit.motivo}`} accessibilityRole="button" onPress={onPress}>
      <Card>
        <View style={styles.top}>
          <Ionicons color={colors.blue} name="medkit-outline" size={22} />
          <View style={styles.copy}>
            <Text style={styles.reason}>{visit.motivo}</Text>
            <Text style={styles.meta}>
              {formatDateForDisplay(visit.fecha)}
              {visit.clinica ? ` · ${visit.clinica}` : ''}
            </Text>
          </View>
          {visit.costo !== null ? <Text style={styles.cost}>{formatCost(visit.costo)}</Text> : null}
        </View>
        {visit.diagnostico ? (
          <Text numberOfLines={2} style={styles.detail}>
            Diagnóstico: {visit.diagnostico}
          </Text>
        ) : null}
        {visit.tratamiento ? (
          <Text numberOfLines={2} style={styles.detail}>
            Tratamiento: {visit.tratamiento}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  copy: { flex: 1 },
  reason: { color: colors.text, fontSize: 16, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  cost: { color: colors.text, fontSize: 14, fontWeight: '800' },
  detail: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: spacing.xs },
});
