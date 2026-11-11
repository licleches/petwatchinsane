import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/common/Card';
import { Tag } from '@/components/common/Tag';
import { PetAvatar } from '@/components/pets/PetAvatar';
import { SEX_LABELS, SPECIES_LABELS } from '@/constants/options';
import type { PetRow } from '@/types/database';
import { colors, spacing } from '@/theme/colors';
import { formatAge, formatDateForDisplay } from '@/utils/dates';

export function PetSummaryCard({ pet, todayKey }: { pet: PetRow; todayKey: string }) {
  const age = pet.fecha_nacimiento ? formatAge(pet.fecha_nacimiento, todayKey) : null;
  const rows = [
    { label: 'Especie', value: SPECIES_LABELS[pet.especie] },
    { label: 'Raza', value: pet.raza },
    { label: 'Sexo', value: pet.sexo ? SEX_LABELS[pet.sexo] : null },
    {
      label: 'Nacimiento',
      value: pet.fecha_nacimiento ? `${formatDateForDisplay(pet.fecha_nacimiento)}${age ? ` (${age})` : ''}` : null,
    },
    { label: 'Peso', value: pet.peso_kg !== null ? `${pet.peso_kg} kg` : null },
    { label: 'Meta de paseo', value: pet.meta_paseo_min_dia > 0 ? `${pet.meta_paseo_min_dia} min al día` : 'Sin meta' },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));

  return (
    <Card>
      <View style={styles.header}>
        <PetAvatar pet={pet} size={72} />
        <View style={styles.headerCopy}>
          <Text style={styles.name}>{pet.nombre}</Text>
          {!pet.activa ? <Tag icon="archive-outline" label="Archivada" /> : null}
        </View>
      </View>
      <View style={styles.rows}>
        {rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowValue}>{row.value}</Text>
          </View>
        ))}
      </View>
      {pet.notas ? (
        <View style={styles.notes}>
          <Text style={styles.rowLabel}>Notas</Text>
          <Text style={styles.notesText}>{pet.notas}</Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  name: { color: colors.text, fontSize: 22, fontWeight: '800' },
  rows: { gap: spacing.xs, marginTop: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { color: colors.muted, fontSize: 13 },
  rowValue: { color: colors.text, flexShrink: 1, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  notes: { borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.xs, marginTop: spacing.md, paddingTop: spacing.sm },
  notesText: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
