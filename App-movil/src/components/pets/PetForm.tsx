import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { CharacterCountField } from '@/components/common/CharacterCountField';
import { FilterChip } from '@/components/common/FilterChip';
import { DatePickerField } from '@/components/common/NativePickerField';
import { Notice } from '@/components/common/Notice';
import { OptionSheet, type SheetOption } from '@/components/common/OptionSheet';
import { TextField } from '@/components/common/TextField';
import { PetAvatar } from '@/components/pets/PetAvatar';
import { SEX_OPTIONS, SPECIES_OPTIONS } from '@/constants/options';
import { type PhotoChange, pickPetPhoto } from '@/services/petPhotos';
import { PET_BREED_MAX_LENGTH, type PetInput } from '@/services/pets';
import type { PetRow, PetSex, Species } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';
import { dateFromDateKey, dateKeyFromLocalDate, minPetBirthDate, PET_MAX_AGE_YEARS } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { parseDecimalInput, parseIntegerInput, sanitizeDecimalInput, sanitizeIntegerInput } from '@/utils/validation';

const DEFAULT_DOG_WALK_GOAL = 30;

type PetFormProps = {
  initial?: PetRow | null;
  onSubmit: (input: PetInput, photo: PhotoChange) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  loading?: boolean;
};

export function PetForm({ initial, onSubmit, onCancel, submitLabel, loading = false }: PetFormProps) {
  const [name, setName] = useState(initial?.nombre ?? '');
  const [species, setSpecies] = useState<Species>(initial?.especie ?? 'perro');
  const [breed, setBreed] = useState(initial?.raza ?? '');
  const [sex, setSex] = useState<PetSex | ''>(initial?.sexo ?? '');
  const [birthDate, setBirthDate] = useState(initial?.fecha_nacimiento ?? '');
  const [weight, setWeight] = useState(initial?.peso_kg != null ? String(initial.peso_kg) : '');
  const [walkGoal, setWalkGoal] = useState(String(initial?.meta_paseo_min_dia ?? DEFAULT_DOG_WALK_GOAL));
  const [walkGoalTouched, setWalkGoalTouched] = useState(Boolean(initial));
  const [notes, setNotes] = useState(initial?.notas ?? '');
  const [photoChange, setPhotoChange] = useState<PhotoChange>({ type: 'keep' });
  const [photoSheetVisible, setPhotoSheetVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(() => new Date());
  const minBirthDate = minPetBirthDate(today);

  const hasPhoto = photoChange.type === 'replace' || (photoChange.type === 'keep' && Boolean(initial?.foto_url));
  const localUri = photoChange.type === 'replace' ? photoChange.photo.uri : null;
  const previewPet = {
    foto_url: photoChange.type === 'remove' ? null : initial?.foto_url ?? null,
    especie: species,
    nombre: name.trim() || 'tu mascota',
  };

  const photoOptions: SheetOption[] = [
    { key: 'camera', label: 'Tomar foto', icon: 'camera-outline' },
    { key: 'library', label: 'Elegir de la galería', icon: 'images-outline' },
    ...(hasPhoto ? [{ key: 'remove', label: 'Quitar foto', icon: 'trash-outline' as const, destructive: true }] : []),
  ];

  function changeSpecies(next: Species) {
    setSpecies(next);
    if (!walkGoalTouched) setWalkGoal(next === 'perro' ? String(DEFAULT_DOG_WALK_GOAL) : '0');
  }

  async function choosePhoto(source: 'camera' | 'library') {
    setPhotoSheetVisible(false);
    // En iOS el selector no abre si el modal aún se está cerrando.
    if (Platform.OS === 'ios') await new Promise((resolve) => setTimeout(resolve, 350));
    try {
      const photo = await pickPetPhoto(source);
      if (photo) setPhotoChange({ type: 'replace', photo });
    } catch (pickError) {
      Alert.alert('No se pudo usar la foto', getErrorMessage(pickError));
    }
  }

  function handlePhotoOption(key: string) {
    if (key === 'camera' || key === 'library') {
      void choosePhoto(key);
      return;
    }
    setPhotoSheetVisible(false);
    if (key === 'remove') setPhotoChange({ type: 'remove' });
  }

  async function handleSubmit() {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Escribe el nombre de tu mascota.');
      return;
    }
    if (birthDate && birthDate < dateKeyFromLocalDate(minBirthDate)) {
      setError(`La fecha de nacimiento no puede ser de hace más de ${PET_MAX_AGE_YEARS} años.`);
      return;
    }
    const parsedWeight = parseDecimalInput(weight);
    if (parsedWeight === undefined || (parsedWeight !== null && (parsedWeight <= 0 || parsedWeight > 200))) {
      setError('El peso debe ser un número mayor que 0 y de máximo 200 kg.');
      return;
    }
    const parsedGoal = parseIntegerInput(walkGoal);
    if (parsedGoal === undefined || (parsedGoal !== null && parsedGoal > 600)) {
      setError('La meta de paseo debe ser un número de 0 a 600 minutos.');
      return;
    }

    await onSubmit(
      {
        nombre: trimmedName,
        especie: species,
        raza: breed.trim() || null,
        sexo: sex || null,
        fecha_nacimiento: birthDate || null,
        peso_kg: parsedWeight,
        meta_paseo_min_dia: parsedGoal ?? 0,
        notas: notes.trim() || null,
      },
      photoChange,
    );
  }

  return (
    <View style={styles.container}>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <View style={styles.photoRow}>
        <Pressable accessibilityLabel="Cambiar la foto" accessibilityRole="button" onPress={() => setPhotoSheetVisible(true)}>
          <PetAvatar localUri={localUri} pet={previewPet} size={96} />
          <View style={styles.cameraBadge}>
            <Ionicons color={colors.white} name="camera" size={16} />
          </View>
        </Pressable>
        <View style={styles.photoCopy}>
          <Text style={styles.label}>Foto</Text>
          <Text style={styles.helper}>Opcional. Solo la ven los miembros de tu hogar.</Text>
          <AppButton compact icon="camera-outline" onPress={() => setPhotoSheetVisible(true)} variant="secondary">
            {hasPhoto ? 'Cambiar foto' : 'Agregar foto'}
          </AppButton>
        </View>
      </View>

      <CharacterCountField label="Nombre" maxLength={50} onChangeText={setName} placeholder="Ej. Firulais" value={name} />

      <View style={styles.section}>
        <Text style={styles.label}>Especie</Text>
        <View style={styles.chips}>
          {SPECIES_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              onPress={() => changeSpecies(option.value)}
              selected={species === option.value}
            />
          ))}
        </View>
      </View>

      <CharacterCountField
        label="Raza (opcional)"
        maxLength={PET_BREED_MAX_LENGTH}
        onChangeText={setBreed}
        placeholder="Ej. Labrador"
        value={breed}
      />

      <View style={styles.section}>
        <Text style={styles.label}>Sexo</Text>
        <View style={styles.chips}>
          {SEX_OPTIONS.map((option) => (
            <FilterChip
              key={option.value || 'sin-especificar'}
              label={option.label}
              onPress={() => setSex(option.value)}
              selected={sex === option.value}
            />
          ))}
        </View>
      </View>

      <DatePickerField
        clearable
        label="Fecha de nacimiento (opcional)"
        maximumDate={today}
        minimumDate={minBirthDate}
        onChange={(value) => setBirthDate(dateKeyFromLocalDate(value))}
        onClear={() => setBirthDate('')}
        placeholder="Sin fecha"
        value={birthDate ? dateFromDateKey(birthDate) : null}
      />

      <TextField
        icon="scale-outline"
        keyboardType="decimal-pad"
        label="Peso en kg (opcional)"
        onChangeText={(value) => setWeight(sanitizeDecimalInput(value))}
        placeholder="Ej. 12.5"
        value={weight}
      />

      <View style={styles.section}>
        <TextField
          icon="walk-outline"
          keyboardType="number-pad"
          label="Meta de paseo (minutos al día)"
          onChangeText={(value) => {
            setWalkGoalTouched(true);
            setWalkGoal(sanitizeIntegerInput(value, 3));
          }}
          placeholder="0"
          value={walkGoal}
        />
        <Text style={styles.helper}>Se usa en la gráfica semanal de paseos. Escribe 0 si no aplica.</Text>
      </View>

      <CharacterCountField
        label="Notas (opcional)"
        maxLength={500}
        multiline
        onChangeText={setNotes}
        placeholder="Alergias, carácter, cuidados especiales..."
        value={notes}
      />

      <View style={styles.buttons}>
        <AppButton loading={loading} onPress={() => void handleSubmit()}>
          {submitLabel}
        </AppButton>
        <AppButton disabled={loading} onPress={onCancel} variant="ghost">
          Cancelar
        </AppButton>
      </View>

      <OptionSheet
        onClose={() => setPhotoSheetVisible(false)}
        onSelect={handlePhotoOption}
        options={photoOptions}
        title="Foto de la mascota"
        visible={photoSheetVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  photoRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  cameraBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 2,
    bottom: 0,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 32,
  },
  photoCopy: { flex: 1, gap: spacing.xs },
  section: { gap: spacing.xs },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  buttons: { gap: spacing.sm, marginTop: spacing.sm },
});
