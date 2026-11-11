import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { Card } from '@/components/common/Card';
import { Notice } from '@/components/common/Notice';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { LoadingScreen, UnavailableScreen } from '@/components/common/ScreenStates';
import { SectionHeader } from '@/components/common/SectionHeader';
import { IncidentCard } from '@/components/incidents/IncidentCard';
import { PetAvatar } from '@/components/pets/PetAvatar';
import { RouteMap } from '@/components/walks/RouteMap';
import { WatchOriginBadge } from '@/components/watch/WatchOriginBadge';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { useFocusData } from '@/hooks/useFocusData';
import { useSaving } from '@/hooks/useSaving';
import { getIncidents } from '@/services/incidents';
import { getPets } from '@/services/pets';
import { deleteWalk, getWalk } from '@/services/walks';
import { colors, spacing } from '@/theme/colors';
import { formatDateTime, formatDuration, formatTime } from '@/utils/dates';
import { formatDistance, formatSteps, getRouteCoordinates, getRouteDistanceMeters } from '@/utils/walks';
import { isFromWatch } from '@/utils/watch';

export default function WalkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const walkId = typeof id === 'string' ? id : null;
  const { user } = useSession();
  const { timeZone, getMemberName } = useHousehold();
  const loader = useMemo(
    () =>
      walkId
        ? async () => {
            const walk = await getWalk(walkId);
            if (!walk) return null;
            const [pets, incidents] = await Promise.all([getPets(walk.hogar_id), getIncidents(walk.hogar_id, { walkId: walk.id })]);
            return { walk, pets: pets.filter((pet) => walk.mascota_ids.includes(pet.id)), incidents };
          }
        : null,
    [walkId],
  );
  const { data, error, loading, refresh, refreshing } = useFocusData(loader, {
    errorMessage: 'No se pudo cargar el paseo.',
    resetKey: walkId ?? 'sin-id',
  });
  const { saving, run } = useSaving();
  const coordinates = useMemo(() => getRouteCoordinates(data?.walk.ruta), [data?.walk.ruta]);

  if (loading) return <LoadingScreen />;
  if (!data) {
    return (
      <UnavailableScreen
        error={error}
        message="No encontramos este paseo. Puede que otro miembro lo haya eliminado."
        onRetry={() => void refresh()}
        retrying={refreshing}
        title="Paseo"
      />
    );
  }

  const { walk, pets, incidents } = data;
  const fromWatch = isFromWatch(walk);
  const routeDistance = coordinates.length > 1 ? getRouteDistanceMeters(coordinates) : null;
  const distance = walk.distancia_m ?? routeDistance;
  const reporter = walk.registrado_por && walk.registrado_por === user?.id ? 'Ti' : getMemberName(walk.registrado_por) ?? 'Un miembro del hogar';
  const petNames = new Map(pets.map((pet) => [pet.id, pet.nombre]));
  const stats = [
    { label: 'Duración', value: formatDuration(walk.duracion_seg) },
    { label: 'Distancia', value: distance !== null ? formatDistance(distance) : 'Sin dato' },
    { label: 'Pasos', value: walk.pasos !== null ? formatSteps(walk.pasos) : 'Sin dato' },
    {
      label: 'Horario',
      value: walk.terminado_en ? `${formatTime(walk.iniciado_en, timeZone)} – ${formatTime(walk.terminado_en, timeZone)}` : formatTime(walk.iniciado_en, timeZone),
    },
    { label: 'Registrado por', value: reporter },
    { label: 'Origen', value: fromWatch ? 'Smartwatch' : 'App (manual)' },
  ];

  function confirmDelete() {
    Alert.alert('Eliminar paseo', '¿Eliminar este paseo? Se quitará de la gráfica de minutos. Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await deleteWalk(walk.id);
            router.back();
          }, 'No se pudo eliminar'),
      },
    ]);
  }

  return (
    <AppScreen>
      <ScreenHeader back subtitle={formatDateTime(walk.iniciado_en, timeZone)} title="Paseo" />
      {fromWatch ? <WatchOriginBadge /> : null}
      {coordinates.length ? (
        <RouteMap route={walk.ruta ?? []} />
      ) : (
        <Notice tone="info">
          {fromWatch
            ? 'El reloj no envió ruta GPS para este paseo.'
            : 'Este paseo no tiene ruta GPS (se registró manualmente). Los paseos del smartwatch muestran aquí su recorrido.'}
        </Notice>
      )}
      <Card>
        <View style={styles.rows}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.row}>
              <Text style={styles.rowLabel}>{stat.label}</Text>
              <Text style={styles.rowValue}>{stat.value}</Text>
            </View>
          ))}
        </View>
      </Card>
      <SectionHeader title="Mascotas" />
      <View style={styles.pets}>
        {pets.length ? (
          pets.map((pet) => (
            <View key={pet.id} style={styles.pet}>
              <PetAvatar pet={pet} size={36} />
              <Text style={styles.petName}>{pet.nombre}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.rowLabel}>Sin mascotas asociadas.</Text>
        )}
      </View>
      {incidents.length ? (
        <>
          <SectionHeader title="Incidentes durante el paseo" />
          {incidents.map((incident) => (
            <IncidentCard
              incident={incident}
              key={incident.id}
              onPress={() => router.push({ pathname: '/incident/[id]', params: { id: incident.id } })}
              petName={petNames.get(incident.mascota_id)}
              reporterName={null}
              timeZone={timeZone}
            />
          ))}
        </>
      ) : null}
      <View style={styles.danger}>
        <AppButton disabled={saving} icon="trash-outline" onPress={confirmDelete} variant="danger">
          Eliminar paseo
        </AppButton>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  rows: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  rowLabel: { color: colors.muted, fontSize: 13 },
  rowValue: { color: colors.text, flexShrink: 1, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  pets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  pet: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  petName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  danger: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.sm, paddingTop: spacing.lg },
});
