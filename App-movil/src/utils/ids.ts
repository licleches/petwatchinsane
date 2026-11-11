import * as Crypto from 'expo-crypto';

/**
 * UUID v4 generado en el dispositivo. Se usa como id de incidentes, paseos y
 * mascotas para que un reintento no duplique el registro (el reloj hará lo mismo).
 */
export function newId() {
  return Crypto.randomUUID();
}
