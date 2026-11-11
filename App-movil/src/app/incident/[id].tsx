import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { Card } from '@/components/common/Card';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { LoadingScreen, UnavailableScreen } from '@/components/common/ScreenStates';
import { LocationMap } from '@/components/walks/RouteMap';
import { WatchOriginBadge } from '@/components/watch/WatchOriginBadge';
import { INCIDENT_TYPES } from '@/constants/options';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { useFocusData } from '@/hooks/useFocusData';
import { useSaving } from '@/hooks/useSaving';
import { deleteIncident, getIncident } from '@/services/incidents';
import { getPet } from '@/services/pets';
import { colors, radius, spacing } from '@/theme/colors';
import { formatDateTime } from '@/utils/dates';
import { isFromWatch } from '@/utils/watch';

export default function IncidentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const incidentId = typeof id === 'string' ? id : null;
  const { user } = useSession();
  const { timeZone, getMemberName } = useHousehold();
  const loader = useMemo(
    () =>
      incidentId
        ? async () => {
            const incident = await getIncident(incidentId);
            if (!incident) return null;
            const pet = await getPet(incident.mascota_id);
            return pet ? { incident, pet } : null;
          }
        : null,
    [incidentId],
  );
  const { data, error, loading, refresh, refreshing } = useFocusData(loader, {
    errorMessage: 'No se pudo cargar el incidente.',
    resetKey: incidentId ?? 'sin-id',
  });
  const { saving, run } = useSaving();

  if (loading) return <LoadingScreen />;
  if (!data) {
    return (
      <UnavailableScreen
        error={error}
        message="No encontramos este incidente. Puede que otro miembro lo haya eliminado."
        onRetry={() => void refresh()}
        retrying={refreshing}
        title="Incidente"
      />
    );
  }

  const { incident, pet } = data;
  const info = INCIDENT_TYPES[incident.tipo];
  const fromWatch = isFromWatch(incident);
  const reporter =
    incident.registrado_por && incident.registrado_por === user?.id ? 'Ti' : getMemberName(incident.registrado_por) ?? 'Un miembro del hogar';
  const rows = [
    { label: 'Mascota', value: pet.nombre },
    { label: 'Cuándo', value: formatDateTime(incident.ocurrido_en, timeZone) },
    { label: 'Registrado por', value: reporter },
    { label: 'Origen', value: fromWatch ? 'Smartwatch' : 'App' },
  ];
  const paseoId = incident.paseo_id;

  function confirmDelete() {
    Alert.alert('Eliminar incidente', '¿Eliminar este incidente? Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await deleteIncident(incident.id);
            router.back();
          }, 'No se pudo eliminar'),
      },
    ]);
  }

  return (
    <AppScreen>
      <ScreenHeader back subtitle={pet.nombre} title={info.label} />
      <Card>
        <View style={styles.header}>
          <View style={styles.icon}>
            <Ionicons color={colors.error} name={info.icon} size={26} />
          </View>
          <Text style={styles.title}>{info.label}</Text>
        </View>
        {fromWatch ? (
          <View style={styles.watchRow}>
            <WatchOriginBadge />
          </View>
        ) : null}
        <View style={styles.rows}>
          {rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
          ))}
        </View>
        {incident.nota ? <Text style={styles.note}>{incident.nota}</Text> : null}
      </Card>
      {incident.lat !== null && incident.lng !== null ? (
        <LocationMap latitude={incident.lat} longitude={incident.lng} title={`${info.label} · ${pet.nombre}`} />
      ) : null}
      {paseoId ? (
        <AppButton icon="walk-outline" onPress={() => router.push({ pathname: '/walk/[id]', params: { id: paseoId } })} variant="secondary">
          Ver el paseo
        </AppButton>
      ) : null}
      <View style={styles.danger}>
        <AppButton disabled={saving} icon="trash-outline" onPress={confirmDelete} variant="danger">
          Eliminar incidente
        </AppButton>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  icon: { alignItems: 'center', backgroundColor: colors.errorSoft, borderRadius: radius.pill, height: 48, justifyContent: 'center', width: 48 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  watchRow: { marginTop: spacing.sm },
  rows: { gap: spacing.xs, marginTop: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  rowLabel: { color: colors.muted, fontSize: 13 },
  rowValue: { color: colors.text, flexShrink: 1, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  note: { borderTopColor: colors.border, borderTopWidth: 1, color: colors.text, fontSize: 14, lineHeight: 20, marginTop: spacing.md, paddingTop: spacing.sm },
  danger: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.sm, paddingTop: spacing.lg },
});
