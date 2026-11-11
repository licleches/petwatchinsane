import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { INCIDENT_TYPE_ORDER, INCIDENT_TYPES } from '@/constants/options';
import type { IncidentType } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';

export function IncidentTypeGrid({ value, onChange }: { value: IncidentType | null; onChange: (type: IncidentType) => void }) {
  return (
    <View style={styles.grid}>
      {INCIDENT_TYPE_ORDER.map((type) => {
        const selected = value === type;
        const info = INCIDENT_TYPES[type];
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            key={type}
            onPress={() => onChange(type)}
            style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}>
            <Ionicons color={selected ? colors.white : colors.error} name={info.icon} size={26} />
            <Text style={[styles.label, selected && styles.selectedLabel]}>{info.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 86,
    padding: spacing.sm,
  },
  selected: { backgroundColor: colors.error, borderColor: colors.error },
  pressed: { opacity: 0.85 },
  label: { color: colors.text, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  selectedLabel: { color: colors.white },
});
