import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/contexts/SessionContext';
import { getHouseholdMembers, getMyHouseholds } from '@/services/households';
import { getStoredActiveHouseholdId, setStoredActiveHouseholdId } from '@/services/preferences';
import type { HouseholdMember, HouseholdWithRole } from '@/types/database';
import { getSafeTimeZone } from '@/utils/dates';
import { getErrorMessage, logSupabaseError } from '@/utils/errors';

type HouseholdState = {
  userId: string;
  households: HouseholdWithRole[];
  activeId: string | null;
  members: HouseholdMember[];
  error: string | null;
};

type HouseholdContextValue = {
  /** Todos los hogares a los que pertenece el usuario. */
  households: HouseholdWithRole[];
  /** Hogar activo: todas las pantallas trabajan con este hogar. */
  household: HouseholdWithRole | null;
  members: HouseholdMember[];
  /** Zona horaria del hogar activo; las tareas se generan y muestran con ella. */
  timeZone: string;
  isLoading: boolean;
  error: string | null;
  refreshHouseholds: (preferredHouseholdId?: string) => Promise<void>;
  selectHousehold: (householdId: string) => Promise<void>;
  getMemberName: (userId: string | null | undefined) => string | null;
};

const EMPTY_HOUSEHOLDS: HouseholdWithRole[] = [];
const EMPTY_MEMBERS: HouseholdMember[] = [];

const HouseholdContext = createContext<HouseholdContextValue | undefined>(undefined);

async function fetchHouseholdState(userId: string, preferredHouseholdId?: string): Promise<HouseholdState> {
  try {
    const households = await getMyHouseholds(userId);
    const storedId = await getStoredActiveHouseholdId(userId);
    const wantedId = preferredHouseholdId ?? storedId;
    const active = households.find((item) => item.id === wantedId) ?? households[0] ?? null;
    const members = active ? await getHouseholdMembers(active.id) : EMPTY_MEMBERS;
    if (active && active.id !== storedId) {
      await setStoredActiveHouseholdId(userId, active.id).catch(() => undefined);
    }
    return { userId, households, activeId: active?.id ?? null, members, error: null };
  } catch (error) {
    logSupabaseError('HouseholdContext.load', error, { userId });
    return {
      userId,
      households: EMPTY_HOUSEHOLDS,
      activeId: null,
      members: EMPTY_MEMBERS,
      error: getErrorMessage(error, 'No se pudo cargar tu hogar.'),
    };
  }
}

export function HouseholdProvider({ children }: PropsWithChildren) {
  const { user, profile, isLoading: sessionLoading } = useSession();
  const userId = user?.id ?? null;
  const [state, setState] = useState<HouseholdState | null>(null);
  const requestVersion = useRef(0);

  const applyState = useCallback((next: HouseholdState) => {
    setState((previous) => {
      // Si una recarga falla, conserva los datos anteriores y solo informa el error.
      if (next.error && previous && previous.userId === next.userId && previous.households.length) {
        return { ...previous, error: next.error };
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (sessionLoading || !userId) return;
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    void fetchHouseholdState(userId).then((next) => {
      if (requestVersion.current === version) applyState(next);
    });
  }, [applyState, sessionLoading, userId]);

  const refreshHouseholds = useCallback(async (preferredHouseholdId?: string) => {
    if (!userId) return;
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    const next = await fetchHouseholdState(userId, preferredHouseholdId);
    if (requestVersion.current === version) applyState(next);
  }, [applyState, userId]);

  // Al volver a primer plano se recargan hogares y miembros (por ejemplo, alguien
  // se unió con el código), para mostrar bien "hecha por ...".
  useEffect(() => {
    if (!userId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshHouseholds();
    });
    return () => subscription.remove();
  }, [refreshHouseholds, userId]);

  const selectHousehold = useCallback(async (householdId: string) => {
    if (!userId) return;
    await setStoredActiveHouseholdId(userId, householdId);
    await refreshHouseholds(householdId);
  }, [refreshHouseholds, userId]);

  const currentState = state && state.userId === userId ? state : null;
  const households = currentState?.households ?? EMPTY_HOUSEHOLDS;
  const members = currentState?.members ?? EMPTY_MEMBERS;
  const household = households.find((item) => item.id === currentState?.activeId) ?? null;
  const isLoading = sessionLoading || (Boolean(userId) && !currentState);
  const error = currentState?.error ?? null;
  const profileTimeZone = profile?.zona_horaria;

  const getMemberName = useCallback(
    (memberId: string | null | undefined) => {
      if (!memberId) return null;
      return members.find((member) => member.usuario_id === memberId)?.nombre ?? null;
    },
    [members],
  );

  const value = useMemo<HouseholdContextValue>(
    () => ({
      households,
      household,
      members,
      timeZone: getSafeTimeZone(household?.zona_horaria ?? profileTimeZone),
      isLoading,
      error,
      refreshHouseholds,
      selectHousehold,
      getMemberName,
    }),
    [error, getMemberName, household, households, isLoading, members, profileTimeZone, refreshHouseholds, selectHousehold],
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold() {
  const context = useContext(HouseholdContext);
  if (!context) {
    throw new Error('useHousehold debe utilizarse dentro de HouseholdProvider.');
  }
  return context;
}
