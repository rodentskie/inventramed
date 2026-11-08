'use client';

import { IconButton } from '@chakra-ui/react';
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
  DrawerTrigger,
} from '@inventra-med/components';
import { useState } from 'react';
import { LuMenu } from 'react-icons/lu';
import { SidebarNav } from '@/components/layout/SidebarNav';
import type { NavGroup } from '@/types/dashboard';

interface MobileNavProps {
  groups: NavGroup[];
}

export function MobileNav({ groups }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <DrawerRoot
      placement="start"
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
    >
      <DrawerBackdrop />
      <DrawerTrigger asChild>
        <IconButton
          aria-label="Open navigation"
          variant="outline"
          size="sm"
          display={{ base: 'inline-flex', lg: 'none' }}
        >
          <LuMenu />
        </IconButton>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>InventraMed</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <SidebarNav groups={groups} onNavigate={() => setOpen(false)} />
        </DrawerBody>
        <DrawerCloseTrigger />
      </DrawerContent>
    </DrawerRoot>
  );
}
