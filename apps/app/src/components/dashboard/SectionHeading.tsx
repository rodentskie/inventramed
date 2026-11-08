import { Heading, Stack, Text } from '@chakra-ui/react';

interface SectionHeadingProps {
  title: string;
  description?: string;
}

/** A small heading with optional muted helper text, like the reference's field labels. */
export function SectionHeading({ title, description }: SectionHeadingProps) {
  return (
    <Stack gap="0.5">
      <Heading as="h2" size="md">
        {title}
      </Heading>
      {description && (
        <Text textStyle="sm" color="fg.muted">
          {description}
        </Text>
      )}
    </Stack>
  );
}
