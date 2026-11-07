'use client';

import { Button, Field, Input, Stack } from '@chakra-ui/react';
import { PasswordInput, toaster } from '@inventra-med/components';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { type FormEvent, useState } from 'react';
import { z } from 'zod';
import { isLockoutMessage } from '@/lib/login-limit';
import { type LoginInput, loginSchema } from '@/lib/validations/auth';

type FieldErrors = Partial<Record<keyof LoginInput, string>>;

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/** Whether the server rejected the credentials, rather than failing to answer. */
function isRejection(error: string): boolean {
  return error === 'CredentialsSignin' || isLockoutMessage(error);
}

function getErrorMessage(error: string): string {
  if (error === 'CredentialsSignin') {
    return 'Incorrect username or password.';
  }
  return isLockoutMessage(error)
    ? `Too many attempts. ${error}.`
    : GENERIC_ERROR;
}

function showError(title: string) {
  toaster.create({ type: 'error', title });
}

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(credentials: LoginInput) {
    setIsSubmitting(true);
    try {
      const result = await signIn('credentials', {
        ...credentials,
        redirect: false,
        callbackUrl: '/',
      });

      if (result?.ok && !result.error) {
        router.replace('/');
        router.refresh();
        return;
      }

      const error = result?.error ?? '';
      showError(getErrorMessage(error));
      if (isRejection(error)) {
        setPassword('');
      }
    } catch {
      showError(GENERIC_ERROR);
    }
    setIsSubmitting(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const parsed = loginSchema.safeParse({ username, password });
    if (!parsed.success) {
      const { fieldErrors } = z.flattenError(parsed.error);
      setErrors({
        username: fieldErrors.username?.[0],
        password: fieldErrors.password?.[0],
      });
      return;
    }

    setErrors({});
    void submit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack gap="4">
        <Field.Root invalid={Boolean(errors.username)}>
          <Field.Label>Username</Field.Label>
          <Input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Field.ErrorText>{errors.username}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={Boolean(errors.password)}>
          <Field.Label>Password</Field.Label>
          <PasswordInput
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Field.ErrorText>{errors.password}</Field.ErrorText>
        </Field.Root>
        <Button
          type="submit"
          colorPalette="teal"
          width="full"
          loading={isSubmitting}
          loadingText="Signing in"
        >
          Sign in
        </Button>
      </Stack>
    </form>
  );
}
