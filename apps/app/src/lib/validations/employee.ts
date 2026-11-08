import { z } from 'zod';
import {
  AT_LEAST_ONE_FIELD,
  blankToNull,
  hasAtLeastOneField,
  hasNoNul,
  optionalText,
  requiredText,
  text,
} from '@/lib/validations/common';

const NAME_MAX_LENGTH = 100;
const POSITION_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;
const CONTACT_NUMBER_MAX_LENGTH = 20;
const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignores everything after 72 bytes.
const PASSWORD_MAX_BYTES = 72;
const SEARCH_MAX_LENGTH = 200;
const PAGE_MAX = 1_000_000;
const PAGE_SIZE_MAX = 100;

const USERNAME_PATTERN = /^[a-z0-9._-]{3,100}$/;
const PH_MOBILE_PATTERN = /^\+639\d{9}$/;

const PH_LOCAL_MOBILE_PATTERN = /^09\d{9}$/;

const SMS_NEEDS_CONTACT = 'A contact number is required to receive SMS alerts.';

/**
 * For forms, since numbers are usually written locally: `0917 123 4567` becomes
 * `+639171234567`. Anything else comes back as typed, for the schema to reject.
 */
export function normalizeContactNumber(value: string): string {
  const compact = value.replace(/[\s-]/g, '');
  if (PH_LOCAL_MOBILE_PATTERN.test(compact)) {
    return `+63${compact.slice(1)}`;
  }
  return PH_MOBILE_PATTERN.test(compact) ? compact : value;
}

const emailFormat = z.email();

const email = text(EMAIL_MAX_LENGTH)
  .toLowerCase()
  .refine(
    (value) => value === '' || emailFormat.safeParse(value).success,
    'Enter a valid email address.',
  );

const contactNumber = text(CONTACT_NUMBER_MAX_LENGTH).refine(
  (value) => value === '' || PH_MOBILE_PATTERN.test(value),
  'Enter a Philippine mobile number with the country code, such as +639171234567.',
);

const username = z
  .string()
  .regex(
    USERNAME_PATTERN,
    'Use 3 to 100 lowercase letters, numbers, dots, underscores or hyphens.',
  );

// Rules shared by create and update, which only differ in what is required.
const name = requiredText(NAME_MAX_LENGTH);
const optionalFields = {
  middleName: optionalText(NAME_MAX_LENGTH),
  email: blankToNull(email),
  contactNumber: blankToNull(contactNumber),
  position: optionalText(POSITION_MAX_LENGTH),
};

export const createEmployeeSchema = z
  .strictObject({
    ...optionalFields,
    firstName: name,
    lastName: name,
    receivesSmsAlerts: z.boolean().default(false),
    username,
    password: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH,
        `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
      )
      .refine(hasNoNul, 'Contains invalid characters.')
      .refine(
        (value) => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES,
        `Use at most ${PASSWORD_MAX_BYTES} bytes.`,
      ),
    roleId: z.uuid(),
  })
  .superRefine((value, ctx) => {
    if (value.receivesSmsAlerts && !value.contactNumber) {
      ctx.addIssue({
        code: 'custom',
        path: ['contactNumber'],
        message: SMS_NEEDS_CONTACT,
      });
    }
  });

export const updateEmployeeSchema = z
  .strictObject({
    ...optionalFields,
    firstName: name.optional(),
    lastName: name.optional(),
    receivesSmsAlerts: z.boolean().optional(),
    username: username.optional(),
    roleId: z.uuid().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(hasAtLeastOneField, AT_LEAST_ONE_FIELD)
  .superRefine((value, ctx) => {
    // An absent number may already be stored, so updateEmployee checks that case.
    if (value.receivesSmsAlerts && value.contactNumber === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['contactNumber'],
        message: SMS_NEEDS_CONTACT,
      });
    }
  });

export const employeeListQuerySchema = z.strictObject({
  search: text(SEARCH_MAX_LENGTH).optional(),
  page: z.coerce.number().int().min(1).max(PAGE_MAX).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
  status: z.enum(['active', 'all']).default('active'),
});

export type CreateEmployeeInput = z.output<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.output<typeof updateEmployeeSchema>;
export type EmployeeListQuery = z.output<typeof employeeListQuerySchema>;
