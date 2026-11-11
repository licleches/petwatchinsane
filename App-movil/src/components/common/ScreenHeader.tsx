import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme/colors';

function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/(tabs)');
  }
}

export function ScreenHeader({
  title,
  subtitle,
  action,
  back = false,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  back?: boolean;
}) {
  return (
    <View style={styles.container}>
      {back ? (
        <Pressable accessibilityLabel="Volver" accessibilityRole="button" hitSlop={12} onPress={goBack} style={styles.back}>
          <Ionicons color={colors.text} name="chevron-back" size={26} />
        </Pressable>
      ) : null}
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  back: { marginLeft: -spacing.xs, marginRight: spacing.xs, paddingTop: 2 },
  copy: { flex: 1, paddingRight: spacing.sm },
  title: { color: colors.text, fontSize: 27, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: spacing.xs },
});
