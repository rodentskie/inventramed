import type { z } from 'zod';

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Parses a page's `searchParams` with a list query schema. Each invalid value
 * falls back to its default instead of failing the page, so a hand-edited
 * `?page=abc` still shows the first page.
 */
export function parseListQuery<T extends z.ZodObject>(
  schema: T,
  searchParams: SearchParams,
): z.output<T> {
  const values: Record<string, string> = {};
  for (const key of Object.keys(schema.shape)) {
    const raw = searchParams[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value !== undefined) {
      values[key] = value;
    }
  }

  const result = schema.safeParse(values);
  if (result.success) {
    return result.data;
  }

  const invalid = new Set(result.error.issues.map((issue) => String(issue.path[0])));
  const valid = Object.fromEntries(
    Object.entries(values).filter(([key]) => !invalid.has(key)),
  );
  return schema.parse(valid);
}
