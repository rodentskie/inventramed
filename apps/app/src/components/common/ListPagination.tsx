'use client';

import { ButtonGroup, Flex, Text } from '@chakra-ui/react';
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from '@inventra-med/components';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { formatCount } from '@/lib/format';

interface ListPaginationProps {
  total: number;
  page: number;
  pageSize: number;
}

/** Drives `?page=` and keeps the other query values, such as the search. */
export function ListPagination({ total, page, pageSize }: ListPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (total === 0) {
    return null;
  }

  function goTo(nextPage: number) {
    const params = new URLSearchParams(searchParams);
    if (nextPage > 1) {
      params.set('page', String(nextPage));
    } else {
      params.delete('page');
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <Flex justify="flex-end" align="center" gap="3" wrap="wrap">
      {total > pageSize && (
        <PaginationRoot
          count={total}
          pageSize={pageSize}
          page={page}
          onPageChange={(details) => goTo(details.page)}
        >
          <ButtonGroup variant="ghost" size="sm">
            <PaginationPrevTrigger aria-label="Previous page" />
            <PaginationItems />
            <PaginationNextTrigger aria-label="Next page" />
          </ButtonGroup>
        </PaginationRoot>
      )}
      <Text textStyle="sm" color="fg.muted">
        {first > total
          ? `${formatCount(total)} total`
          : `${formatCount(first)}–${formatCount(last)} of ${formatCount(total)}`}
      </Text>
    </Flex>
  );
}
