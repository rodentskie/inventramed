'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Values to set in the URL. An empty string or null removes the key. */
export type FilterUpdates = Record<string, string | null>;

/**
 * Reads and writes a list page's filters in the URL. Every change goes back to
 * the first page, because the old page number may be past the new end.
 */
export function useListFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setFilters(updates: FilterUpdates) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    params.delete('page');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return { get: (key: string) => searchParams.get(key) ?? '', setFilters };
}
