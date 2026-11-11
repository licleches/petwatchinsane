import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { FilterChip } from '@/components/common/FilterChip';
import { DatePickerField, TimePickerField } from '@/components/common/NativePickerField';
import { Notice } from '@/components/common/Notice';
import { TextField } from '@/components/common/TextField';
import { PetChips } from '@/components/pets/PetChips';
import type { PetRow } from '@/types/database';
import { colors, spacing } from '@/theme/colors';
import { combineDateAndTime } from '@/utils/dates';
import { parseDecimalInput, parseIntegerInput, sanitizeDecimalInput, sanitizeIntegerInput } from '@/utils/validation';

export type ManualWalkValues = {
  petIds: string[];
  startedAt: Date;
  durationMinutes: number;
  distanceKm: number | null;
  steps: number | null;
};

const DURATION_SHORTCUTS = [15, 30, 45, 60, 90];
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

type ManualWalkFormProps = {
  pets: PetRow[];
  initialPetIds: string[];
  onSubmit: (values: ManualWalkValues) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
};

export function ManualWalkForm({ pets, initialPetIds, onSubmit, onCancel, loading = false }: ManualWalkFormProps) {
  const [petIds, setPetIds] = useState<string[]>(() => {
    const valid = initialPetIds.filter((id) => pets.some((pet) => pet.id === id));
    if (valid.length) return valid;
    return pets.length === 1 ? [pets[0].id] : [];
  });
  // Fecha y hora salen del mismo momento (hace 30 min) para que cerca de la
  // medianoche no quede una hora de inicio en el futuro.
  const [date, setDate] = useState(() => new Date(Date.now() - 30 * 60 * 1000));
  const [time, setTime] = useState(() => new Date(Date.now() - 30 * 60 * 1000));
  const [maximumDate] = useState(() => new Date());
  const [duration, setDuration] = useState('30');
  const [distance, setDistance] = useState('');
  const [steps, setSteps] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!petIds.length) {
      setError('Elige al menos una mascota.');
      return;
    }
    const minutes = parseIntegerInput(duration);
    if (!minutes || minutes < 1 || minutes > 1440) {
      setError('La duración debe ser de 1 a 1440 minutos.');
      return;
    }
    const startedAt = combineDateAndTime(date, time);
    if (startedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      setError('La hora de inicio no puede estar en el futuro.');
      return;
    }
    const distanceKm = parseDecimalInput(distance);
    if (distanceKm === undefined || (distanceKm !== null && distanceKm > 1000)) {
      setError('La distancia debe ser un número en kilómetros, por ejemplo 2.5.');
      return;
    }
    const stepCount = parseIntegerInput(steps);
    if (stepCount === undefined) {
      setError('Los pasos deben ser un número entero.');
      return;
    }
    await onSubmit({ petIds, startedAt, durationMinutes: minutes, distanceKm, steps: stepCount });
  }

  return (
    <View style={styles.container}>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <View style={styles.section}>
        <Text style={styles.label}>¿Quién paseó?</Text>
        <PetChips multiple onChange={setPetIds} pets={pets} selected={petIds} />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Inicio</Text>
        <DatePickerField label="Fecha" maximumDate={maximumDate} onChange={setDate} value={date} />
        <TimePickerField label="Hora de inicio" onChange={setTime} value={time} />
      </View>

      <View style={styles.section}>
        <TextField
          icon="stopwatch-outline"
          keyboardType="number-pad"
          label="Duración (minutos)"
          onChangeText={(value) => setDuration(sanitizeIntegerInput(value, 4))}
          placeholder="30"
          value={duration}
        />
        <View style={styles.chips}>
          {DURATION_SHORTCUTS.map((minutes) => (
            <FilterChip key={minutes} label={`${minutes} min`} onPress={() => setDuration(String(minutes))} selected={duration === String(minutes)} />
          ))}
        </View>
      </View>

      <TextField
        icon="map-outline"
        keyboardType="decimal-pad"
        label="Distancia en km (opcional)"
        onChangeText={(value) => setDistance(sanitizeDecimalInput(value, 2))}
        placeholder="Ej. 2.5"
        value={distance}
      />
      <TextField
        icon="footsteps-outline"
        keyboardType="number-pad"
        label="Pasos (opcional)"
        onChangeText={(value) => setSteps(sanitizeIntegerInput(value, 7))}
        placeholder="Ej. 3500"
        value={steps}
      />
      <Notice tone="info">Los paseos con ruta GPS y pasos automáticos llegarán desde el smartwatch.</Notice>

      <View style={styles.buttons}>
        <AppButton loading={loading} onPress={() => void handleSubmit()}>
          Guardar paseo
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
