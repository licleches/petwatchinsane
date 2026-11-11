import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { CharacterCountField } from '@/components/common/CharacterCountField';
import { DatePickerField } from '@/components/common/NativePickerField';
import { Notice } from '@/components/common/Notice';
import { TextField } from '@/components/common/TextField';
import type { VetVisitInput } from '@/services/vetVisits';
import type { VetVisitRow } from '@/types/database';
import { spacing } from '@/theme/colors';
import { addCalendarMonths, dateFromDateKey, dateKeyFromLocalDate } from '@/utils/dates';
import { parseDecimalInput, sanitizeDecimalInput } from '@/utils/validation';

type VetVisitFormProps = {
  initial?: VetVisitRow | null;
  onSubmit: (input: VetVisitInput) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  loading?: boolean;
};

export function VetVisitForm({ initial, onSubmit, onCancel, submitLabel, loading = false }: VetVisitFormProps) {
  const [maximumDate] = useState(() => addCalendarMonths(new Date(), 12));
  const [date, setDate] = useState(() => initial?.fecha ?? dateKeyFromLocalDate(new Date()));
  const [clinic, setClinic] = useState(initial?.clinica ?? '');
  const [reason, setReason] = useState(initial?.motivo ?? '');
  const [diagnosis, setDiagnosis] = useState(initial?.diagnostico ?? '');
  const [treatment, setTreatment] = useState(initial?.tratamiento ?? '');
  const [cost, setCost] = useState(initial?.costo != null ? String(initial.costo) : '');
  const [notes, setNotes] = useState(initial?.notas ?? '');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!reason.trim()) {
      setError('Escribe el motivo de la visita.');
      return;
    }
    const parsedCost = parseDecimalInput(cost);
    if (parsedCost === undefined) {
      setError('El costo debe ser un número, por ejemplo 450.50.');
      return;
    }
    await onSubmit({
      fecha: date,
      clinica: clinic.trim() || null,
      motivo: reason.trim(),
      diagnostico: diagnosis.trim() || null,
      tratamiento: treatment.trim() || null,
      costo: parsedCost,
      notas: notes.trim() || null,
    });
  }

  return (
    <View style={styles.container}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <DatePickerField
        label="Fecha de la visita"
        maximumDate={maximumDate}
        onChange={(value) => setDate(dateKeyFromLocalDate(value))}
        value={dateFromDateKey(date)}
      />
      <CharacterCountField label="Motivo" maxLength={120} onChangeText={setReason} placeholder="Ej. Revisión anual, vómito, vacuna" value={reason} />
      <CharacterCountField icon="business-outline" label="Clínica (opcional)" maxLength={50} onChangeText={setClinic} placeholder="Ej. Clínica Patitas" value={clinic} />
      <CharacterCountField label="Diagnóstico (opcional)" maxLength={500} multiline onChangeText={setDiagnosis} placeholder="Lo que indicó el veterinario" value={diagnosis} />
      <CharacterCountField label="Tratamiento (opcional)" maxLength={500} multiline onChangeText={setTreatment} placeholder="Medicamentos, dosis, cuidados" value={treatment} />
      <TextField
        icon="cash-outline"
        keyboardType="decimal-pad"
        label="Costo en MXN (opcional)"
        onChangeText={(value) => setCost(sanitizeDecimalInput(value))}
        placeholder="Ej. 450.50"
        value={cost}
      />
      <CharacterCountField label="Notas (opcional)" maxLength={500} multiline onChangeText={setNotes} placeholder="Próxima cita, observaciones..." value={notes} />
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
  buttons: { gap: spacing.sm, marginTop: spacing.sm },
});
