import { useEffect, useState } from 'react';

import { getCachedPetPhotoUrl, getPetPhotoUrl } from '@/services/petPhotos';

/** URL firmada de la foto (bucket privado). null mientras carga o si no hay foto. */
export function usePetPhotoUrl(path: string | null | undefined) {
  const [resolved, setResolved] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    let active = true;
    getPetPhotoUrl(path)
      .then((url) => {
        if (active) setResolved({ path, url });
      })
      .catch(() => {
        // Sin URL se muestra el ícono de la especie.
      });
    return () => {
      active = false;
    };
  }, [path]);

  if (!path) return null;
  return resolved?.path === path ? resolved.url : getCachedPetPhotoUrl(path);
}
