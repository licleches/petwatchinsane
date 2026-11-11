import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { CharacterCountField } from '@/components/common/CharacterCountField';
import { FilterChip } from '@/components/common/FilterChip';
import { DatePickerField } from '@/components/common/NativePickerField';
import { Notice } from '@/components/common/Notice';
import type { VaccineInput } from '@/services/vaccines';
import type { VaccineRow } from '@/types/database';
import { colors, spacing } from '@/theme/colors';
import { addCalendarMonths, dateFromDateKey, dateKeyFromLocalDate } from '@/utils/dates';

const SUGGESTIONS = ['Rabia', 'Múltiple', 'Parvovirus', 'Moquillo', 'Bordetella', 'Triple felina', 'Leucemia felina'];
const NEXT_DOSE_SHORTCUTS = [
  { label: 'En 1 mes', months: 1 },
  { label: 'En 6 meses', months: 6 },
  { label: 'En 1 año', months: 12 },
] as const;

type VaccineFormProps = {
  initial?: VaccineRow | null;
  onSubmit: (input: VaccineInput) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  loading?: boolean;
};

export function VaccineForm({ initial, onSubmit, onCancel, submitLabel, loading = false }: VaccineFormProps) {
  const [today] = useState(() => new Date());
  const [name, setName] = useState(initial?.nombre ?? '');
  const [appliedOn, setAppliedOn] = useState(() => initial?.aplicada_en ?? dateKeyFromLocalDate(new Date()));
  const [nextOn, setNextOn] = useState(initial?.proxima_en ?? '');
  const [vet, setVet] = useState(initial?.veterinario ?? '');
  const [notes, setNotes] = useState(initial?.notas ?? '');
  const [error, setError] = useState<string | null>(null);

  function changeAppliedOn(value: Date) {
    const key = dateKeyFromLocalDate(value);
    setAppliedOn(key);
    if (nextOn && nextOn < key) setNextOn('');
  }

  function nextInMonths(months: number) {
    return dateKeyFromLocalDate(addCalendarMonths(dateFromDateKey(appliedOn), months));
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError('Escribe el nombre de la vacuna.');
      return;
    }
    await onSubmit({
      nombre: name.trim(),
      aplicada_en: appliedOn,
      proxima_en: nextOn || null,
      veterinario: vet.trim() || null,
      notas: notes.trim() || null,
    });
  }

  return (
    <View style={styles.container}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <View style={styles.section}>
        <CharacterCountField label="Vacuna" maxLength={80} onChangeText={setName} placeholder="Ej. Rabia" value={name} />
        <View style={styles.chips}>
          {SUGGESTIONS.map((suggestion) => (
            <FilterChip
              key={suggestion}
              label={suggestion}
              onPress={() => setName(suggestion)}
              selected={name.trim().toLowerCase() === suggestion.toLowerCase()}
            />
          ))}
        </View>
      </View>

      <DatePickerField label="Fecha de aplicación" maximumDate={today} onChange={changeAppliedOn} value={dateFromDateKey(appliedOn)} />

      <View style={styles.section}>
        <DatePickerField
          clearable
          label="Próxima dosis (opcional)"
          minimumDate={dateFromDateKey(appliedOn)}
          onChange={(value) => setNextOn(dateKeyFromLocalDate(value))}
          onClear={() => setNextOn('')}
          placeholder="Sin próxima dosis"
          value={nextOn ? dateFromDateKey(nextOn) : null}
        />
        <View style={styles.chips}>
          {NEXT_DOSE_SHORTCUTS.map((shortcut) => {
            const value = nextInMonths(shortcut.months);
            return (
              <FilterChip key={shortcut.label} label={shortcut.label} onPress={() => setNextOn(value)} selected={nextOn === value} />
            );
          })}
        </View>
        <Text style={styles.helper}>Te avisaremos en la ficha cuando esté próxima (30 días) o vencida.</Text>
      </View>

      <CharacterCountField
        icon="business-outline"
        label="Veterinario o clínica (opcional)"
        maxLength={50}
        onChangeText={setVet}
        placeholder="Ej. Clínica Patitas"
        value={vet}
      />
      <CharacterCountField label="Notas (opcional)" maxLength={500} multiline onChangeText={setNotes} placeholder="Lote, reacciones, recomendaciones..." value={notes} />

      <View style={styles.buttons}>
        <AppButton loading={loading} onPress={() => void handleSubmit()}>
          {submitLabel}
        </AppButton>
        <AppButton disabled={loading} onPress={onCancel} variant="ghost">
          Cancelar
        </AppButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  section: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  buttons: { gap: spacing.sm, marginTop: spacing.sm },
});
