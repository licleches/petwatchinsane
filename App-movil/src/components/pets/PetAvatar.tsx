import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { getSpeciesIcon } from '@/constants/options';
import { usePetPhotoUrl } from '@/hooks/usePetPhotoUrl';
import type { PetRow } from '@/types/database';
import { colors } from '@/theme/colors';

type PetAvatarProps = {
  pet: Pick<PetRow, 'foto_url' | 'especie' | 'nombre'>;
  size?: number;
  /** Imagen local recién elegida (antes de subirla). */
  localUri?: string | null;
};

export function PetAvatar({ pet, size = 52, localUri }: PetAvatarProps) {
  const remoteUrl = usePetPhotoUrl(localUri ? null : pet.foto_url);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = localUri ?? remoteUrl;
  const shape = { borderRadius: size / 2, height: size, width: size };

  if (url && url !== failedUrl) {
    return (
      <Image
        accessibilityLabel={`Foto de ${pet.nombre}`}
        onError={() => setFailedUrl(url)}
        source={{ uri: url }}
        style={[styles.image, shape]}
      />
    );
  }

  return (
    <View accessibilityLabel={`Sin foto de ${pet.nombre}`} style={[styles.placeholder, shape]}>
      <Ionicons color={colors.primary} name={getSpeciesIcon(pet.especie)} size={size * 0.45} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.border },
  placeholder: { alignItems: 'center', backgroundColor: colors.softPrimary, justifyContent: 'center' },
});
