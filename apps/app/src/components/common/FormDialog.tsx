'use client';

import { Button, Stack } from '@chakra-ui/react';
import {
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '@inventra-med/components';
import type { FormEvent, ReactNode } from 'react';

interface FormDialogProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  submitLabel: string;
  isSubmitting: boolean;
  submitDisabled?: boolean;
  /** `red` for destructive actions. */
  colorPalette?: 'teal' | 'red';
  children: ReactNode;
}

/** A dialog with a form body and Cancel / submit buttons, shared by every form here. */
export function FormDialog({
  title,
  open,
  onOpenChange,
  onSubmit,
  submitLabel,
  isSubmitting,
  submitDisabled = false,
  colorPalette = 'teal',
  children,
}: FormDialogProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitDisabled && !isSubmitting) {
      onSubmit();
    }
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
      placement="center"
      size={{ base: 'full', sm: 'md' }}
      closeOnInteractOutside={!isSubmitting}
      // Unmounting on close turns off any camera opened inside the form.
      lazyMount
      unmountOnExit
    >
      <DialogContent>
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Stack gap="4">{children}</Stack>
          </DialogBody>
          <DialogFooter>
            <DialogActionTrigger asChild>
              <Button variant="outline" disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogActionTrigger>
            <Button
              type="submit"
              colorPalette={colorPalette}
              loading={isSubmitting}
              disabled={submitDisabled}
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
        <DialogCloseTrigger disabled={isSubmitting} />
      </DialogContent>
    </DialogRoot>
  );
}
