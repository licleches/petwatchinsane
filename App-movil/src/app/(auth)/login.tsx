import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { AuthBrand } from '@/components/common/AuthBrand';
import { Notice } from '@/components/common/Notice';
import { TextField } from '@/components/common/TextField';
import { signInWithPassword } from '@/services/auth';
import { colors, spacing } from '@/theme/colors';
import { getAuthErrorMessage } from '@/utils/errors';
import { isValidEmail } from '@/utils/validation';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!isValidEmail(email)) {
      setError('Escribe un correo electrónico válido.');
      return;
    }
    if (!password) {
      setError('Escribe tu contraseña.');
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await signInWithPassword(email, password);
      if (signInError) {
        setError(getAuthErrorMessage(signInError));
        setLoading(false);
      }
      // Con sesión válida, el layout de (auth) redirige a las pestañas.
    } catch (signInError) {
      setError(getAuthErrorMessage(signInError));
      setLoading(false);
    }
  }

  return (
    <AppScreen>
      <View style={styles.container}>
        <AuthBrand title="Bienvenido" subtitle="Cuida a tus mascotas en familia: comidas, medicamentos, paseos y más." />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <View style={styles.form}>
          <TextField
            autoCapitalize="none"
            autoComplete="email"
            icon="mail-outline"
            keyboardType="email-address"
            label="Correo electrónico"
            onChangeText={setEmail}
            placeholder="tu@correo.com"
            value={email}
          />
          <TextField
            autoCapitalize="none"
            autoComplete="password"
            icon="lock-closed-outline"
            label="Contraseña"
            onChangeText={setPassword}
            onSubmitEditing={() => void handleSubmit()}
            placeholder="Tu contraseña"
            secureTextEntry
            value={password}
          />
          <Link href="/(auth)/forgot-password" asChild>
            <Pressable accessibilityRole="link">
              <Text style={styles.forgot}>¿Olvidaste tu contraseña?</Text>
            </Pressable>
          </Link>
          <AppButton loading={loading} onPress={() => void handleSubmit()}>
            Iniciar sesión
          </AppButton>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>¿Aún no tienes una cuenta?</Text>
          <Link href="/(auth)/register" asChild>
            <Pressable accessibilityRole="link">
              <Text style={styles.link}>Crear cuenta</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md, justifyContent: 'center', paddingVertical: spacing.lg },
  form: { gap: spacing.md },
  forgot: { color: colors.primary, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { color: colors.muted, fontSize: 14 },
  link: { color: colors.primary, fontSize: 14, fontWeight: '800', marginLeft: spacing.xs },
});
