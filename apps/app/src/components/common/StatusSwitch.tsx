'use client';

import { Switch } from '@inventra-med/components';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface StatusSwitchProps {
  label: string;
}

/** Drives `?status=all` and goes back to the first page, keeping the search. */
export function StatusSwitch({ label }: StatusSwitchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(checked: boolean) {
    const params = new URLSearchParams(searchParams);
    if (checked) {
      params.set('status', 'all');
    } else {
      params.delete('status');
    }
    params.delete('page');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Switch
      colorPalette="teal"
      checked={searchParams.get('status') === 'all'}
      onCheckedChange={(details) => handleChange(details.checked)}
    >
      {label}
    </Switch>
  );
}
