import AsyncStorage from '@react-native-async-storage/async-storage';

// Preferencias locales de este dispositivo (no se guardan en Supabase).
const remindersKey = (userId: string) => `petwatch.recordatorios.${userId}`;
const incidentAlertsKey = (userId: string) => `petwatch.avisosIncidentes.${userId}`;
const activeHouseholdKey = (userId: string) => `petwatch.hogarActivo.${userId}`;

export async function getRemindersEnabled(userId: string) {
  return (await AsyncStorage.getItem(remindersKey(userId))) !== 'false';
}

export function setRemindersEnabled(userId: string, enabled: boolean) {
  return AsyncStorage.setItem(remindersKey(userId), String(enabled));
}

export async function getIncidentAlertsEnabled(userId: string) {
  return (await AsyncStorage.getItem(incidentAlertsKey(userId))) !== 'false';
}

export function setIncidentAlertsEnabled(userId: string, enabled: boolean) {
  return AsyncStorage.setItem(incidentAlertsKey(userId), String(enabled));
}

export function getStoredActiveHouseholdId(userId: string) {
  return AsyncStorage.getItem(activeHouseholdKey(userId));
}

export function setStoredActiveHouseholdId(userId: string, householdId: string) {
  return AsyncStorage.setItem(activeHouseholdKey(userId), householdId);
}
