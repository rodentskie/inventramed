'use client';

import { Input, InputGroup } from '@chakra-ui/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LuSearch } from 'react-icons/lu';

export const SEARCH_DEBOUNCE_MS = 300;

interface SearchInputProps {
  placeholder: string;
  label: string;
}

/**
 * Keeps `?search=` in sync with the input after a pause in typing, and goes
 * back to the first page. Uses `replace`, so typing doesn't fill the history.
 */
export function SearchInput({ placeholder, label }: SearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('search') ?? '';
  const [value, setValue] = useState(current);
  const latest = useRef({ current, searchParams });
  latest.current = { current, searchParams };

  useEffect(() => {
    const search = value.trim();
    if (search === latest.current.current.trim()) {
      return;
    }
    const timer = setTimeout(() => {
      const params = new URLSearchParams(latest.current.searchParams);
      if (search) {
        params.set('search', search);
      } else {
        params.delete('search');
      }
      params.delete('page');
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, pathname, router]);

  return (
    <InputGroup startElement={<LuSearch aria-hidden />} maxW={{ md: 'md' }}>
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </InputGroup>
  );
}
