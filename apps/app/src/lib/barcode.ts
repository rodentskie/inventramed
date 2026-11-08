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

export type BarcodeKind = 'medicine' | 'batch' | 'product';

export interface ParsedBarcode {
  kind: BarcodeKind;
  code: string;
}

/** Expects a code already normalized by `barcodeLookupSchema`. */
export function parseBarcode(code: string): ParsedBarcode {
  if (code.startsWith('MED-')) {
    return { kind: 'medicine', code };
  }
  if (code.startsWith('BAT-')) {
    return { kind: 'batch', code };
  }
  return { kind: 'product', code };
}

/**
 * Decoders can report a UPC-A code as the EAN-13 with a leading 0, so a lookup
 * tries both forms of the same product code.
 */
export function productBarcodeVariants(code: string): string[] {
  if (/^\d{12}$/.test(code)) {
    return [code, `0${code}`];
  }
  if (/^0\d{12}$/.test(code)) {
    return [code, code.slice(1)];
  }
  return [code];
}
