import { randomBytes } from 'node:crypto';

// Crockford base32: uppercase, and leaves out I, L, O and U so printed codes stay readable.
const BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RANDOM_LENGTH = 12;

function randomBase32(): string {
  // 256 divides evenly by 32, so masking to 5 bits keeps every character equally likely.
  return Array.from(
    randomBytes(RANDOM_LENGTH),
    (byte) => BASE32_ALPHABET[byte & 31],
  ).join('');
}

export function generateMedicineBarcode(): string {
  return `MED-${randomBase32()}`;
}

export function generateBatchBarcode(): string {
  return `BAT-${randomBase32()}`;
}
