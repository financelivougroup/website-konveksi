import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Lock, Layers, ClipboardList, Package, Users, Target, AlertTriangle, BarChart3, Settings, Box, ChevronRight } from 'lucide-react';
import type { ModuleId } from '@/types';
import { navGroups } from '@/data/mockData';

type Renames = Record<string, string>;

interface NavMainProps {
  currentView: string;
  onSwitchView: (view: string) => void;
  renames: Renames;
}

export function NavMain({ currentView, onSwitchView, renames }: NavMainProps) {
  return (
    <>
      {navGroups.map((group) => (
        <SidebarGroup key={group.label}>
          {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
          <SidebarMenu>
            {group.items.map((item) => (
              <NavMenuItem
                key={item.id}
                item={item}
                currentView={currentView}
                onSwitchView={onSwitchView}
                rename={renames[item.id]}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}

interface NavMenuItemProps {
  item: {
    id: ModuleId | string;
    label: string;
    icon: ComponentProps<typeof ChevronRight>['className'];
    dot?: string;
    locked?: boolean;
  };
  currentView: string;
  onSwitchView: (view: string) => void;
  rename?: string;
}

function NavMenuItem({ item, currentView, onSwitchView, rename }: NavMenuItemProps) {
  const isActive = currentView === item.id;
  const displayName = rename || item.label;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={displayName}
        isActive={isActive}
        onClick={() => onSwitchView(item.id)}
      >
        {item.icon && (
          <div className="flex aspect-square size-5 items-center justify-center rounded-md group-data-[collapsible=icon]:size-7">
            {item.icon === 'Layers' && <Layers className="size-4" />}
            {item.icon === 'ClipboardList' && <ClipboardList className="size-4" />}
            {item.icon === 'Package' && <Package className="size-4" />}
            {item.icon === 'Users' && <Users className="size-4" />}
            {item.icon === 'Target' && <Target className="size-4" />}
            {item.icon === 'AlertTriangle' && <AlertTriangle className="size-4" />}
            {item.icon === 'BarChart3' && <BarChart3 className="size-4" />}
            {item.icon === 'Settings' && <Settings className="size-4" />}
            {!item.icon && <Box className="size-4" />}
          </div>
        )}
        <span>{displayName}</span>
        {item.locked && (
          <Badge variant="secondary" className="ml-auto flex gap-1 border-sidebar-border/40 bg-sidebar-accent text-sidebar-accent-foreground">
            <Lock className="h-3 w-3" />
            <span className="sr-only">Locked</span>
          </Badge>
        )}
        {item.dot && !item.locked && (
          <span
            className={cn(
              "ml-auto h-2 w-2 rounded-full",
              item.dot
            )}
            style={{ backgroundColor: item.dot }}
          />
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
