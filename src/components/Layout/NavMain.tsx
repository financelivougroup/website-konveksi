import type { ComponentProps } from 'react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Lock, Layers, ClipboardList, Package, Users, Building2, Target, AlertTriangle, BarChart3, Settings, Box, ChevronRight, DollarSign, Scissors, CircleDot, Sparkles, PackageSearch, BarChart, Tags, Receipt, Store, Contact } from 'lucide-react';
import type { ModuleId } from '@/types';
import { navGroups } from '@/data/mockData';

type Renames = Record<string, string>;

interface NavMainProps {
  currentView: string;
  onSwitchView: (view: string) => void;
  renames: Renames;
}

/**
 * Label grup yang dipakai sebagai wadah lipat, bukan sebagai judul statis.
 *
 * Grup Reports berisi halaman-halaman yang jarang dibuka bersamaan, jadi
 * daftarnya disembunyikan di balik satu item "Report" agar sidebar tidak
 * memanjang ke bawah. Nilai ini adalah kunci teknis di `navGroups`, sekaligus
 * label yang ditampilkan dan disimpan sebagai penanda preferensi buka/tutup.
 */
const COLLAPSIBLE_GROUP = 'Reports';

export function NavMain({ currentView, onSwitchView, renames }: NavMainProps) {
  // Preferensi buka/tutup per grup. Default tertutup supaya daftarnya tidak
  // langsung memanjang — tetapi begitu user membukanya, pilihannya bertahan
  // selama sesi, termasuk saat berpindah halaman lewat item di dalamnya.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  return (
    <>
      {navGroups.map((group) => {
        const subItems = group.items;

        if (group.label === COLLAPSIBLE_GROUP) {
          const open = openGroups[group.label] ?? false;
          // Grup dianggap aktif bila halaman yang sedang dibuka ada di dalamnya,
          // supaya sub-item yang aktif tetap tersorot dan tidak "hilang".
          const containsCurrent = subItems.some((item) => item.id === currentView);

          return (
            <SidebarGroup key={group.label || 'collapsible'}>
              <SidebarMenu>
                <Collapsible
                  asChild
                  open={open}
                  onOpenChange={(next) => setOpenGroups((prev) => ({ ...prev, [group.label]: next }))}
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={group.label}
                        isActive={containsCurrent}
                        aria-expanded={open}
                      >
                        <div className="flex aspect-square size-5 items-center justify-center rounded-md group-data-[collapsible=icon]:size-7">
                          <BarChart className="size-4" />
                        </div>
                        <span>{group.label}</span>
                        <ChevronRight
                          className={cn('ml-auto size-4 transition-transform duration-200', open && 'rotate-90')}
                        />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="group-data-[collapsible=icon]:hidden">
                      <SidebarMenuSub>
                        {subItems.map((item) => (
                          <SidebarMenuSubItem key={item.id}>
                            {/* asChild + <button>: SidebarMenuSubButton merender
                                <a> tanpa href, yang tidak bisa dijangkau keyboard.
                                Item sidebar lain di app ini juga <button>. */}
                            <SidebarMenuSubButton
                              asChild
                              isActive={currentView === item.id}
                            >
                              <button type="button" onClick={() => onSwitchView(item.id)}>
                                <span>{renames[item.id] || item.label}</span>
                              </button>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
            </SidebarGroup>
          );
        }

        return (
          <SidebarGroup key={group.label}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {subItems.map((item) => (
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
        );
      })}
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
            {item.icon === 'Building2' && <Building2 className="size-4" />}
            {item.icon === 'DollarSign' && <DollarSign className="size-4" />}
            {item.icon === 'Target' && <Target className="size-4" />}
            {item.icon === 'AlertTriangle' && <AlertTriangle className="size-4" />}
            {item.icon === 'BarChart3' && <BarChart3 className="size-4" />}
            {item.icon === 'Settings' && <Settings className="size-4" />}
            {item.icon === 'Scissors' && <Scissors className="size-4" />}
            {item.icon === 'CircleDot' && <CircleDot className="size-4" />}
            {item.icon === 'Sparkles' && <Sparkles className="size-4" />}
            {item.icon === 'PackageSearch' && <PackageSearch className="size-4" />}
            {item.icon === 'Tags' && <Tags className="size-4" />}
            {item.icon === 'Receipt' && <Receipt className="size-4" />}
            {item.icon === 'Store' && <Store className="size-4" />}
            {item.icon === 'Contact' && <Contact className="size-4" />}
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
