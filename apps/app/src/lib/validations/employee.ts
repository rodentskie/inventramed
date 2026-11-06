import { z } from 'zod';
import {
  blankToNull,
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

const USERNAME_PATTERN = /^[a-z0-9._-]{3,100}$/;
const PH_MOBILE_PATTERN = /^\+639\d{9}$/;

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

export const createEmployeeSchema = z
  .strictObject({
    firstName: requiredText(NAME_MAX_LENGTH),
    middleName: optionalText(NAME_MAX_LENGTH),
    lastName: requiredText(NAME_MAX_LENGTH),
    email: blankToNull(email),
    contactNumber: blankToNull(contactNumber),
    position: optionalText(POSITION_MAX_LENGTH),
    receivesSmsAlerts: z.boolean().default(false),
    username: z
      .string()
      .regex(
        USERNAME_PATTERN,
        'Use 3 to 100 lowercase letters, numbers, dots, underscores or hyphens.',
      ),
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
        message: 'A contact number is required to receive SMS alerts.',
      });
    }
  });

export type CreateEmployeeInput = z.output<typeof createEmployeeSchema>;
