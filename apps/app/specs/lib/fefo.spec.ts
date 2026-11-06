import { allocateFefo } from '../../src/lib/fefo';

const batches = [
  { id: 'a', quantity: 10 },
  { id: 'b', quantity: 20 },
  { id: 'c', quantity: 5 },
];

describe('allocateFefo', () => {
  it('takes from one batch when it covers the quantity', () => {
    expect(allocateFefo(batches, 4)).toEqual([{ batchId: 'a', quantity: 4 }]);
  });

  it('spans batches in the order given', () => {
    expect(allocateFefo(batches, 25)).toEqual([
      { batchId: 'a', quantity: 10 },
      { batchId: 'b', quantity: 15 },
    ]);
  });

  it('uses every batch on an exact match', () => {
    expect(allocateFefo(batches, 35)).toEqual([
      { batchId: 'a', quantity: 10 },
      { batchId: 'b', quantity: 20 },
      { batchId: 'c', quantity: 5 },
    ]);
  });

  it('stops once the quantity is covered', () => {
    expect(allocateFefo(batches, 10)).toEqual([{ batchId: 'a', quantity: 10 }]);
  });

  it('returns null when stock is short', () => {
    expect(allocateFefo(batches, 36)).toBeNull();
  });

  it('returns null when there are no batches', () => {
    expect(allocateFefo([], 1)).toBeNull();
  });
});
