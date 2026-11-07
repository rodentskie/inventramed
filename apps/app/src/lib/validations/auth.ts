import { z } from 'zod';

// Not strict: NextAuth also passes csrfToken, callbackUrl and json.
// Not trimmed: the server compares both values exactly.
export const loginSchema = z.object({
  username: z
    .string()
    .min(1, 'Enter your username.')
    .max(100, 'Username is too long.'),
  password: z
    .string()
    .min(1, 'Enter your password.')
    .max(200, 'Password is too long.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
