'use client';

import { Box, Button, Flex, Stack, Text, Textarea } from '@chakra-ui/react';
import { Field } from '@inventra-med/components';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { countSmsParts, renderSmsPreview } from '@/lib/sms-preview';
import { SMS_PLACEHOLDERS } from '@/lib/validations/settings';

const PLACEHOLDER_CHIPS = [...SMS_PLACEHOLDERS].map((name) => `{${name}}`);

interface SmsTemplateFieldProps {
  value: string;
  onChange: (value: string) => void;
  facilityName: string;
  maxItems: number;
  error?: string;
  /** Fields shown between the template and its preview. */
  children?: ReactNode;
}

function formatParts(parts: number): string {
  return parts === 1 ? '1 SMS' : `${parts} SMS parts`;
}

function SmsPreview({ text }: { text: string }) {
  const { characters, parts, encoding } = countSmsParts(text);

  return (
    <Stack gap="1.5" maxW="md">
      <Text textStyle="sm" fontWeight="semibold">
        Preview
      </Text>
      <Box
        data-testid="sms-preview"
        borderWidth="1px"
        borderRadius="md"
        bg="bg.subtle"
        p="3"
        textStyle="sm"
        whiteSpace="pre-wrap"
        wordBreak="break-word"
      >
        {text}
      </Box>
      <Text textStyle="xs" color="fg.muted">
        {characters} characters · {formatParts(parts)}
      </Text>
      {encoding === 'UCS-2' && (
        <Text textStyle="xs" color="fg.muted">
          Contains characters outside GSM-7, so a message holds 70 characters, or 67 per part.
        </Text>
      )}
    </Stack>
  );
}

export function SmsTemplateField({
  value,
  onChange,
  facilityName,
  maxItems,
  error,
  children,
}: SmsTemplateFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCursor = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCursor.current !== null) {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pendingCursor.current, pendingCursor.current);
      pendingCursor.current = null;
    }
  }, [value]);

  function insertAtCursor(chip: string) {
    const start = textareaRef.current?.selectionStart ?? value.length;
    const end = textareaRef.current?.selectionEnd ?? value.length;
    pendingCursor.current = start + chip.length;
    onChange(`${value.slice(0, start)}${chip}${value.slice(end)}`);
  }

  return (
    <Stack gap="6">
      <Field
        maxW="md"
        label={<Text as="span" fontWeight="semibold">Template</Text>}
        invalid={Boolean(error)}
        errorText={error}
        helperText="Applies to digests made after the change."
      >
        <Textarea
          ref={textareaRef}
          rows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Flex gap="1.5" wrap="wrap">
          {PLACEHOLDER_CHIPS.map((chip) => (
            <Button
              key={chip}
              type="button"
              size="2xs"
              variant="outline"
              onClick={() => insertAtCursor(chip)}
            >
              {chip}
            </Button>
          ))}
        </Flex>
      </Field>
      {children}
      <SmsPreview text={renderSmsPreview(value, facilityName.trim(), maxItems)} />
    </Stack>
  );
}
