import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { INCIDENT_TYPES, VET_SUGGESTION_WINDOW_DAYS } from '@/constants/options';
import { colors, radius, spacing } from '@/theme/colors';
import type { VetSuggestion } from '@/utils/incidents';

export function describeVetSuggestion(suggestion: VetSuggestion, petName: string) {
  return `${petName} tuvo ${suggestion.count} veces "${INCIDENT_TYPES[suggestion.tipo].label}" en los últimos ${VET_SUGGESTION_WINDOW_DAYS} días. Considera llevarlo al veterinario.`;
}

/** Sugerencia de visita al veterinario (regla: 3 incidentes del mismo tipo en 7 días). */
export function VetSuggestionCard({ suggestion, petName }: { suggestion: VetSuggestion; petName: string }) {
  return (
    <View accessibilityRole="alert" style={styles.card}>
      <View style={styles.header}>
        <Ionicons color={colors.alertText} name="medkit-outline" size={20} />
        <Text style={styles.title}>Sugerencia: visita al veterinario</Text>
      </View>
      <Text style={styles.text}>{describeVetSuggestion(suggestion, petName)}</Text>
      <AppButton
        compact
        icon="calendar-outline"
        onPress={() => router.push({ pathname: '/vet-visit/add', params: { petId: suggestion.petId } })}
        variant="outline">
        Registrar visita
      </AppButton>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.alertSoft,
    borderColor: colors.alert,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  title: { color: colors.alertText, flex: 1, fontSize: 15, fontWeight: '800' },
  text: { color: colors.alertText, fontSize: 14, lineHeight: 20 },
});
