import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase';

export function NavUser() {
  const loadUserInfo = () => {
    const displayName = localStorage.getItem('app.currentDisplayName') || 'User';
    return {
      user: supabase.auth.getUser(),
      displayName,
      profile: { role: 'authenticated' as const },
    };
  };

  const { displayName } = loadUserInfo();

  return (
    <div className="flex flex-col gap-2 p-2 border-t border-sidebar-border">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-slate-100 text-slate-600">
                  {displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {displayName}
                </span>
                <span className="truncate text-xs text-slate-400">
                  authenticated
                </span>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side="bottom"
            align="end"
            sideOffset={4}
          >
            <DropdownMenuItem className="text-sm">
              Account settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-sm text-rose-600 hover:text-rose-700">
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </div>
  );
}
