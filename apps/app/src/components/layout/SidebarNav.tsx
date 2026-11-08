'use client';

import { Box, Flex, Link, Separator, Stack, Text } from '@chakra-ui/react';
import { Tag } from '@inventra-med/components';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import type { IconType } from 'react-icons';
import {
  LuArrowLeftRight,
  LuKeyRound,
  LuLayoutDashboard,
  LuPill,
  LuScanBarcode,
  LuScrollText,
  LuSettings,
  LuUsers,
} from 'react-icons/lu';
import { isNavItemActive } from '@/lib/navigation';
import type { NavGroup, NavIcon, NavItem } from '@/types/dashboard';

/** Icons are mapped here because components can't be passed from the server. */
const ICONS: Record<NavIcon, IconType> = {
  dashboard: LuLayoutDashboard,
  medicines: LuPill,
  transactions: LuArrowLeftRight,
  scan: LuScanBarcode,
  employees: LuUsers,
  users: LuKeyRound,
  settings: LuSettings,
  'audit-logs': LuScrollText,
};

interface SidebarNavProps {
  groups: NavGroup[];
  /** Called after a link is chosen, so the drawer can close. */
  onNavigate?: () => void;
}

interface NavEntryProps {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}

function NavEntry({ item, active, onNavigate }: NavEntryProps) {
  const Icon = ICONS[item.icon];
  const content = (
    <>
      <Icon aria-hidden />
      <Text as="span" flex="1">
        {item.label}
      </Text>
      {!item.enabled && (
        <Tag size="sm" variant="outline" color="fg.subtle">
          Soon
        </Tag>
      )}
    </>
  );
  const styles = {
    display: 'flex',
    alignItems: 'center',
    gap: '3',
    px: '3',
    py: '1.5',
    rounded: 'md',
    textStyle: 'sm',
  } as const;

  if (!item.enabled) {
    return (
      <Flex {...styles} aria-disabled="true" color="fg.subtle" cursor="default">
        {content}
      </Flex>
    );
  }

  return (
    <Link
      asChild
      {...styles}
      position="relative"
      color="fg"
      textDecoration="none"
      bg={active ? 'bg.muted' : undefined}
      fontWeight={active ? 'semibold' : undefined}
      _hover={{ bg: 'bg.muted', textDecoration: 'none' }}
      _before={
        active
          ? {
              content: '""',
              position: 'absolute',
              left: '-2',
              top: '1.5',
              bottom: '1.5',
              width: '1',
              rounded: 'full',
              bg: 'teal.solid',
            }
          : undefined
      }
    >
      <NextLink
        href={item.href}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
      >
        {content}
      </NextLink>
    </Link>
  );
}

export function SidebarNav({ groups, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <Stack as="nav" aria-label="Main" gap="3" pl="2">
      {groups.map((group, index) => (
        <Stack key={group.label ?? 'main'} gap="1">
          {index > 0 && <Separator mb="2" />}
          {group.label && (
            <Text px="3" py="1" textStyle="xs" fontWeight="semibold" color="fg.muted">
              {group.label}
            </Text>
          )}
          <Box as="ul" listStyleType="none">
            {group.items.map((item) => (
              <Box as="li" key={item.href}>
                <NavEntry
                  item={item}
                  active={isNavItemActive(item.href, pathname)}
                  onNavigate={onNavigate}
                />
              </Box>
            ))}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}
