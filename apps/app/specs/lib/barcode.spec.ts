/** @jest-environment node */
import {
  generateBatchBarcode,
  generateMedicineBarcode,
  parseBarcode,
  productBarcodeVariants,
} from '../../src/lib/barcode';

describe('barcode generators', () => {
  it('generates medicine barcodes with the MED prefix', () => {
    expect(generateMedicineBarcode()).toMatch(/^MED-[0-9A-HJKMNP-TV-Z]{12}$/);
  });

  it('generates batch barcodes with the BAT prefix', () => {
    expect(generateBatchBarcode()).toMatch(/^BAT-[0-9A-HJKMNP-TV-Z]{12}$/);
  });

  it('generates different values', () => {
    expect(generateMedicineBarcode()).not.toBe(generateMedicineBarcode());
  });
});

describe('parseBarcode', () => {
  it.each([
    ['MED-7Q2K0000AAAA', 'medicine'],
    ['BAT-91XZ4KD0Q7M2', 'batch'],
    ['4800123456789', 'product'],
  ])('routes %s to %s', (code, kind) => {
    expect(parseBarcode(code)).toEqual({ kind, code });
  });
});

describe('productBarcodeVariants', () => {
  it('adds the EAN-13 form of a 12-digit UPC-A code', () => {
    expect(productBarcodeVariants('012345678905')).toEqual(['012345678905', '0012345678905']);
  });

  it('adds the UPC-A form of an EAN-13 code with a leading 0', () => {
    expect(productBarcodeVariants('0012345678905')).toEqual(['0012345678905', '012345678905']);
  });

  it.each([['4800123456789'], ['96385074'], ['ABC-123']])('keeps %s as the only form', (code) => {
    expect(productBarcodeVariants(code)).toEqual([code]);
  });
});
