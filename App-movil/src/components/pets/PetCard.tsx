import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/common/Card';
import { Tag } from '@/components/common/Tag';
import { PetAvatar } from '@/components/pets/PetAvatar';
import { SPECIES_LABELS } from '@/constants/options';
import type { PetRow } from '@/types/database';
import { colors, spacing } from '@/theme/colors';
import { formatAge } from '@/utils/dates';

export function describePet(pet: PetRow, todayKey: string) {
  const parts: string[] = [];
  if (pet.fecha_nacimiento) {
    const age = formatAge(pet.fecha_nacimiento, todayKey);
    if (age) parts.push(age);
  }
  if (pet.peso_kg !== null) parts.push(`${pet.peso_kg} kg`);
  if (pet.meta_paseo_min_dia > 0) parts.push(`Meta: ${pet.meta_paseo_min_dia} min/día`);
  return parts.join(' · ');
}

export function PetCard({ pet, todayKey, onPress }: { pet: PetRow; todayKey: string; onPress: () => void }) {
  const details = describePet(pet, todayKey);
  return (
    <Pressable accessibilityLabel={`Ver a ${pet.nombre}`} accessibilityRole="button" onPress={onPress}>
      <Card style={!pet.activa && styles.archived}>
        <View style={styles.row}>
          <PetAvatar pet={pet} size={56} />
          <View style={styles.copy}>
            <Text style={styles.name}>{pet.nombre}</Text>
            <Text style={styles.subtitle}>
              {SPECIES_LABELS[pet.especie]}
              {pet.raza ? ` · ${pet.raza}` : ''}
            </Text>
            {details ? <Text style={styles.details}>{details}</Text> : null}
          </View>
          {pet.activa ? (
            <Ionicons color={colors.muted} name="chevron-forward" size={20} />
          ) : (
            <Tag icon="archive-outline" label="Archivada" />
          )}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  archived: { opacity: 0.75 },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  copy: { flex: 1 },
  name: { color: colors.text, fontSize: 17, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 2 },
  details: { color: colors.muted, fontSize: 12, marginTop: 4 },
});
