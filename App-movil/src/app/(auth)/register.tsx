import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { AuthBrand } from '@/components/common/AuthBrand';
import { Notice } from '@/components/common/Notice';
import { TextField } from '@/components/common/TextField';
import { getDetectedTimeZone } from '@/constants/options';
import { registerUser } from '@/services/auth';
import { colors, spacing } from '@/theme/colors';
import { getAuthErrorMessage } from '@/utils/errors';
import { isValidEmail } from '@/utils/validation';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setInfo(null);
    if (name.trim().length < 2) {
      setError('Escribe tu nombre.');
      return;
    }
    if (name.trim().length > 80) {
      setError('El nombre no puede superar 80 caracteres.');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Escribe un correo electrónico válido.');
      return;
    }
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
      const { data, error: registerError } = await registerUser({
        nombre: name,
        email,
        password,
        zonaHoraria: getDetectedTimeZone(),
      });
      if (registerError) {
        setError(getAuthErrorMessage(registerError));
        setLoading(false);
        return;
      }
      // Sin confirmación de correo (configuración actual), signUp devuelve la
      // sesión: se entra directo a la app, sin el aviso de "revisa tu correo".
      if (data.session) {
        router.replace('/(tabs)');
        return;
      }
      // Con confirmación de correo activa, Supabase devuelve un usuario sin
      // identidades cuando el correo ya estaba registrado.
      if (data.user && data.user.identities?.length === 0) {
        setError('Ya existe una cuenta con ese correo.');
        setLoading(false);
        return;
      }
      setInfo('Tu cuenta fue creada. Revisa tu correo para confirmarla y después inicia sesión.');
      setLoading(false);
    } catch (registerError) {
      setError(getAuthErrorMessage(registerError));
      setLoading(false);
    }
  }

  return (
    <AppScreen>
      <View style={styles.container}>
        <AuthBrand title="Crear cuenta" subtitle="Al registrarte se crea tu hogar. Después podrás invitar a tu familia." />
        {error ? <Notice tone="error">{error}</Notice> : null}
        {info ? <Notice tone="success">{info}</Notice> : null}
        <View style={styles.form}>
          <TextField
            autoCapitalize="words"
            autoComplete="name"
            icon="person-outline"
            label="Nombre"
            maxLength={80}
            onChangeText={setName}
            placeholder="Tu nombre"
            value={name}
          />
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
            autoComplete="new-password"
            icon="lock-closed-outline"
            label="Contraseña"
            onChangeText={setPassword}
            placeholder="Mínimo 6 caracteres"
            secureTextEntry
            value={password}
          />
          <TextField
            autoCapitalize="none"
            autoComplete="new-password"
            icon="shield-checkmark-outline"
            label="Confirmar contraseña"
            onChangeText={setConfirmation}
            onSubmitEditing={() => void handleSubmit()}
            placeholder="Repite tu contraseña"
            secureTextEntry
            value={confirmation}
          />
          <AppButton loading={loading} onPress={() => void handleSubmit()}>
            Crear cuenta
          </AppButton>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>¿Ya tienes una cuenta?</Text>
          <Link href="/(auth)/login" asChild>
            <Pressable accessibilityRole="link">
              <Text style={styles.link}>Iniciar sesión</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingVertical: spacing.lg },
  form: { gap: spacing.md },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { color: colors.muted, fontSize: 14 },
  link: { color: colors.primary, fontSize: 14, fontWeight: '800', marginLeft: spacing.xs },
});
