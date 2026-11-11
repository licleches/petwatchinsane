import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/common/AppScreen';
import { Card } from '@/components/common/Card';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { WatchDeviceCard } from '@/components/watch/WatchDeviceCard';
import { WatchPairingForm } from '@/components/watch/WatchPairingForm';
import { WatchPairingPreviewCard } from '@/components/watch/WatchPairingPreviewCard';
import { WatchStatusCard } from '@/components/watch/WatchStatusCard';
import type { IconName } from '@/constants/options';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { approveWatchPairing, getWatchConnection, previewWatchPairing, unlinkWatchDevice } from '@/services/watchService';
import type { WatchConnection, WatchPairingPreview } from '@/types/watch';
import { colors, spacing } from '@/theme/colors';
import { getErrorMessage } from '@/utils/errors';

const POLL_INTERVAL_MS = 5000;
/** El código del reloj dura 5 minutos: no tiene caso consultar más tiempo. */
const MAX_POLLS = 60;

const FEATURES: { icon: IconName; text: string }[] = [
  { icon: 'alarm-outline', text: 'Avisos de comida, medicamento y paseo; marca la tarea como hecha desde la muñeca.' },
  { icon: 'map-outline', text: 'Paseos medidos con GPS: ruta, distancia y pasos.' },
  { icon: 'flash-outline', text: 'Incidentes rápidos con un toque: vomitó, no comió, cojea y más.' },
];

const STEPS = [
  'Abre PetWatch en el reloj: mostrará un código de 6 dígitos que dura 5 minutos.',
  'Escríbelo aquí y revisa que el nombre coincida con tu reloj.',
  'Aprueba la vinculación. El reloj termina de conectarse solo.',
];

export default function ConnectWatchScreen() {
  const { user } = useSession();
  const { households, timeZone } = useHousehold();
  const userId = user?.id ?? null;
  const [connection, setConnection] = useState<WatchConnection | null>(null);
  const [pairingPreview, setPairingPreview] = useState<WatchPairingPreview | null>(null);
  const [pairingCode, setPairingCode] = useState('');
  const [pairingFormResetKey, setPairingFormResetKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'success' } | null>(null);
  const loadVersion = useRef(0);
  const previousState = useRef<WatchConnection['state'] | null>(null);

  const loadConnection = useCallback(
    async (silent = false) => {
      if (!userId) return;
      const version = loadVersion.current + 1;
      loadVersion.current = version;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const nextConnection = await getWatchConnection(userId);
        if (version !== loadVersion.current) return;
        if (previousState.current === 'pending' && nextConnection.state === 'linked') {
          setNotice({ text: '¡Listo! El reloj terminó de conectarse.', tone: 'success' });
        }
        previousState.current = nextConnection.state;
        setConnection(nextConnection);
        if (silent) setError(null);
      } catch (loadError) {
        if (version !== loadVersion.current) return;
        setConnection((current) => current ?? { state: 'error', devices: [], message: 'No se pudo consultar el estado del smartwatch.' });
        setError(getErrorMessage(loadError, 'No se pudo consultar el estado del smartwatch.'));
      } finally {
        if (version === loadVersion.current) setLoading(false);
      }
    },
    [userId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadConnection();
      return () => {
        loadVersion.current += 1;
      };
    }, [loadConnection]),
  );

  // Mientras el reloj esté pendiente se consulta su estado, solo con la pantalla enfocada.
  const isPending = connection?.state === 'pending';
  useFocusEffect(
    useCallback(() => {
      if (!isPending) return undefined;
      let polls = 0;
      const interval = setInterval(() => {
        polls += 1;
        if (polls > MAX_POLLS) {
          clearInterval(interval);
          return;
        }
        void loadConnection(true);
      }, POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [isPending, loadConnection]),
  );

  async function handlePairing(code: string) {
    if (!userId) return;
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      const preview = await previewWatchPairing(userId, code);
      setPairingCode(code);
      setPairingPreview(preview);
      setNotice({ text: 'Revisa que el nombre coincida con tu reloj antes de aprobar.', tone: 'info' });
    } catch (pairingError) {
      setError(getErrorMessage(pairingError, 'No se pudo revisar el código del reloj.'));
    } finally {
      setActionLoading(false);
    }
  }

  function resetPairing() {
    setPairingPreview(null);
    setPairingCode('');
    setPairingFormResetKey((value) => value + 1);
  }

  async function handleApprovePairing() {
    if (!userId || !pairingPreview) return;
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      const approval = await approveWatchPairing(userId, pairingPreview.requestId, pairingCode);
      resetPairing();
      setNotice({
        text:
          approval.status === 'linked'
            ? 'El reloj quedó vinculado.'
            : 'Vinculación aprobada. En unos segundos el reloj terminará de conectarse.',
        tone: 'success',
      });
      await loadConnection();
    } catch (approvalError) {
      setError(getErrorMessage(approvalError, 'No se pudo aprobar la vinculación.'));
    } finally {
      setActionLoading(false);
    }
  }

  function handleUnlink(deviceId: string, deviceName: string | null) {
    if (!userId || actionLoading) return;
    Alert.alert(
      'Desvincular reloj',
      `${deviceName || 'El reloj'} dejará de ver tus mascotas y tareas, y su credencial se revocará al instante. Lo que ya registró se conserva.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desvincular',
          style: 'destructive',
          onPress: () => {
            setActionLoading(true);
            setError(null);
            void unlinkWatchDevice(userId, deviceId)
              .then(async () => {
                setNotice({ text: 'Reloj desvinculado y credencial revocada.', tone: 'success' });
                await loadConnection();
              })
              .catch((unlinkError: unknown) => setError(getErrorMessage(unlinkError, 'No se pudo desvincular el reloj.')))
              .finally(() => setActionLoading(false));
          },
        },
      ],
    );
  }

  const householdNames = households.map((household) => household.nombre).join(', ');

  return (
    <AppScreen>
      <ScreenHeader
        action={<Ionicons color={colors.primary} name="watch-outline" size={28} />}
        back
        subtitle="Vincula tu reloj Wear OS para cuidar a tus mascotas desde la muñeca."
        title="Smartwatch"
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {loading && !connection ? (
        <LoadingState label="Consultando el reloj..." />
      ) : (
        <>
          {connection ? (
            <WatchStatusCard loading={loading} message={connection.message} onRefresh={() => void loadConnection()} state={connection.state} />
          ) : null}

          {connection?.state === 'not_configured' ? (
            <Notice tone="warning">
              Para vincular relojes, aplica la migración supabase/migrations/20261108130000_watch.sql, configura el secreto
              WATCH_PAIRING_CODE_SALT y despliega las Edge Functions (docs/smartwatch/despliegue.md).
            </Notice>
          ) : null}

          {connection?.devices.map((device) => (
            <WatchDeviceCard
              device={device}
              key={device.id}
              loading={actionLoading}
              onUnlink={() => handleUnlink(device.id, device.name)}
              timeZone={timeZone}
            />
          ))}

          {pairingPreview ? (
            <WatchPairingPreviewCard
              loading={actionLoading}
              onApprove={() => void handleApprovePairing()}
              onCancel={resetPairing}
              preview={pairingPreview}
              timeZone={timeZone}
            />
          ) : null}

          {connection?.state !== 'not_configured' ? (
            <WatchPairingForm key={pairingFormResetKey} loading={actionLoading} onSubmit={handlePairing} />
          ) : null}

          <Card>
            <Text style={styles.cardTitle}>Cómo vincular</Text>
            <View style={styles.list}>
              {STEPS.map((step, index) => (
                <View key={step} style={styles.item}>
                  <Text style={styles.stepNumber}>{index + 1}</Text>
                  <Text style={styles.itemText}>{step}</Text>
                </View>
              ))}
            </View>
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Qué podrá hacer el reloj</Text>
            <View style={styles.list}>
              {FEATURES.map((feature) => (
                <View key={feature.text} style={styles.item}>
                  <Ionicons color={colors.primary} name={feature.icon} size={18} />
                  <Text style={styles.itemText}>{feature.text}</Text>
                </View>
              ))}
            </View>
            {householdNames ? (
              <Text style={styles.footnote}>Verá las mascotas y tareas de todos tus hogares: {householdNames}.</Text>
            ) : null}
            <Text style={styles.footnote}>
              El reloj recibe su propia credencial, que puedes revocar aquí. Nunca recibe tu contraseña ni tu sesión.
            </Text>
          </Card>
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  list: { gap: spacing.sm, marginTop: spacing.sm },
  item: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  stepNumber: { color: colors.primary, fontSize: 15, fontWeight: '800', width: 18 },
  itemText: { color: colors.text, flex: 1, fontSize: 14, lineHeight: 20 },
  footnote: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: spacing.sm },
});
