import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { colors, radius, spacing } from '@/theme/colors';

export function ErrorState({
  title = 'No se pudo cargar la información',
  message,
  onRetry,
  retrying = false,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <View accessibilityRole="alert" style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons color={colors.error} name="cloud-offline-outline" size={30} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <View style={styles.action}>
          <AppButton icon="refresh-outline" loading={retrying} onPress={onRetry} variant="outline">
            Reintentar
          </AppButton>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: colors.errorSoft,
    borderRadius: radius.pill,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  title: { color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  action: { marginTop: spacing.sm, minWidth: 190 },
});
