import { formatSmsItems, renderSmsBody, type SmsItem } from '@/lib/sms-body';

const SAMPLE_DATE = '2026-11-08';

export const SAMPLE_ITEMS: readonly SmsItem[] = [
  {
    medicineName: 'Amoxicillin',
    strength: '500 mg',
    batchNumber: 'A123',
    status: 'EXPIRED',
    expirationDate: '2026-11-01',
    daysToExpiry: -7,
  },
  {
    medicineName: 'Paracetamol',
    strength: '500 mg',
    batchNumber: 'B456',
    status: 'NEAR_EXPIRY',
    expirationDate: '2026-11-11',
    daysToExpiry: 3,
  },
  {
    medicineName: 'Cetirizine',
    strength: null,
    batchNumber: 'C789',
    status: 'NEAR_EXPIRY',
    expirationDate: '2026-11-28',
    daysToExpiry: 20,
  },
];

const GSM_LIMITS = { single: 160, multipart: 153 };
const UCS2_LIMITS = { single: 70, multipart: 67 };

const GSM_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
/** These take an escape character plus their own, so they count as two. */
const GSM_EXTENDED = new Set('\f^{}\\[~]|€');

export interface SmsPartCount {
  characters: number;
  parts: number;
  encoding: 'GSM-7' | 'UCS-2';
}

function countGsmCharacters(text: string): number | null {
  let count = 0;
  for (const character of text) {
    if (GSM_EXTENDED.has(character)) {
      count += 2;
    } else if (GSM_BASIC.has(character)) {
      count += 1;
    } else {
      return null;
    }
  }
  return count;
}

function toParts(characters: number, limits: typeof GSM_LIMITS): number {
  if (characters === 0) {
    return 0;
  }
  return characters <= limits.single ? 1 : Math.ceil(characters / limits.multipart);
}

/** GSM-7 unless a character needs UCS-2, which is counted in UTF-16 units. */
export function countSmsParts(text: string): SmsPartCount {
  const gsmCharacters = countGsmCharacters(text);
  if (gsmCharacters === null) {
    return { characters: text.length, parts: toParts(text.length, UCS2_LIMITS), encoding: 'UCS-2' };
  }
  return { characters: gsmCharacters, parts: toParts(gsmCharacters, GSM_LIMITS), encoding: 'GSM-7' };
}

/** A partly typed item limit previews as one item, since the server rejects it on save. */
export function renderSmsPreview(template: string, facility: string, maxItems: number): string {
  const items = [...SAMPLE_ITEMS];
  return renderSmsBody(template, {
    facility,
    date: SAMPLE_DATE,
    expired: items.filter((item) => item.status === 'EXPIRED').length,
    near_expiry: items.filter((item) => item.status === 'NEAR_EXPIRY').length,
    items: formatSmsItems(items, Number.isInteger(maxItems) && maxItems >= 1 ? maxItems : 1),
  });
}
