import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { AuthBrand } from '@/components/common/AuthBrand';
import { Notice } from '@/components/common/Notice';
import { TextField } from '@/components/common/TextField';
import { sendPasswordReset } from '@/services/auth';
import { colors, spacing } from '@/theme/colors';
import { getAuthErrorMessage } from '@/utils/errors';
import { isValidEmail } from '@/utils/validation';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSuccess(false);
    if (!isValidEmail(email)) {
      setError('Escribe un correo electrónico válido.');
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await sendPasswordReset(email);
      if (resetError) {
        setError(getAuthErrorMessage(resetError));
        return;
      }
      setSuccess(true);
    } catch (resetError) {
      setError(getAuthErrorMessage(resetError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppScreen>
      <View style={styles.container}>
        <AuthBrand title="Recuperar acceso" subtitle="Te enviaremos un enlace para crear una nueva contraseña." />
        {error ? <Notice tone="error">{error}</Notice> : null}
        {success ? (
          <Notice tone="success">
            Si existe una cuenta con ese correo, te enviamos un enlace. Ábrelo en este mismo teléfono para crear tu nueva contraseña.
          </Notice>
        ) : null}
        <View style={styles.form}>
          <TextField
            autoCapitalize="none"
            autoComplete="email"
            icon="mail-outline"
            keyboardType="email-address"
            label="Correo electrónico"
            onChangeText={setEmail}
            onSubmitEditing={() => void handleSubmit()}
            placeholder="tu@correo.com"
            value={email}
          />
          <AppButton loading={loading} onPress={() => void handleSubmit()}>
            Enviar enlace
          </AppButton>
        </View>
        <Link href="/(auth)/login" asChild>
          <Pressable accessibilityRole="link" style={styles.back}>
            <Text style={styles.link}>Volver a iniciar sesión</Text>
          </Pressable>
        </Link>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md, justifyContent: 'center', paddingVertical: spacing.lg },
  form: { gap: spacing.md },
  back: { alignItems: 'center', marginTop: spacing.md },
  link: { color: colors.primary, fontSize: 14, fontWeight: '800' },
});
