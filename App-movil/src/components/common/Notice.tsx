import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/colors';

type NoticeProps = PropsWithChildren<{ tone?: 'error' | 'info' | 'success' | 'warning' }>;

export function Notice({ children, tone = 'info' }: NoticeProps) {
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={[styles.base, styles[tone]]}>
      <Text style={[styles.text, tone === 'error' && styles.errorText, tone === 'warning' && styles.warningText]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, padding: spacing.md },
  error: { backgroundColor: colors.errorSoft },
  info: { backgroundColor: colors.blueSoft },
  success: { backgroundColor: colors.successSoft },
  warning: { backgroundColor: colors.alertSoft },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
  errorText: { color: colors.errorText },
  warningText: { color: colors.alertText },
});
