import type { z } from 'zod';

export type ApiErrorCode =
  | 'INVALID_JSON'
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'MEDICINE_DUPLICATE'
  | 'MEDICINE_HAS_STOCK'
  | 'BATCH_DUPLICATE'
  | 'INTERNAL_ERROR';

export type ApiFieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: ApiFieldErrors,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
}

export function apiSuccess<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}

export function apiFailure(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields && { fields: error.fields }),
        },
      },
      { status: error.status },
    );
  }

  console.error('Unexpected API error', error);
  return Response.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      },
    },
    { status: 500 },
  );
}

function toFieldErrors(error: z.ZodError): ApiFieldErrors {
  const fields: ApiFieldErrors = {};
  const add = (field: string, message: string) => {
    (fields[field] ??= []).push(message);
  };

  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      issue.keys.forEach((key) => add(key, 'This field is not allowed.'));
    } else {
      add(issue.path.join('.') || '_', issue.message);
    }
  }
  return fields;
}

export function parseInput<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'The request is invalid.',
      toFieldErrors(result.error),
    );
  }
  return result.data;
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(
      400,
      'INVALID_JSON',
      'The request body must be valid JSON.',
    );
  }
}
