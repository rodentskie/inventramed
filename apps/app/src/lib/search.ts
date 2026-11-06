/** Makes `%`, `_` and `\` match literally in a Prisma `contains` filter. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
