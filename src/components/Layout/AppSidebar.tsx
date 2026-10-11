import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
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
  // Keadaan sidebar dibaca dari context supaya TeamSwitcher benar-benar
  // menyembunyikan teksnya saat mengecil — bukan sekadar terpotong
  // `overflow-hidden` milik SidebarMenuButton.
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  return (
    <Sidebar collapsible="icon" className="border-r">
      {/* Tombol kecilkan/perbesar sidebar ditaruh DI HEADER SIDEBAR, bukan
          mengandalkan `SidebarRail` saja.

          Kenapa: tombol ini dulu ada di bilah breadcrumb atas, dan bilah itu
          dihapus 2026-09-29 (lihat App.tsx). Sejak itu satu-satunya cara
          mengecilkan sidebar di desktop tinggal `SidebarRail` — strip 16px di
          tepi kanan sidebar yang baru memunculkan garis 2px saat di-hover,
          sehingga user merasa tombolnya "hilang". Tombol ini selalu terlihat.

          Susunannya menyesuaikan keadaan sidebar:
          - melebar  → sebaris: logo+nama di kiri, tombol di kanan.
          - mengecil → bertumpuk: ikon logo di atas, tombol di bawahnya
                       (lebar 3rem tidak cukup untuk sebaris). */}
      <SidebarHeader>
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none">
            <TeamSwitcher isCollapsed={isCollapsed} />
          </div>
          <SidebarTrigger
            title="Kecilkan / perbesar sidebar"
            className="shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground"
          />
        </div>
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
      {/* Rail dipertahankan: ia memberi affordance kedua (hover di tepi) dan
          juga yang dipakai di mobile, jadi tidak diganti, hanya dilengkapi. */}
      <SidebarRail />
    </Sidebar>
  );
}
