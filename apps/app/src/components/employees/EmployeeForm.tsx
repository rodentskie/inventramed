'use client';

import { Button, Flex, Input, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import {
  Field,
  NativeSelectField,
  NativeSelectRoot,
  PasswordInput,
  Switch,
  toaster,
} from '@inventra-med/components';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type HTMLInputTypeAttribute } from 'react';
import { createEmployeeAction, updateEmployeeAction } from '@/actions/employees';
import { SectionHeading } from '@/components/dashboard/SectionHeading';
import { useActionSubmit, type FieldErrors } from '@/hooks/use-action-submit';
import { capitalize } from '@/lib/format';
import { normalizeContactNumber } from '@/lib/validations/employee';
import type { EmployeeWithUser } from '@/types/employee';
import type { RoleSummary } from '@/types/role';

export const SELF_CHANGE_HINT = "You can't change your own role or status.";

const DEFAULT_ROLE = 'staff';

interface FormValues {
  firstName: string;
  middleName: string;
  lastName: string;
  position: string;
  email: string;
  contactNumber: string;
  receivesSmsAlerts: boolean;
  username: string;
  roleId: string;
  password: string;
}

type TextField = Exclude<keyof FormValues, 'receivesSmsAlerts'>;
type SetField = <K extends keyof FormValues>(field: K, value: FormValues[K]) => void;

interface SectionProps {
  values: FormValues;
  errors: FieldErrors;
  set: SetField;
}

interface TextInputFieldProps extends SectionProps {
  field: TextField;
  label: string;
  required?: boolean;
  type?: HTMLInputTypeAttribute;
  placeholder?: string;
  autoComplete?: string;
}

interface EmployeeFormProps {
  roles: RoleSummary[];
  /** Edits this employee; creates a new one without it. */
  employee?: EmployeeWithUser;
  /** The record belongs to the signed-in user, so the role can't change. */
  isSelf?: boolean;
}

function toValues(roles: RoleSummary[], employee?: EmployeeWithUser): FormValues {
  const defaultRole = roles.find((role) => role.name === DEFAULT_ROLE) ?? roles[0];
  return {
    firstName: employee?.firstName ?? '',
    middleName: employee?.middleName ?? '',
    lastName: employee?.lastName ?? '',
    position: employee?.position ?? '',
    email: employee?.email ?? '',
    contactNumber: employee?.contactNumber ?? '',
    receivesSmsAlerts: employee?.receivesSmsAlerts ?? false,
    username: employee?.user.username ?? '',
    roleId: employee?.user.roleId ?? defaultRole?.id ?? '',
    password: '',
  };
}

/** The values as they are sent. The schemas trim the other text fields. */
function toPayload(values: FormValues): FormValues {
  return {
    ...values,
    username: values.username.trim(),
    contactNumber: normalizeContactNumber(values.contactNumber.trim()),
  };
}

/** Only the fields that differ, since the update schema rejects an empty change. */
function changedFields(payload: FormValues, initial: FormValues): Partial<FormValues> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => {
      const before = initial[key as keyof FormValues];
      return typeof value === 'string' ? value.trim() !== before : value !== before;
    }),
  );
}

function TextInputField({
  values,
  errors,
  set,
  field,
  label,
  required,
  type,
  placeholder,
  autoComplete,
}: TextInputFieldProps) {
  return (
    <Field
      label={label}
      required={required}
      invalid={Boolean(errors[field])}
      errorText={errors[field]}
    >
      <Input
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={values[field]}
        onChange={(event) => set(field, event.target.value)}
      />
    </Field>
  );
}

function PersonalSection(props: SectionProps) {
  return (
    <Stack as="section" gap="3">
      <SectionHeading title="Personal details" />
      <SimpleGrid columns={{ base: 1, md: 3 }} gap="4">
        <TextInputField {...props} field="firstName" label="First name" required />
        <TextInputField {...props} field="middleName" label="Middle name" />
        <TextInputField {...props} field="lastName" label="Last name" required />
        <TextInputField {...props} field="position" label="Position" />
        <TextInputField {...props} field="email" label="Email" type="email" autoComplete="off" />
      </SimpleGrid>
    </Stack>
  );
}

function ContactSection({
  initiallyOn,
  ...props
}: SectionProps & { initiallyOn: boolean }) {
  const { values, set } = props;
  const hasNumber = values.contactNumber.trim() !== '';

  function setNumber(value: string) {
    set('contactNumber', value);
    if (value.trim() === '') {
      set('receivesSmsAlerts', false);
    }
  }

  return (
    <Stack as="section" gap="3">
      <SectionHeading title="Contact and alerts" />
      <SimpleGrid columns={{ base: 1, md: 3 }} gap="4">
        <Field
          label="Contact number"
          invalid={Boolean(props.errors.contactNumber)}
          errorText={props.errors.contactNumber}
        >
          <Input
            type="tel"
            placeholder="+639171234567"
            autoComplete="off"
            value={values.contactNumber}
            onChange={(event) => setNumber(event.target.value)}
          />
        </Field>
      </SimpleGrid>
      <Stack gap="1">
        <Switch
          colorPalette="teal"
          disabled={!hasNumber}
          checked={values.receivesSmsAlerts}
          onCheckedChange={(details) => set('receivesSmsAlerts', details.checked)}
        >
          Receive SMS expiry alerts
        </Switch>
        {!hasNumber && (
          <Text textStyle="sm" color="fg.muted">
            Add a contact number to turn on SMS alerts.
          </Text>
        )}
        {initiallyOn && !values.receivesSmsAlerts && (
          <Text textStyle="sm" color="fg.muted">
            Saving this cancels their pending SMS alerts.
          </Text>
        )}
      </Stack>
    </Stack>
  );
}

function AccountSection({
  roles,
  isEdit,
  isSelf,
  ...props
}: SectionProps & { roles: RoleSummary[]; isEdit: boolean; isSelf: boolean }) {
  const { values, errors, set } = props;
  const description = roles.find((role) => role.id === values.roleId)?.description;

  return (
    <Stack as="section" gap="3">
      <SectionHeading title="Account" />
      <SimpleGrid columns={{ base: 1, md: 3 }} gap="4">
        <TextInputField {...props} field="username" label="Username" required autoComplete="off" />
        <Field
          label="Role"
          required
          disabled={isSelf}
          invalid={Boolean(errors.roleId)}
          errorText={errors.roleId}
          helperText={isSelf ? SELF_CHANGE_HINT : description}
        >
          <NativeSelectRoot disabled={isSelf}>
            <NativeSelectField
              value={values.roleId}
              onChange={(event) => set('roleId', event.target.value)}
              items={roles.map((role) => ({ value: role.id, label: capitalize(role.name) }))}
            />
          </NativeSelectRoot>
        </Field>
        {!isEdit && (
          <Field
            label="Password"
            required
            invalid={Boolean(errors.password)}
            errorText={errors.password}
          >
            <PasswordInput
              autoComplete="new-password"
              value={values.password}
              onChange={(event) => set('password', event.target.value)}
            />
          </Field>
        )}
      </SimpleGrid>
    </Stack>
  );
}

export function EmployeeForm({ roles, employee, isSelf = false }: EmployeeFormProps) {
  const router = useRouter();
  const initial = toValues(roles, employee);
  const [values, setValues] = useState(initial);
  const { errors, isSubmitting, submit } = useActionSubmit();
  const payload = toPayload(values);
  const changes = changedFields(payload, initial);
  const sectionProps = { values, errors, set: setField };

  function setField<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (employee) {
      void submit(() => updateEmployeeAction(employee.id, changes), {
        onSuccess: (updated) => {
          toaster.create({ type: 'success', title: 'Changes saved' });
          // Shows what was stored, such as a local number in its +63 form.
          setValues(toValues(roles, updated));
        },
      });
      return;
    }
    void submit(() => createEmployeeAction(payload), {
      onSuccess: (created) => {
        toaster.create({ type: 'success', title: 'Employee created' });
        router.push(`/employees/${created.id}`);
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack gap="8" maxW="4xl">
        <PersonalSection {...sectionProps} />
        <ContactSection {...sectionProps} initiallyOn={initial.receivesSmsAlerts} />
        <AccountSection
          {...sectionProps}
          roles={roles}
          isEdit={Boolean(employee)}
          isSelf={isSelf}
        />
        <Flex justify="flex-end" gap="2">
          <Button asChild variant="outline">
            <NextLink href="/employees">Cancel</NextLink>
          </Button>
          <Button
            type="submit"
            colorPalette="teal"
            loading={isSubmitting}
            disabled={Boolean(employee) && Object.keys(changes).length === 0}
          >
            {employee ? 'Save changes' : 'Create employee'}
          </Button>
        </Flex>
      </Stack>
    </form>
  );
}
