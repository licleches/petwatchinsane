import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { IconName } from '@/constants/options';
import { colors, radius, spacing } from '@/theme/colors';

export type SegmentedTab<T extends string> = { key: T; label: string; icon?: IconName };

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly SegmentedTab<T>[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <ScrollView
      accessibilityRole="tablist"
      contentContainerStyle={styles.row}
      horizontal
      showsHorizontalScrollIndicator={false}>
      {tabs.map((tab) => {
        const selected = tab.key === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[styles.tab, selected && styles.selected]}>
            {tab.icon ? <Ionicons color={selected ? colors.white : colors.muted} name={tab.icon} size={16} /> : null}
            <Text style={[styles.label, selected && styles.selectedLabel]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2 },
  tab: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  selectedLabel: { color: colors.white },
});
