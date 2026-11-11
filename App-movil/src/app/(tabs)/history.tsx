import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/common/AppScreen';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { FilterChip } from '@/components/common/FilterChip';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { TimelineItem } from '@/components/history/TimelineItem';
import type { IconName } from '@/constants/options';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { useFocusData } from '@/hooks/useFocusData';
import { useNow } from '@/hooks/useNow';
import { type RealtimeSubscription, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { getHistory, type HistoryFilter } from '@/services/history';
import { colors, spacing } from '@/theme/colors';
import { formatRelativeDay, getDateKey } from '@/utils/dates';
import { buildHistoryEntries, groupEntriesByDay, type HistoryEntry } from '@/utils/history';

const RANGE_OPTIONS = [7, 30, 90] as const;
const KIND_OPTIONS: readonly { key: HistoryFilter; label: string; icon: IconName }[] = [
  { key: 'todo', label: 'Todo', icon: 'list-outline' },
  { key: 'tarea', label: 'Tareas', icon: 'checkmark-done-outline' },
  { key: 'incidente', label: 'Incidentes', icon: 'alert-circle-outline' },
  { key: 'paseo', label: 'Paseos', icon: 'walk-outline' },
  { key: 'vacuna', label: 'Vacunas', icon: 'medical-outline' },
  { key: 'visita', label: 'Veterinario', icon: 'medkit-outline' },
];
const ALL_PETS = 'todas';

function openEntry(entry: HistoryEntry) {
  switch (entry.kind) {
    case 'incidente':
      router.push({ pathname: '/incident/[id]', params: { id: entry.recordId } });
      break;
    case 'paseo':
      router.push({ pathname: '/walk/[id]', params: { id: entry.recordId } });
      break;
    case 'vacuna':
      router.push({ pathname: '/vaccine/[id]', params: { id: entry.recordId } });
      break;
    case 'visita':
      router.push({ pathname: '/vet-visit/[id]', params: { id: entry.recordId } });
      break;
    default:
      if (entry.petIds[0]) router.push({ pathname: '/pet/[id]', params: { id: entry.petIds[0], tab: 'cuidados' } });
  }
}

export default function HistoryScreen() {
  const { user } = useSession();
  const { household, timeZone, getMemberName } = useHousehold();
  const householdId = household?.id ?? null;
  const userId = user?.id ?? null;
  const now = useNow();
  const todayKey = getDateKey(new Date(now), timeZone);
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(30);
  const [kind, setKind] = useState<HistoryFilter>('todo');
  const [petFilter, setPetFilter] = useState(ALL_PETS);

  const loader = useMemo(
    () =>
      householdId
        ? () => getHistory(householdId, { todayKey, timeZone, days, kind, nowIso: new Date().toISOString() })
        : null,
    [days, householdId, kind, timeZone, todayKey],
  );
  const { data, error, loading, refresh, refreshing, reload } = useFocusData(loader, {
    errorMessage: 'No se pudo cargar el historial.',
    resetKey: `${householdId ?? 'sin-hogar'}-${days}-${kind}`,
  });

  const subscriptions = useMemo<RealtimeSubscription[]>(
    () =>
      householdId
        ? [
            { table: 'tareas_programadas', filter: `hogar_id=eq.${householdId}` },
            { table: 'incidentes', filter: `hogar_id=eq.${householdId}` },
            { table: 'paseos', filter: `hogar_id=eq.${householdId}` },
          ]
        : [],
    [householdId],
  );
  useRealtimeRefresh(householdId ? `historial-${householdId}` : null, subscriptions, reload);

  const actorName = useCallback(
    (memberId: string | null) => {
      if (memberId && memberId === userId) return 'ti';
      return getMemberName(memberId);
    },
    [getMemberName, userId],
  );

  const entries = useMemo(() => {
    if (!data) return [];
    const petNames = new Map(data.pets.map((pet) => [pet.id, pet.nombre]));
    return buildHistoryEntries(data, {
      now,
      timeZone,
      petName: (petId) => petNames.get(petId) ?? 'Mascota',
      actorName,
    });
  }, [actorName, data, now, timeZone]);

  const visible = petFilter === ALL_PETS ? entries : entries.filter((entry) => entry.petIds.includes(petFilter));
  const groups = groupEntriesByDay(visible);
  const pets = data?.pets ?? [];

  return (
    <AppScreen onRefresh={() => void refresh()} refreshing={refreshing}>
      <ScreenHeader subtitle={household?.nombre} title="Historial" />

      <View style={styles.filters}>
        <Text style={styles.filterLabel}>Periodo</Text>
        <View style={styles.chips}>
          {RANGE_OPTIONS.map((option) => (
            <FilterChip key={option} label={`${option} días`} onPress={() => setDays(option)} selected={days === option} />
          ))}
        </View>
        <Text style={styles.filterLabel}>Tipo</Text>
        <View style={styles.chips}>
          {KIND_OPTIONS.map((option) => (
            <FilterChip icon={option.icon} key={option.key} label={option.label} onPress={() => setKind(option.key)} selected={kind === option.key} />
          ))}
        </View>
        {pets.length > 1 ? (
          <>
            <Text style={styles.filterLabel}>Mascota</Text>
            <View style={styles.chips}>
              <FilterChip label="Todas" onPress={() => setPetFilter(ALL_PETS)} selected={petFilter === ALL_PETS} />
              {pets.map((pet) => (
                <FilterChip
                  key={pet.id}
                  label={pet.activa ? pet.nombre : `${pet.nombre} (archivada)`}
                  onPress={() => setPetFilter(pet.id)}
                  selected={petFilter === pet.id}
                />
              ))}
            </View>
          </>
        ) : null}
      </View>

      {loading ? <LoadingState label="Cargando historial..." /> : null}
      {!loading && error && !data ? <ErrorState message={error} onRetry={() => void refresh()} retrying={refreshing} /> : null}
      {data ? (
        <>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {groups.length ? (
            <>
              <Text style={styles.count}>
                {visible.length} {visible.length === 1 ? 'registro' : 'registros'} en los últimos {days} días
              </Text>
              {groups.map((group) => (
                <View key={group.dateKey} style={styles.group}>
                  <Text style={styles.dayTitle}>{formatRelativeDay(group.dateKey, todayKey, timeZone)}</Text>
                  <Card>
                    {group.entries.map((entry, index) => (
                      <TimelineItem entry={entry} isLast={index === group.entries.length - 1} key={entry.key} onPress={() => openEntry(entry)} />
                    ))}
                  </Card>
                </View>
              ))}
            </>
          ) : (
            <EmptyState
              icon="time-outline"
              message={
                pets.length
                  ? 'No hay registros para estos filtros. Prueba con otro periodo o tipo.'
                  : 'Cuando registres mascotas, tareas, incidentes o paseos, aparecerán aquí.'
              }
              title="Sin registros"
            />
          )}
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  filters: { gap: spacing.sm },
  filterLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  count: { color: colors.muted, fontSize: 13 },
  group: { gap: spacing.sm },
  dayTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
});
