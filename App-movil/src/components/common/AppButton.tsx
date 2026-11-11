import { Ionicons } from '@expo/vector-icons';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { IconName } from '@/constants/options';
import { colors, radius, spacing } from '@/theme/colors';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

type AppButtonProps = PropsWithChildren<{
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  icon?: IconName;
  accessibilityLabel?: string;
}>;

const labelColors: Record<ButtonVariant, string> = {
  primary: colors.white,
  danger: colors.white,
  secondary: colors.primaryDark,
  outline: colors.primary,
  ghost: colors.primary,
};

export function AppButton({
  children,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  compact = false,
  icon,
  accessibilityLabel,
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const labelColor = labelColors[variant];
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        styles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons color={labelColor} name={icon} size={compact ? 16 : 18} /> : null}
          <Text style={[styles.label, compact && styles.compactLabel, { color: labelColor }]}>{children}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  compact: { minHeight: 42, paddingHorizontal: spacing.sm + 4 },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.softPrimary },
  outline: { backgroundColor: colors.white, borderColor: colors.primary, borderWidth: 1 },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.error },
  content: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  label: { fontSize: 15, fontWeight: '700' },
  compactLabel: { fontSize: 14 },
  disabled: { opacity: 0.55 },
  pressed: { transform: [{ scale: 0.98 }] },
});
