import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { AuthBrand } from '@/components/common/AuthBrand';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { TextField } from '@/components/common/TextField';
import { createSessionFromAuthLink, updatePassword } from '@/services/auth';
import { supabase } from '@/services/supabase';
import { spacing } from '@/theme/colors';
import { getAuthErrorMessage } from '@/utils/errors';

// Evita canjear dos veces el mismo enlace (por ejemplo, si el efecto se repite).
const processedLinks = new Set<string>();

type LinkStatus = 'checking' | 'ready' | 'invalid';

export default function ResetPasswordScreen() {
  const url = Linking.useURL();
  const [status, setStatus] = useState<LinkStatus>('checking');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const linkUrl = url ?? (await Linking.getInitialURL());
        if (linkUrl && !processedLinks.has(linkUrl)) {
          processedLinks.add(linkUrl);
          await createSessionFromAuthLink(linkUrl);
        }
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setLinkError(null);
        setStatus(data.session ? 'ready' : 'invalid');
      } catch (linkProblem) {
        if (!active) return;
        setLinkError(getAuthErrorMessage(linkProblem, 'El enlace no es válido o ya venció.'));
        setStatus('invalid');
      }
    })();
    return () => {
      active = false;
    };
  }, [url]);

  async function handleSubmit() {
    setError(null);
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await updatePassword(password);
      if (updateError) {
        setError(getAuthErrorMessage(updateError, 'El enlace puede haber vencido.'));
        return;
      }
      Alert.alert('Contraseña actualizada', 'Tu nueva contraseña quedó guardada.', [
        { text: 'Continuar', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (updateError) {
      setError(getAuthErrorMessage(updateError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppScreen>
      <View style={styles.container}>
        <AuthBrand title="Nueva contraseña" subtitle="Elige una contraseña segura para tu cuenta." />
        {status === 'checking' ? <LoadingState label="Verificando el enlace..." /> : null}
        {status === 'invalid' ? (
          <View style={styles.form}>
            <Notice tone="error">
              {linkError ?? 'No encontramos un enlace de recuperación válido. Solicita uno nuevo desde "¿Olvidaste tu contraseña?".'}
            </Notice>
            <AppButton onPress={() => router.replace('/(auth)/forgot-password')}>Solicitar otro enlace</AppButton>
            <AppButton onPress={() => router.replace('/(auth)/login')} variant="ghost">
              Volver a iniciar sesión
            </AppButton>
          </View>
        ) : null}
        {status === 'ready' ? (
          <View style={styles.form}>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <TextField
              autoCapitalize="none"
              icon="lock-closed-outline"
              label="Nueva contraseña"
              onChangeText={setPassword}
              placeholder="Mínimo 6 caracteres"
              secureTextEntry
              value={password}
            />
            <TextField
              autoCapitalize="none"
              icon="shield-checkmark-outline"
              label="Confirmar contraseña"
              onChangeText={setConfirmation}
              placeholder="Repite tu contraseña"
              secureTextEntry
              value={confirmation}
            />
            <AppButton loading={loading} onPress={() => void handleSubmit()}>
              Actualizar contraseña
            </AppButton>
          </View>
        ) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md, justifyContent: 'center', paddingVertical: spacing.lg },
  form: { gap: spacing.md },
});
