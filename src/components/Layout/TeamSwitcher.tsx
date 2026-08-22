import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { ChevronsLeftRight } from 'lucide-react';

interface TeamSwitcherProps {
  isCollapsed: boolean;
}

export function TeamSwitcher({ isCollapsed }: TeamSwitcherProps) {
  const team = {
    name: 'Konveksi Pro',
    logo: ChevronsLeftRight,
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton size="lg" asChild>
        <a href="#" className="data-[state=open]:bg-sidebar-accent">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <team.logo className="size-4" />
          </div>
          {!isCollapsed && (
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">
                {team.name}
              </span>
              <span className="truncate text-xs text-slate-400">
                Production Monitoring
              </span>
            </div>
          )}
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
