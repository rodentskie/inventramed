import {
  barcodeLookupSchema,
  productBarcodeSchema,
} from '../../../src/lib/validations/barcode';
import {
  createMedicineSchema,
  updateMedicineSchema,
} from '../../../src/lib/validations/medicine';

describe('productBarcodeSchema', () => {
  it.each([['4800123456789'], ['012345678905'], ['96385074'], ['ABC-123/x']])(
    'accepts %s',
    (code) => {
      expect(productBarcodeSchema.parse(`  ${code} `)).toBe(code);
    },
  );

  it.each([
    ['inner spaces', '4800 1234'],
    ['non-ASCII', '480012é'],
    ['a MED- code', 'MED-7Q2K0000AAAA'],
    ['a lowercase bat- code', 'bat-91xz4kd0q7m2'],
    ['65 characters', '1'.repeat(65)],
  ])('rejects %s', (_name, code) => {
    expect(productBarcodeSchema.safeParse(code).success).toBe(false);
  });
});

describe('productBarcode on the medicine schemas', () => {
  it('turns a blank product barcode into null', () => {
    expect(
      createMedicineSchema.parse({ name: 'Paracetamol', productBarcode: '  ' }).productBarcode,
    ).toBeNull();
  });

  it('lets an update clear the product barcode', () => {
    expect(updateMedicineSchema.parse({ productBarcode: null }).productBarcode).toBeNull();
  });

  it('rejects an app barcode as the product barcode', () => {
    const result = createMedicineSchema.safeParse({
      name: 'Paracetamol',
      productBarcode: 'MED-7Q2K0000AAAA',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/made by InventraMed/);
  });
});

describe('barcodeLookupSchema', () => {
  it('uppercases app barcodes', () => {
    expect(barcodeLookupSchema.parse({ code: ' med-7q2k0000aaaa ' }).code).toBe(
      'MED-7Q2K0000AAAA',
    );
  });

  it('keeps product codes as entered', () => {
    expect(barcodeLookupSchema.parse({ code: 'abc-123' }).code).toBe('abc-123');
  });

  it.each([
    ['empty', '   ', 'Enter a barcode.'],
    ['a short app barcode', 'BAT-91XZ', 'This InventraMed barcode is incomplete. Scan it again or check the code.'],
    ['excluded Crockford letters', 'MED-ILOU00000000', 'This InventraMed barcode is incomplete. Scan it again or check the code.'],
    ['spaces', '480 0123', 'Use only letters, digits and symbols, with no spaces.'],
  ])('rejects %s', (_name, code, message) => {
    const result = barcodeLookupSchema.safeParse({ code });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(message);
  });
});
