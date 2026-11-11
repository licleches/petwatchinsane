import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { SectionHeader } from '@/components/common/SectionHeader';
import { WalkCard } from '@/components/walks/WalkCard';
import { WeeklyWalkChart } from '@/components/walks/WeeklyWalkChart';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useFocusData } from '@/hooks/useFocusData';
import { type RealtimeSubscription, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { getPets } from '@/services/pets';
import { getWalks } from '@/services/walks';
import type { PetRow } from '@/types/database';
import { colors, spacing } from '@/theme/colors';
import { addDays, dateForTimeZone, getWeekStartKey } from '@/utils/dates';
import { getWeeklyWalkMinutes } from '@/utils/walks';

const WEEKS = 8;

export function PetWalksTab({ pet, todayKey }: { pet: PetRow; todayKey: string }) {
  const { timeZone } = useHousehold();
  const sinceIso = useMemo(
    () => dateForTimeZone(addDays(getWeekStartKey(todayKey), -7 * (WEEKS - 1)), '00:00', timeZone).toISOString(),
    [timeZone, todayKey],
  );
  const loader = useMemo(
    () => async () => {
      const [walks, pets] = await Promise.all([getWalks(pet.hogar_id, { petId: pet.id, sinceIso }), getPets(pet.hogar_id)]);
      return { walks, petNames: new Map(pets.map((item) => [item.id, item.nombre])) };
    },
    [pet.hogar_id, pet.id, sinceIso],
  );
  const { data, error, loading, refresh, refreshing, reload } = useFocusData(loader, {
    errorMessage: 'No se pudieron cargar los paseos.',
    resetKey: pet.id,
  });
  const subscriptions = useMemo<RealtimeSubscription[]>(() => [{ table: 'paseos', filter: `hogar_id=eq.${pet.hogar_id}` }], [pet.hogar_id]);
  useRealtimeRefresh(`paseos-${pet.id}`, subscriptions, reload);

  const walks = data?.walks;
  const weekly = useMemo(() => getWeeklyWalkMinutes(walks ?? [], todayKey, timeZone, WEEKS), [timeZone, todayKey, walks]);
  const weeklyGoal = pet.meta_paseo_min_dia * 7;
  const thisWeek = weekly[weekly.length - 1]?.minutes ?? 0;
  const percent = weeklyGoal ? Math.round((thisWeek / weeklyGoal) * 100) : 0;
  const addWalk = () => router.push({ pathname: '/walk/add', params: { petId: pet.id } });

  return (
    <View style={styles.container}>
      <SectionHeader
        action={
          pet.activa ? (
            <AppButton compact icon="add" onPress={addWalk} variant="secondary">
              Registrar
            </AppButton>
          ) : null
        }
        subtitle={`Últimas ${WEEKS} semanas.`}
        title="Paseos"
      />
      {loading ? <LoadingState label="Cargando paseos..." /> : null}
      {!loading && error && !data ? <ErrorState message={error} onRetry={() => void refresh()} retrying={refreshing} /> : null}
      {data ? (
        <>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Card>
            <Text style={styles.chartTitle}>Minutos por semana</Text>
            <Text style={styles.chartSubtitle}>
              {weeklyGoal
                ? `Esta semana: ${thisWeek} de ${weeklyGoal} min (${percent}%). Meta: ${pet.meta_paseo_min_dia} min al día.`
                : `Esta semana: ${thisWeek} min. Define una meta diaria en la ficha para compararla.`}
            </Text>
            <WeeklyWalkChart data={weekly} weeklyGoal={weeklyGoal} />
          </Card>
          {data.walks.length ? (
            data.walks.map((walk) => (
              <WalkCard
                key={walk.id}
                onPress={() => router.push({ pathname: '/walk/[id]', params: { id: walk.id } })}
                petNames={walk.mascota_ids.map((id) => data.petNames.get(id) ?? 'Mascota')}
                timeZone={timeZone}
                walk={walk}
              />
            ))
          ) : (
            <EmptyState
              action={pet.activa ? <AppButton onPress={addWalk}>Registrar paseo</AppButton> : undefined}
              compact
              icon="walk-outline"
              message="Registra un paseo manual. Con el smartwatch se guardarán solos, con su ruta."
              title={`Sin paseos en las últimas ${WEEKS} semanas`}
            />
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  chartTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  chartSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: spacing.sm, marginTop: 2 },
});
