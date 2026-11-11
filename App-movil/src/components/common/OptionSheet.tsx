import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { IconName } from '@/constants/options';
import { colors, radius, spacing } from '@/theme/colors';

export type SheetOption = {
  key: string;
  label: string;
  icon?: IconName;
  destructive?: boolean;
};

/**
 * Hoja de opciones propia. Se usa en lugar de Alert porque en Android Alert
 * admite como máximo tres botones (posponer necesita cuatro).
 */
export function OptionSheet({
  visible,
  title,
  message,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  options: readonly SheetOption[];
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Cerrar" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.options}>
            {options.map((option) => (
              <Pressable
                accessibilityRole="button"
                key={option.key}
                onPress={() => onSelect(option.key)}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
                {option.icon ? (
                  <Ionicons color={option.destructive ? colors.error : colors.primary} name={option.icon} size={20} />
                ) : null}
                <Text style={[styles.optionText, option.destructive && styles.destructive]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: 'flex-end' },
  card: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  title: { color: colors.text, fontSize: 19, fontWeight: '800' },
  message: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: spacing.xs },
  options: { gap: spacing.xs, marginTop: spacing.md },
  option: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  optionPressed: { backgroundColor: colors.softPrimary },
  optionText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  destructive: { color: colors.error },
  cancel: { alignItems: 'center', marginTop: spacing.sm, paddingVertical: spacing.md },
  cancelText: { color: colors.muted, fontSize: 15, fontWeight: '800' },
});
