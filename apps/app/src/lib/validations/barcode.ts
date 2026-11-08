import { z } from 'zod';

export const BARCODE_MAX_LENGTH = 64;

/** `MED-` or `BAT-` and 12 Crockford base32 characters, as `src/lib/barcode.ts` generates them. */
export const OWN_BARCODE_PATTERN = /^(MED|BAT)-[0-9A-HJKMNP-TV-Z]{12}$/;

/** Any case, so `med-…` typed by hand is still treated as an app barcode. */
export const OWN_PREFIX_PATTERN = /^(MED|BAT)-/i;

// Printable ASCII without spaces. Empty passes here, so optional fields can be cleared.
const PRINTABLE_ASCII = /^[\x21-\x7E]*$/;

const MESSAGES = {
  required: 'Enter a barcode.',
  tooLong: `Barcodes are at most ${BARCODE_MAX_LENGTH} characters.`,
  printable: 'Use only letters, digits and symbols, with no spaces.',
  ownPrefix:
    "MED- and BAT- barcodes are made by InventraMed. Use the product's own barcode.",
  incomplete:
    'This InventraMed barcode is incomplete. Scan it again or check the code.',
};

const barcodeText = z
  .string()
  .trim()
  .max(BARCODE_MAX_LENGTH, MESSAGES.tooLong)
  .regex(PRINTABLE_ASCII, MESSAGES.printable);

/** The manufacturer's barcode. Stored as scanned or typed, never with the app's own prefixes. */
export const productBarcodeSchema = barcodeText.refine(
  (value) => !OWN_PREFIX_PATTERN.test(value),
  MESSAGES.ownPrefix,
);

/** Anything a scanner or a person can enter on `/scan`. App barcodes are uppercased. */
export const barcodeLookupSchema = z.strictObject({
  code: barcodeText
    .min(1, MESSAGES.required)
    .transform((value) =>
      OWN_PREFIX_PATTERN.test(value) ? value.toUpperCase() : value,
    )
    .refine(
      (value) => !OWN_PREFIX_PATTERN.test(value) || OWN_BARCODE_PATTERN.test(value),
      MESSAGES.incomplete,
    ),
});

export type BarcodeLookupInput = z.output<typeof barcodeLookupSchema>;
