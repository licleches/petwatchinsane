import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { CharacterCountField } from '@/components/common/CharacterCountField';
import { FilterChip } from '@/components/common/FilterChip';
import { TimePickerField } from '@/components/common/NativePickerField';
import { Notice } from '@/components/common/Notice';
import { CARE_TYPE_ORDER, CARE_TYPES } from '@/constants/options';
import type { CareInput } from '@/services/cares';
import type { CareType, CareWithSchedules } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';
import { formatTime12, normalizeTime, timeFromDate, weekdayLabels, weekdayNames } from '@/utils/dates';
import { ALL_DAYS, isSameDaySet, sortDays, WEEKDAY_DISPLAY_ORDER, WEEKDAYS, WEEKEND } from '@/utils/schedules';

type ScheduleDraft = { hora: string; dias: number[] };

function initialSchedules(care?: CareWithSchedules | null): ScheduleDraft[] {
  const byTime = new Map<string, Set<number>>();
  for (const schedule of care?.horarios ?? []) {
    const time = normalizeTime(schedule.hora);
    const days = byTime.get(time) ?? new Set<number>();
    for (const day of schedule.dias_semana) days.add(day);
    byTime.set(time, days);
  }
  return Array.from(byTime.entries())
    .map(([hora, days]) => ({ hora, dias: sortDays(Array.from(days)) }))
    .sort((left, right) => left.hora.localeCompare(right.hora));
}

function initialDays(care?: CareWithSchedules | null) {
  const days = new Set<number>();
  for (const schedule of care?.horarios ?? []) {
    for (const day of schedule.dias_semana) days.add(day);
  }
  return days.size ? sortDays(Array.from(days)) : [...ALL_DAYS];
}

type CareFormProps = {
  initial?: CareWithSchedules | null;
  onSubmit: (input: CareInput) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  loading?: boolean;
};

export function CareForm({ initial, onSubmit, onCancel, submitLabel, loading = false }: CareFormProps) {
  const [type, setType] = useState<CareType>(initial?.tipo ?? 'comida');
  const [name, setName] = useState(initial?.nombre ?? CARE_TYPES.comida.defaultName);
  const [nameTouched, setNameTouched] = useState(Boolean(initial));
  const [detail, setDetail] = useState(initial?.detalle ?? '');
  const [schedules, setSchedules] = useState<ScheduleDraft[]>(() => initialSchedules(initial));
  const [days, setDays] = useState<number[]>(() => initialDays(initial));
  const [daysChanged, setDaysChanged] = useState(false);
  const [pickerValue, setPickerValue] = useState(() => new Date(2000, 0, 1, 8, 0, 0, 0));
  const [error, setError] = useState<string | null>(null);
  const info = CARE_TYPES[type];
  const mixedDays = !daysChanged && new Set(schedules.map((schedule) => schedule.dias.join(','))).size > 1;

  function changeType(next: CareType) {
    setType(next);
    if (!nameTouched) setName(CARE_TYPES[next].defaultName);
  }

  function addTime(value: Date) {
    const hora = timeFromDate(value);
    if (schedules.some((schedule) => schedule.hora.slice(0, 5) === hora.slice(0, 5))) {
      setError('Ese horario ya está agregado.');
      return;
    }
    if (schedules.length >= 12) {
      setError('Puedes agregar hasta 12 horarios por cuidado.');
      return;
    }
    setSchedules((current) => [...current, { hora, dias: days }].sort((left, right) => left.hora.localeCompare(right.hora)));
    setError(null);
  }

  function removeTime(hora: string) {
    setSchedules((current) => current.filter((schedule) => schedule.hora !== hora));
  }

  function changeDays(next: number[]) {
    setDaysChanged(true);
    setDays(sortDays(next));
  }

  function toggleDay(day: number) {
    changeDays(days.includes(day) ? days.filter((item) => item !== day) : [...days, day]);
  }

  async function handleSubmit() {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Escribe el nombre del cuidado.');
      return;
    }
    if (!schedules.length) {
      setError('Agrega al menos un horario.');
      return;
    }
    if (!days.length) {
      setError('Selecciona al menos un día de la semana.');
      return;
    }

    await onSubmit({
      tipo: type,
      nombre: trimmedName,
      detalle: detail.trim() || null,
      horarios: schedules.map((schedule) => ({
        hora: schedule.hora.slice(0, 5),
        dias_semana: daysChanged ? days : schedule.dias,
      })),
    });
  }

  return (
    <View style={styles.container}>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <View style={styles.section}>
        <Text style={styles.label}>Tipo de cuidado</Text>
        <View style={styles.typeGrid}>
          {CARE_TYPE_ORDER.map((careType) => {
            const selected = careType === type;
            const typeInfo = CARE_TYPES[careType];
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={careType}
                onPress={() => changeType(careType)}
                style={[styles.typeOption, selected && { backgroundColor: typeInfo.soft, borderColor: typeInfo.color }]}>
                <Ionicons color={typeInfo.color} name={typeInfo.icon} size={22} />
                <Text style={[styles.typeLabel, selected && { color: typeInfo.color }]}>{typeInfo.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <CharacterCountField
        label="Nombre"
        maxLength={60}
        onChangeText={(value) => {
          setNameTouched(true);
          setName(value);
        }}
        placeholder={info.namePlaceholder}
        value={name}
      />
      <CharacterCountField
        label="Detalle (opcional)"
        maxLength={200}
        multiline
        onChangeText={setDetail}
        placeholder={info.detailPlaceholder}
        value={detail}
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Horarios</Text>
        <TimePickerField
          label="Agregar hora"
          onChange={(value) => {
            setPickerValue(value);
            addTime(value);
          }}
          value={pickerValue}
        />
        {schedules.length ? (
          <View style={styles.chips}>
            {schedules.map((schedule) => (
              <Pressable
                accessibilityLabel={`Quitar horario ${formatTime12(schedule.hora)}`}
                accessibilityRole="button"
                key={schedule.hora}
                onPress={() => removeTime(schedule.hora)}
                style={styles.timeChip}>
                <Text style={styles.timeChipText}>{formatTime12(schedule.hora)}</Text>
                <Ionicons color={colors.primary} name="close-circle" size={16} />
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.helper}>Elige una hora para agregarla. Puedes agregar varias.</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Días de la semana</Text>
        {mixedDays ? (
          <Text style={styles.helper}>Este cuidado tiene días distintos por horario. Si cambias los días, se aplicarán a todos los horarios.</Text>
        ) : null}
        <View style={styles.weekRow}>
          {WEEKDAY_DISPLAY_ORDER.map((day) => {
            const selected = days.includes(day);
            return (
              <Pressable
                accessibilityLabel={weekdayNames[day]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={day}
                onPress={() => toggleDay(day)}
                style={[styles.day, selected && styles.selectedDay]}>
                <Text style={[styles.dayText, selected && styles.selectedDayText]}>{weekdayLabels[day]}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.chips}>
          <FilterChip label="Todos los días" onPress={() => changeDays(ALL_DAYS)} selected={isSameDaySet(days, ALL_DAYS)} />
          <FilterChip label="Lunes a viernes" onPress={() => changeDays(WEEKDAYS)} selected={isSameDaySet(days, WEEKDAYS)} />
          <FilterChip label="Fines de semana" onPress={() => changeDays(WEEKEND)} selected={isSameDaySet(days, WEEKEND)} />
        </View>
        <Text style={styles.helper}>Se crearán las tareas de los próximos 14 días para todo el hogar.</Text>
      </View>

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
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeOption: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexBasis: '47%',
    flexDirection: 'row',
    flexGrow: 1,
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  typeLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeChip: {
    alignItems: 'center',
    backgroundColor: colors.softPrimary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 7,
  },
  timeChipText: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  selectedDay: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  selectedDayText: { color: colors.white },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  buttons: { gap: spacing.sm, marginTop: spacing.sm },
});
