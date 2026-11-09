import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { SmsTemplateField } from '../../../src/components/settings/SmsTemplateField';
import { renderWithChakra } from '../../test-utils';

function Harness({ initial, error }: { initial: string; error?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <SmsTemplateField
      value={value}
      onChange={setValue}
      facilityName="Clinic"
      maxItems={10}
      error={error}
    />
  );
}

const textarea = () => screen.getByLabelText('Template') as HTMLTextAreaElement;
const preview = () => screen.getByTestId('sms-preview').textContent;

describe('SmsTemplateField', () => {
  it.each(['{facility}', '{date}', '{expired}', '{near_expiry}', '{items}'])(
    'offers a chip for %s',
    (name) => {
      renderWithChakra(<Harness initial="" />);

      expect(screen.getByRole('button', { name })).toBeTruthy();
    },
  );

  it('inserts a chip at the cursor and moves the cursor after it', () => {
    renderWithChakra(<Harness initial="ab" />);
    textarea().setSelectionRange(1, 1);

    fireEvent.click(screen.getByRole('button', { name: '{date}' }));

    expect(textarea().value).toBe('a{date}b');
    expect(textarea().selectionStart).toBe(7);
    expect(textarea().selectionEnd).toBe(7);
  });

  it('replaces selected text with the chip', () => {
    renderWithChakra(<Harness initial="abc" />);
    textarea().setSelectionRange(1, 2);

    fireEvent.click(screen.getByRole('button', { name: '{date}' }));

    expect(textarea().value).toBe('a{date}c');
  });

  it('updates the preview and count as the user types', () => {
    renderWithChakra(<Harness initial="{facility}" />);
    expect(preview()).toBe('Clinic');
    expect(screen.getByText('6 characters · 1 SMS')).toBeTruthy();

    fireEvent.change(textarea(), { target: { value: `{facility} ${'a'.repeat(160)}` } });

    expect(screen.getByText('167 characters · 2 SMS parts')).toBeTruthy();
  });

  it('says when a character forces smaller parts', () => {
    renderWithChakra(<Harness initial="✓" />);

    expect(screen.getByText(/outside GSM-7/)).toBeTruthy();
  });

  it("shows the server's error for an unknown placeholder", () => {
    renderWithChakra(<Harness initial="{name}" error="Only {facility} are allowed." />);

    expect(screen.getByText('Only {facility} are allowed.')).toBeTruthy();
  });
});
