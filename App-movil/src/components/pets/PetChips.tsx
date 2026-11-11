import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PetAvatar } from '@/components/pets/PetAvatar';
import type { PetRow } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';

type PetChipsProps = {
  pets: PetRow[];
  selected: string[];
  onChange: (petIds: string[]) => void;
  /** true = varias mascotas (paseos); false = una sola (incidentes). */
  multiple?: boolean;
};

export function PetChips({ pets, selected, onChange, multiple = false }: PetChipsProps) {
  function toggle(petId: string) {
    if (!multiple) {
      onChange([petId]);
      return;
    }
    onChange(selected.includes(petId) ? selected.filter((id) => id !== petId) : [...selected, petId]);
  }

  return (
    <View style={styles.row}>
      {pets.map((pet) => {
        const isSelected = selected.includes(pet.id);
        return (
          <Pressable
            accessibilityLabel={pet.nombre}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityState={multiple ? { checked: isSelected } : { selected: isSelected }}
            key={pet.id}
            onPress={() => toggle(pet.id)}
            style={[styles.chip, isSelected && styles.selected]}>
            <PetAvatar pet={pet} size={30} />
            <Text style={[styles.name, isSelected && styles.selectedName]}>{pet.nombre}</Text>
            {isSelected ? <Ionicons color={colors.primary} name="checkmark-circle" size={18} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs + 2,
    minHeight: 44,
    paddingLeft: 6,
    paddingRight: spacing.sm + 4,
  },
  selected: { backgroundColor: colors.softPrimary, borderColor: colors.secondary },
  name: { color: colors.text, fontSize: 14, fontWeight: '700' },
  selectedName: { color: colors.primaryDark },
});
