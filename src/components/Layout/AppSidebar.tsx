import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';
import { TeamSwitcher } from './TeamSwitcher';
import { NavMain } from './NavMain';
import { NavUser } from './NavUser';
import type { ModuleId } from '@/types';

interface AppSidebarProps {
  currentView: ModuleId;
  onSwitchView: (view: string) => void;
  renames?: Record<string, string>;
}

export function AppSidebar({
  currentView,
  onSwitchView,
  renames = {},
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader>
        <TeamSwitcher isCollapsed={false} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          currentView={currentView}
          onSwitchView={onSwitchView}
          renames={renames}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
