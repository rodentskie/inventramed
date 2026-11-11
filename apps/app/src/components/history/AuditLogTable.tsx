'use client';

import { IconButton, Link, Table } from '@chakra-ui/react';
import { EmptyState } from '@inventra-med/components';
import NextLink from 'next/link';
import { useState } from 'react';
import { LuChevronDown, LuChevronRight, LuScrollText, LuSearchX } from 'react-icons/lu';
import { ChangeList } from '@/components/history/ChangeList';
import { AUDIT_ENTITY_LABELS, describeAuditRecord, diffSnapshots } from '@/lib/audit-diff';
import { formatLocalDateTime } from '@/lib/format';
import type { AuditLog } from '@/types/audit-log';

interface AuditLogTableProps {
  items: AuditLog[];
  /** `settings.timezone`, so times are local. */
  timezone: string;
  /** Entity types whose record link the user may open, from their permissions. */
  linkableTypes: string[];
  /** Any filter is set, which changes the empty state. */
  filtered: boolean;
}

const COLUMN_COUNT = 6;

interface AuditRowProps {
  item: AuditLog;
  timezone: string;
  linkable: boolean;
}

function RecordCell({ item, linkable }: { item: AuditLog; linkable: boolean }) {
  const { label, href } = describeAuditRecord(item);
  if (!href || !linkable) {
    return label;
  }
  return (
    <Link asChild color="fg" textDecoration="underline" textUnderlineOffset="3px">
      <NextLink href={href}>{label}</NextLink>
    </Link>
  );
}

function AuditRow({ item, timezone, linkable }: AuditRowProps) {
  const [open, setOpen] = useState(false);
  const before = item.changes?.before ?? null;
  const after = item.changes?.after ?? null;
  const detailsId = `audit-${item.id}`;

  return (
    <>
      <Table.Row>
        <Table.Cell whiteSpace="nowrap">
          <time dateTime={item.createdAt}>{formatLocalDateTime(item.createdAt, timezone)}</time>
        </Table.Cell>
        <Table.Cell>{item.action}</Table.Cell>
        <Table.Cell whiteSpace="nowrap">
          {AUDIT_ENTITY_LABELS[item.entityType] ?? item.entityType}
        </Table.Cell>
        <Table.Cell>
          <RecordCell item={item} linkable={linkable} />
        </Table.Cell>
        <Table.Cell>{item.actor?.username ?? 'system'}</Table.Cell>
        <Table.Cell textAlign="end" width="1">
          <IconButton
            aria-label={open ? 'Hide changes' : 'Show changes'}
            aria-expanded={open}
            aria-controls={detailsId}
            variant="ghost"
            size="xs"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <LuChevronDown /> : <LuChevronRight />}
          </IconButton>
        </Table.Cell>
      </Table.Row>
      {open && (
        <Table.Row id={detailsId} bg="bg.subtle">
          <Table.Cell colSpan={COLUMN_COUNT} py="3">
            <ChangeList
              changes={diffSnapshots(before, after)}
              mode={item.action === 'updated' ? 'diff' : 'snapshot'}
            />
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
}

export function AuditLogTable({ items, timezone, linkableTypes, filtered }: AuditLogTableProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        borderWidth="1px"
        borderColor="border"
        rounded="md"
        icon={filtered ? <LuSearchX /> : <LuScrollText />}
        title="No audit entries"
        description={filtered ? 'No audit entries match these filters.' : undefined}
      />
    );
  }

  return (
    <Table.ScrollArea borderWidth="1px" borderColor="border" rounded="md">
      <Table.Root size="sm" minW="3xl">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>When</Table.ColumnHeader>
            <Table.ColumnHeader>Action</Table.ColumnHeader>
            <Table.ColumnHeader>Type</Table.ColumnHeader>
            <Table.ColumnHeader>Record</Table.ColumnHeader>
            <Table.ColumnHeader>By</Table.ColumnHeader>
            <Table.ColumnHeader>
              <span hidden>Changes</span>
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.map((item) => (
            <AuditRow
              key={item.id}
              item={item}
              timezone={timezone}
              linkable={linkableTypes.includes(item.entityType)}
            />
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}
