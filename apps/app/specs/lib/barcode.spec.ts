/** @jest-environment node */
import {
  generateBatchBarcode,
  generateMedicineBarcode,
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
