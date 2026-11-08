import { parseListQuery } from '../../src/lib/list-query';
import { medicineListQuerySchema } from '../../src/lib/validations/medicine';

describe('parseListQuery', () => {
  it('parses valid values', () => {
    expect(
      parseListQuery(medicineListQuerySchema, { search: 'para', page: '3', pageSize: '50' }),
    ).toEqual({ search: 'para', page: 3, pageSize: 50 });
  });

  it('uses the defaults without values', () => {
    expect(parseListQuery(medicineListQuerySchema, {})).toEqual({ page: 1, pageSize: 20 });
  });

  it('trims the search', () => {
    expect(parseListQuery(medicineListQuerySchema, { search: '  amox  ' }).search).toBe('amox');
  });

  it.each([['abc'], ['0'], ['-2'], ['1.5']])(
    'falls back to page 1 for page=%s and keeps the rest',
    (page) => {
      expect(
        parseListQuery(medicineListQuerySchema, { search: 'para', page, pageSize: '10' }),
      ).toEqual({ search: 'para', page: 1, pageSize: 10 });
    },
  );

  it('falls back to the default page size when it is too large', () => {
    expect(parseListQuery(medicineListQuerySchema, { pageSize: '1000' }).pageSize).toBe(20);
  });

  it('uses the first of repeated values and ignores unknown keys', () => {
    expect(
      parseListQuery(medicineListQuerySchema, { page: ['2', '5'], sort: 'name' }),
    ).toEqual({ page: 2, pageSize: 20 });
  });
});
