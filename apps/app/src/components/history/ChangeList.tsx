'use client';

import { Box, Button, chakra, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { type FieldChange, formatAuditValue } from '@/lib/audit-diff';

/** Longer values are cut here, with a control to show the rest. */
export const VALUE_PREVIEW_LENGTH = 200;

interface ChangeListProps {
  changes: FieldChange[];
  /** `diff` shows `before → after`; `snapshot` shows one side, the row as it was created or deleted. */
  mode: 'diff' | 'snapshot';
}

/** Rendered as a text node, so markup in a value shows as text and never runs. */
function AuditValue({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const text = formatAuditValue(value);
  const long = text.length > VALUE_PREVIEW_LENGTH;

  return (
    <chakra.span fontFamily="mono" wordBreak="break-word" whiteSpace="pre-wrap">
      {long && !expanded ? `${text.slice(0, VALUE_PREVIEW_LENGTH)}…` : text}
      {long && (
        <Button
          variant="plain"
          size="2xs"
          ms="1"
          colorPalette="teal"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </chakra.span>
  );
}

export function ChangeList({ changes, mode }: ChangeListProps) {
  if (changes.length === 0) {
    return (
      <Text textStyle="sm" color="fg.muted">
        No field changes.
      </Text>
    );
  }

  return (
    <Stack as="ul" gap="1" textStyle="sm" listStyleType="none">
      {changes.map((change) => (
        <Box as="li" key={change.field}>
          <Text as="span" fontWeight="medium">
            {change.field}:
          </Text>{' '}
          {mode === 'diff' ? (
            <>
              <AuditValue value={change.before} />
              <Text as="span" color="fg.muted">
                {' → '}
              </Text>
              <AuditValue value={change.after} />
            </>
          ) : (
            <AuditValue value={change.after ?? change.before} />
          )}
        </Box>
      ))}
    </Stack>
  );
}
