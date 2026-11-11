import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import type { IconName } from '@/constants/options';
import { colors, radius, spacing } from '@/theme/colors';

export function SettingsCardTitle({ icon, title, subtitle, action }: { icon: IconName; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <View style={styles.icon}>
        <Ionicons color={colors.primary} name={icon} size={20} />
      </View>
      <View style={styles.titleCopy}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function SettingSwitch({
  title,
  description,
  value,
  onValueChange,
  disabled = false,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchCopy}>
        <Text style={styles.switchTitle}>{title}</Text>
        <Text style={styles.subtitle}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        disabled={disabled}
        onValueChange={onValueChange}
        thumbColor={colors.white}
        trackColor={{ false: colors.border, true: colors.secondary }}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  icon: { alignItems: 'center', backgroundColor: colors.softPrimary, borderRadius: radius.sm + 2, height: 40, justifyContent: 'center', width: 40 },
  titleCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
  switchCopy: { flex: 1 },
  switchTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
