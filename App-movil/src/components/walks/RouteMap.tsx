import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import type { RoutePoint } from '@/types/database';
import { colors, radius } from '@/theme/colors';
import { getRegionForCoordinates, getRouteCoordinates } from '@/utils/walks';

/** Mapa de la ruta del paseo (react-native-maps, incluido en Expo Go). */
export function RouteMap({ route, height = 260 }: { route: RoutePoint[]; height?: number }) {
  const coordinates = useMemo(() => getRouteCoordinates(route), [route]);
  const region = useMemo(() => getRegionForCoordinates(coordinates), [coordinates]);
  if (!coordinates.length || !region) return null;

  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];
  return (
    <View accessibilityLabel="Mapa con la ruta del paseo" style={[styles.container, { height }]}>
      <MapView initialRegion={region} pitchEnabled={false} rotateEnabled={false} style={StyleSheet.absoluteFill} toolbarEnabled={false}>
        {coordinates.length > 1 ? <Polyline coordinates={coordinates} strokeColor={colors.primary} strokeWidth={4} /> : null}
        <Marker coordinate={start} pinColor="green" title="Inicio" />
        {coordinates.length > 1 ? <Marker coordinate={end} pinColor="red" title="Fin" /> : null}
      </MapView>
    </View>
  );
}

/** Mapa pequeño con un solo punto (incidentes con ubicación del reloj). */
export function LocationMap({ latitude, longitude, title, height = 180 }: { latitude: number; longitude: number; title: string; height?: number }) {
  const region = { latitude, longitude, latitudeDelta: 0.006, longitudeDelta: 0.006 };
  return (
    <View accessibilityLabel={`Mapa: ${title}`} style={[styles.container, { height }]}>
      <MapView initialRegion={region} pitchEnabled={false} rotateEnabled={false} style={StyleSheet.absoluteFill} toolbarEnabled={false}>
        <Marker coordinate={{ latitude, longitude }} title={title} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' },
});
