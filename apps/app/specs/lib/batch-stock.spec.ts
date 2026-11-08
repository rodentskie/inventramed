import {
  getBatchActions,
  getExpiredQuantity,
  getUsableQuantity,
  isDisposable,
} from '../../src/lib/batch-stock';
import { batch } from '../components/medicines/fixtures';

const expired = batch({ id: 'old', status: 'EXPIRED', daysToExpiry: -2, quantity: 20 });
const emptyExpired = batch({ id: 'gone', status: 'EXPIRED', daysToExpiry: -9, quantity: 0 });
const usable = batch({ id: 'new', status: 'SAFE', quantity: 150 });

describe('batch stock', () => {
  it('only treats an expired batch with stock as disposable', () => {
    expect(isDisposable(expired)).toBe(true);
    expect(isDisposable(emptyExpired)).toBe(false);
    expect(isDisposable(usable)).toBe(false);
  });

  it('splits stock into usable and expired', () => {
    const batches = [expired, emptyExpired, usable];

    expect(getExpiredQuantity(batches)).toBe(20);
    expect(getUsableQuantity(batches)).toBe(150);
  });
});

describe('getBatchActions', () => {
  it.each([
    ['no permissions', usable, false, false, []],
    ['inventory:write', usable, true, false, ['count', 'damaged', 'lost', 'returned']],
    ['both', usable, true, true, ['receive', 'count', 'damaged', 'lost', 'returned']],
    ['an expired batch', expired, true, false, ['count', 'damaged', 'lost', 'returned', 'dispose']],
    ['an empty expired batch', emptyExpired, true, false, ['count', 'damaged', 'lost', 'returned']],
    ['an expired batch, read-only', expired, false, false, []],
  ])('with %s', (_name, target, canMove, canReceive, expected) => {
    expect(getBatchActions(target, { canMove, canReceive })).toEqual(expected);
  });
});
