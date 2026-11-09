import { countSmsParts, renderSmsPreview } from '../../src/lib/sms-preview';

describe('countSmsParts', () => {
  it.each([
    [0, 0],
    [160, 1],
    [161, 2],
    [306, 2],
    [307, 3],
  ])('counts %i GSM-7 characters as %i parts', (length, parts) => {
    expect(countSmsParts('a'.repeat(length))).toEqual({
      characters: length,
      parts,
      encoding: 'GSM-7',
    });
  });

  it.each([
    [70, 1],
    [71, 2],
    [134, 2],
    [135, 3],
  ])('switches to UCS-2 limits for a non-GSM character at %i characters', (length, parts) => {
    const text = `✓${'a'.repeat(length - 1)}`;

    expect(countSmsParts(text)).toEqual({ characters: length, parts, encoding: 'UCS-2' });
  });

  it('counts GSM-7 extension characters as two', () => {
    expect(countSmsParts('€'.repeat(80))).toEqual({
      characters: 160,
      parts: 1,
      encoding: 'GSM-7',
    });
    expect(countSmsParts(`${'€'.repeat(80)}a`).parts).toBe(2);
  });

  it('treats line breaks as GSM-7', () => {
    expect(countSmsParts('a\nb').encoding).toBe('GSM-7');
  });
});

describe('renderSmsPreview', () => {
  const TEMPLATE = '{facility} {date}: {expired} expired, {near_expiry} near expiry.\n{items}';

  it('fills the template from the sample items, expired first', () => {
    const lines = renderSmsPreview(TEMPLATE, 'Clinic', 10).split('\n');

    expect(lines).toEqual([
      'Clinic 2026-11-08: 1 expired, 2 near expiry.',
      'Amoxicillin 500 mg B#A123 exp 2026-11-01 (-7d)',
      'Paracetamol 500 mg B#B456 exp 2026-11-11 (3d)',
      'Cetirizine B#C789 exp 2026-11-28 (20d)',
    ]);
  });

  it('applies the item limit', () => {
    expect(renderSmsPreview('{items}', 'Clinic', 2)).toContain('+1 more, check InventraMed');
  });

  it.each([0, -1, Number.NaN, 1.5])('previews one item for the unusable limit %d', (limit) => {
    expect(renderSmsPreview('{items}', 'Clinic', limit).split('\n')).toEqual([
      'Amoxicillin 500 mg B#A123 exp 2026-11-01 (-7d)',
      '+2 more, check InventraMed',
    ]);
  });
});
