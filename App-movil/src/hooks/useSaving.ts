import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { getErrorMessage } from '@/utils/errors';

/** Ejecuta una acción de guardado una sola vez a la vez (evita dobles toques) y muestra el error. */
export function useSaving() {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const run = useCallback(async (action: () => Promise<void>, errorTitle: string) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await action();
    } catch (error) {
      Alert.alert(errorTitle, getErrorMessage(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  return { saving, run };
}
