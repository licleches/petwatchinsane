const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const lookup = new Uint8Array(256);
for (let index = 0; index < ALPHABET.length; index += 1) {
  lookup[ALPHABET.charCodeAt(index)] = index;
}

/**
 * Convierte base64 a un ArrayBuffer sin dependencias nativas. Se usa para subir
 * a Storage la foto que devuelve expo-image-picker con `base64: true`.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const buffer = new ArrayBuffer(Math.floor((clean.length * 3) / 4));
  const bytes = new Uint8Array(buffer);
  let position = 0;

  for (let index = 0; index < clean.length; index += 4) {
    const first = lookup[clean.charCodeAt(index)];
    const second = lookup[clean.charCodeAt(index + 1)];
    const third = index + 2 < clean.length ? lookup[clean.charCodeAt(index + 2)] : 0;
    const fourth = index + 3 < clean.length ? lookup[clean.charCodeAt(index + 3)] : 0;

    bytes[position] = (first << 2) | (second >> 4);
    position += 1;
    if (index + 2 < clean.length) {
      bytes[position] = ((second & 15) << 4) | (third >> 2);
      position += 1;
    }
    if (index + 3 < clean.length) {
      bytes[position] = ((third & 3) << 6) | fourth;
      position += 1;
    }
  }

  return buffer;
}

/** Tamaño aproximado en bytes del contenido codificado en base64. */
export function base64ByteLength(base64: string) {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  return Math.floor((clean.length * 3) / 4);
}
