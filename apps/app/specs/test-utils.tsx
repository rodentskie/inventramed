import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

export function renderWithChakra(element: ReactElement): RenderResult {
  return render(
    <ChakraProvider value={defaultSystem}>{element}</ChakraProvider>,
  );
}
