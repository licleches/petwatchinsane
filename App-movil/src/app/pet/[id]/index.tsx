import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { PetCareTab } from '@/components/care/PetCareTab';
import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { type SegmentedTab, SegmentedTabs } from '@/components/common/SegmentedTabs';
import { PetVaccinesTab } from '@/components/health/PetVaccinesTab';
import { PetVetVisitsTab } from '@/components/health/PetVetVisitsTab';
import { PetIncidentsTab } from '@/components/incidents/PetIncidentsTab';
import { PetSummaryCard } from '@/components/pets/PetSummaryCard';
import { PetWalksTab } from '@/components/walks/PetWalksTab';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useFocusData } from '@/hooks/useFocusData';
import { useTodayKey } from '@/hooks/useNow';
import { getPet } from '@/services/pets';

type PetTab = 'cuidados' | 'vacunas' | 'visitas' | 'incidentes' | 'paseos';

const PET_TABS: readonly SegmentedTab<PetTab>[] = [
  { key: 'cuidados', label: 'Cuidados', icon: 'restaurant-outline' },
  { key: 'vacunas', label: 'Vacunas', icon: 'medical-outline' },
  { key: 'visitas', label: 'Veterinario', icon: 'medkit-outline' },
  { key: 'incidentes', label: 'Incidentes', icon: 'alert-circle-outline' },
  { key: 'paseos', label: 'Paseos', icon: 'walk-outline' },
];

function isPetTab(value: unknown): value is PetTab {
  return PET_TABS.some((tab) => tab.key === value);
}

export default function PetDetailScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const petId = typeof id === 'string' ? id : null;
  const { timeZone } = useHousehold();
  const todayKey = useTodayKey(timeZone);
  const [activeTab, setActiveTab] = useState<PetTab>(isPetTab(tab) ? tab : 'cuidados');
  const loader = useMemo(() => (petId ? () => getPet(petId) : null), [petId]);
  const { data: pet, error, loading, refresh, refreshing } = useFocusData(loader, {
    errorMessage: 'No se pudo cargar la mascota.',
    resetKey: petId ?? 'sin-id',
  });

  if (loading) {
    return (
      <AppScreen scroll={false}>
        <LoadingState label="Cargando mascota..." />
      </AppScreen>
    );
  }
  if (!pet) {
    return (
      <AppScreen>
        <ScreenHeader back title="Mascota" />
        {error ? (
          <ErrorState message={error} onRetry={() => void refresh()} retrying={refreshing} />
        ) : (
          <EmptyState
            action={<AppButton onPress={() => router.back()}>Volver</AppButton>}
            message="No encontramos esta mascota. Puede que ya no pertenezcas a su hogar."
            title="Mascota no disponible"
          />
        )}
      </AppScreen>
    );
  }

  return (
    <AppScreen onRefresh={() => void refresh()} refreshing={refreshing}>
      <ScreenHeader
        action={
          <AppButton
            compact
            icon="create-outline"
            onPress={() => router.push({ pathname: '/pet/[id]/edit', params: { id: pet.id } })}
            variant="secondary">
            Editar
          </AppButton>
        }
        back
        title={pet.nombre}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <PetSummaryCard pet={pet} todayKey={todayKey} />
      <SegmentedTabs onChange={setActiveTab} tabs={PET_TABS} value={activeTab} />
      {activeTab === 'cuidados' ? <PetCareTab pet={pet} /> : null}
      {activeTab === 'vacunas' ? <PetVaccinesTab pet={pet} todayKey={todayKey} /> : null}
      {activeTab === 'visitas' ? <PetVetVisitsTab pet={pet} /> : null}
      {activeTab === 'incidentes' ? <PetIncidentsTab pet={pet} /> : null}
      {activeTab === 'paseos' ? <PetWalksTab pet={pet} todayKey={todayKey} /> : null}
    </AppScreen>
  );
}
