import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { CharacterCountField } from '@/components/common/CharacterCountField';
import { FilterChip } from '@/components/common/FilterChip';
import { DatePickerField, TimePickerField } from '@/components/common/NativePickerField';
import { Notice } from '@/components/common/Notice';
import { IncidentTypeGrid } from '@/components/incidents/IncidentTypeGrid';
import { PetChips } from '@/components/pets/PetChips';
import type { IncidentType, PetRow } from '@/types/database';
import { colors, spacing } from '@/theme/colors';
import { combineDateAndTime } from '@/utils/dates';

export type IncidentFormValues = {
  petId: string;
  tipo: IncidentType;
  ocurridoEn: Date;
  nota: string | null;
};

type IncidentFormProps = {
  pets: PetRow[];
  initialPetId?: string | null;
  onSubmit: (values: IncidentFormValues) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
};

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export function IncidentForm({ pets, initialPetId, onSubmit, onCancel, loading = false }: IncidentFormProps) {
  const [petId, setPetId] = useState<string | null>(() => {
    if (initialPetId && pets.some((pet) => pet.id === initialPetId)) return initialPetId;
    return pets.length === 1 ? pets[0].id : null;
  });
  const [type, setType] = useState<IncidentType | null>(null);
  const [whenMode, setWhenMode] = useState<'now' | 'custom'>('now');
  const [date, setDate] = useState(() => new Date());
  const [time, setTime] = useState(() => new Date());
  const [maximumDate] = useState(() => new Date());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!petId) {
      setError('Elige la mascota.');
      return;
    }
    if (!type) {
      setError('Elige qué pasó.');
      return;
    }
    const occurredAt = whenMode === 'now' ? new Date() : combineDateAndTime(date, time);
    if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      setError('La hora del incidente no puede estar en el futuro.');
      return;
    }
    await onSubmit({ petId, tipo: type, ocurridoEn: occurredAt, nota: note.trim() || null });
  }

  return (
    <View style={styles.container}>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <View style={styles.section}>
        <Text style={styles.label}>Mascota</Text>
        <PetChips onChange={(ids) => setPetId(ids[0] ?? null)} pets={pets} selected={petId ? [petId] : []} />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>¿Qué pasó?</Text>
        <IncidentTypeGrid onChange={setType} value={type} />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>¿Cuándo?</Text>
        <View style={styles.chips}>
          <FilterChip icon="flash-outline" label="Ahora" onPress={() => setWhenMode('now')} selected={whenMode === 'now'} />
          <FilterChip icon="calendar-outline" label="Otra fecha u hora" onPress={() => setWhenMode('custom')} selected={whenMode === 'custom'} />
        </View>
        {whenMode === 'custom' ? (
          <>
            <DatePickerField label="Fecha" maximumDate={maximumDate} onChange={setDate} value={date} />
            <TimePickerField label="Hora" onChange={setTime} value={time} />
          </>
        ) : null}
      </View>

      <CharacterCountField
        label="Nota (opcional)"
        maxLength={500}
        multiline
        onChangeText={setNote}
        placeholder="Qué observaste, cuántas veces, qué comió..."
        value={note}
      />

      <View style={styles.buttons}>
        <AppButton loading={loading} onPress={() => void handleSubmit()} variant="danger">
          Registrar incidente
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
  label: { color: colors.text, fontSize: 15, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  buttons: { gap: spacing.sm, marginTop: spacing.sm },
});
