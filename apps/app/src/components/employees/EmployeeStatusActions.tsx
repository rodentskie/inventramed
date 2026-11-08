'use client';

import { Button, Flex, Text } from '@chakra-ui/react';
import { toaster } from '@inventra-med/components';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { LuTrash2, LuUserCheck, LuUserX } from 'react-icons/lu';
import { deleteEmployeeAction, setEmployeeActiveAction } from '@/actions/employees';
import { FormDialog } from '@/components/common/FormDialog';
import { SELF_CHANGE_HINT } from '@/components/employees/EmployeeForm';
import { EmployeeStatusTag } from '@/components/employees/EmployeeStatusTag';
import { useActionSubmit } from '@/hooks/use-action-submit';
import { formatEmployeeName } from '@/lib/format';
import type { ActionResult } from '@/types/action';
import type { EmployeeWithUser } from '@/types/employee';

interface ConfirmActionProps<T> {
  label: string;
  title: string;
  icon: ReactNode;
  message: string;
  colorPalette: 'teal' | 'red';
  disabled: boolean;
  run: () => Promise<ActionResult<T>>;
  onSuccess: () => void;
}

function ConfirmAction<T>({
  label,
  title,
  icon,
  message,
  colorPalette,
  disabled,
  run,
  onSuccess,
}: ConfirmActionProps<T>) {
  const [open, setOpen] = useState(false);
  const { isSubmitting, submit } = useActionSubmit();

  function handleSubmit() {
    void submit(run, {
      onSuccess: () => {
        setOpen(false);
        onSuccess();
      },
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        colorPalette={colorPalette === 'red' ? 'red' : undefined}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {icon}
        {label}
      </Button>
      <FormDialog
        title={title}
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
        submitLabel={label}
        colorPalette={colorPalette}
        isSubmitting={isSubmitting}
      >
        <Text>{message}</Text>
      </FormDialog>
    </>
  );
}

interface EmployeeStatusActionsProps {
  employee: EmployeeWithUser;
  /** The record belongs to the signed-in user. The server enforces this too. */
  isSelf: boolean;
}

/** The status, then Deactivate or Activate and Delete, each with a confirmation. */
export function EmployeeStatusActions({ employee, isSelf }: EmployeeStatusActionsProps) {
  const router = useRouter();
  const name = formatEmployeeName(employee);

  return (
    <Flex align="center" gap="2" wrap="wrap">
      <EmployeeStatusTag isActive={employee.isActive} />
      {isSelf && (
        <Text textStyle="sm" color="fg.muted">
          {SELF_CHANGE_HINT}
        </Text>
      )}
      {employee.isActive ? (
        <ConfirmAction
          label="Deactivate"
          title={`Deactivate ${name}?`}
          icon={<LuUserX />}
          message={`${name} won't be able to sign in, and their pending SMS alerts are cancelled.`}
          colorPalette="red"
          disabled={isSelf}
          run={() => setEmployeeActiveAction(employee.id, false)}
          onSuccess={() => toaster.create({ type: 'success', title: 'Employee deactivated' })}
        />
      ) : (
        <ConfirmAction
          label="Activate"
          title={`Activate ${name}?`}
          icon={<LuUserCheck />}
          message={`${name} will be able to sign in again.`}
          colorPalette="teal"
          disabled={isSelf}
          run={() => setEmployeeActiveAction(employee.id, true)}
          onSuccess={() => toaster.create({ type: 'success', title: 'Employee activated' })}
        />
      )}
      <ConfirmAction
        label="Delete"
        title={`Delete ${name}?`}
        icon={<LuTrash2 />}
        message="This can't be undone. Their email and username stay reserved."
        colorPalette="red"
        disabled={isSelf}
        run={() => deleteEmployeeAction(employee.id)}
        onSuccess={() => {
          toaster.create({ type: 'success', title: 'Employee deleted' });
          router.replace('/employees');
        }}
      />
    </Flex>
  );
}
