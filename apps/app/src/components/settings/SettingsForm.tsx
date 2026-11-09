'use client';

import { Button, Flex, HStack, Input, NumberInput, Stack, Text } from '@chakra-ui/react';
import { Field, Switch, toaster } from '@inventra-med/components';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { updateSettingsAction } from '@/actions/settings';
import { SectionHeading } from '@/components/dashboard/SectionHeading';
import { SmsTemplateField } from '@/components/settings/SmsTemplateField';
import { TimezoneSelect } from '@/components/settings/TimezoneSelect';
import { useActionSubmit, type FieldErrors } from '@/hooks/use-action-submit';
import {
  diffSettings,
  toFormValues,
  type NumberField,
  type SettingsFormValues,
} from '@/lib/settings-diff';
import type { Settings } from '@/types/settings';

const NEXT_CLAIM = "Picked up on the worker's next claim.";

interface SectionProps {
  values: SettingsFormValues;
  errors: FieldErrors;
  set: <K extends keyof SettingsFormValues>(field: K, value: SettingsFormValues[K]) => void;
}

interface SettingFieldProps {
  label: string;
  help: string;
  error?: string;
  children: ReactNode;
}

interface NumberSettingProps extends SectionProps {
  field: NumberField;
  label: string;
  help: string;
  unit?: string;
}

interface SettingsFormProps {
  settings: Settings;
  /** Rendered on the server, so its relative time can't cause a hydration mismatch. */
  workerStatus: ReactNode;
}

function SettingField({ label, help, error, children }: SettingFieldProps) {
  return (
    <Field
      maxW="md"
      label={<Text as="span" fontWeight="semibold">{label}</Text>}
      helperText={help}
      invalid={Boolean(error)}
      errorText={error}
    >
      {children}
    </Field>
  );
}

function NumberSetting({ values, errors, set, field, label, help, unit }: NumberSettingProps) {
  return (
    <SettingField label={label} help={help} error={errors[field]}>
      <HStack gap="2">
        {/* Grouping would turn 86400 into "86,400", which isn't a number when saved. */}
        <NumberInput.Root
          w="32"
          formatOptions={{ useGrouping: false }}
          value={values[field]}
          onValueChange={(details) => set(field, details.value)}
        >
          <NumberInput.Control />
          <NumberInput.Input />
        </NumberInput.Root>
        {unit && (
          <Text textStyle="sm" color="fg.muted">
            {unit}
          </Text>
        )}
      </HStack>
    </SettingField>
  );
}

function GeneralSection({ values, errors, set }: SectionProps) {
  return (
    <Stack as="section" gap="4">
      <SectionHeading title="General" />
      <SettingField
        label="Facility name"
        help="Used as the sender label in SMS alerts. Applies to digests made after the change."
        error={errors.facilityName}
      >
        <Input
          value={values.facilityName}
          onChange={(event) => set('facilityName', event.target.value)}
        />
      </SettingField>
      <SettingField
        label="Timezone"
        help='Defines "today" for expiry dates and the daily digest. Applies at once.'
        error={errors.timezone}
      >
        <TimezoneSelect value={values.timezone} onChange={(value) => set('timezone', value)} />
      </SettingField>
    </Stack>
  );
}

function ExpirySection(props: SectionProps) {
  const { values, errors, set } = props;
  return (
    <Stack as="section" gap="4">
      <SectionHeading title="Expiry alerts" />
      <NumberSetting
        {...props}
        field="nearExpiryThresholdDays"
        label="Near-expiry threshold"
        unit="days"
        help="Batches expiring within this many days are near expiry. Statuses change at once; existing digests keep their snapshot."
      />
      <SettingField
        label="Daily digest time"
        help="The digest is created at or after this local time. Takes effect from the next day without a digest."
        error={errors.dailyNotificationTime}
      >
        <Input
          type="time"
          w="32"
          value={values.dailyNotificationTime}
          onChange={(event) => set('dailyNotificationTime', event.target.value)}
        />
      </SettingField>
    </Stack>
  );
}

function SmsSection(props: SectionProps) {
  const { values, errors, set } = props;
  return (
    <Stack as="section" gap="4">
      <SectionHeading title="SMS" />
      <Stack gap="1" maxW="md">
        <Switch
          colorPalette="teal"
          checked={values.smsEnabled}
          onCheckedChange={(details) => set('smsEnabled', details.checked)}
        >
          Send SMS alerts
        </Switch>
        <Text textStyle="xs" color="fg.muted">
          When off, the worker claims nothing and pending messages wait.
        </Text>
      </Stack>
      <SmsTemplateField
        value={values.smsTemplate}
        onChange={(value) => set('smsTemplate', value)}
        facilityName={values.facilityName}
        maxItems={Number(values.smsMaxItems)}
        error={errors.smsTemplate}
      >
        <NumberSetting
          {...props}
          field="smsMaxItems"
          label="Items per SMS"
          help="Fewer items keeps an SMS under 160 characters on modules without multipart support. Applies to digests made after the change."
        />
      </SmsTemplateField>
    </Stack>
  );
}

function WorkerSection({ workerStatus, ...props }: SectionProps & { workerStatus: ReactNode }) {
  return (
    <Stack as="section" gap="4">
      <SectionHeading title="Worker" />
      <Stack gap="1.5">
        <Text textStyle="sm" fontWeight="semibold">
          Status
        </Text>
        {workerStatus}
      </Stack>
      <NumberSetting
        {...props}
        field="workerPollIntervalSecs"
        label="Poll interval"
        unit="seconds"
        help={`How often the worker checks for messages. ${NEXT_CLAIM}`}
      />
      <NumberSetting
        {...props}
        field="smsBatchSize"
        label="Messages per claim"
        help={`The most messages the worker takes at once. ${NEXT_CLAIM}`}
      />
      <NumberSetting
        {...props}
        field="smsMaxAttempts"
        label="Max attempts"
        help={`A message fails after this many tries. ${NEXT_CLAIM}`}
      />
      <NumberSetting
        {...props}
        field="smsRetryDelayMinutes"
        label="Retry delay"
        unit="minutes"
        help={`The wait before a failed message is tried again. ${NEXT_CLAIM}`}
      />
      <NumberSetting
        {...props}
        field="smsClaimTimeoutMinutes"
        label="Claim timeout"
        unit="minutes"
        help={`A message with no result after this long can be claimed again. ${NEXT_CLAIM}`}
      />
    </Stack>
  );
}

export function SettingsForm({ settings, workerStatus }: SettingsFormProps) {
  const [saved, setSaved] = useState(settings);
  const [values, setValues] = useState(() => toFormValues(settings));
  const { errors, isSubmitting, submit } = useActionSubmit();
  const changes = diffSettings(saved, values);
  const isDirty = Object.keys(changes).length > 0;
  const sectionProps = { values, errors, set: setField };

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  function setField<K extends keyof SettingsFormValues>(field: K, value: SettingsFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(() => updateSettingsAction(changes), {
      onSuccess: (updated) => {
        toaster.create({ type: 'success', title: 'Settings saved' });
        setSaved(updated);
        // Shows what was stored, such as a trimmed template.
        setValues(toFormValues(updated));
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack gap="8" maxW="4xl">
        <GeneralSection {...sectionProps} />
        <ExpirySection {...sectionProps} />
        <SmsSection {...sectionProps} />
        <WorkerSection {...sectionProps} workerStatus={workerStatus} />
        <Flex justify="flex-end">
          <Button type="submit" colorPalette="teal" loading={isSubmitting} disabled={!isDirty}>
            Save changes
          </Button>
        </Flex>
      </Stack>
    </form>
  );
}
