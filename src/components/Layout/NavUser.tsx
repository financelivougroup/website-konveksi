import { useState } from 'react';
import { Loader2, LogOut } from 'lucide-react';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';

/**
 * 'finance' -> 'Finance', 'supervisor' -> 'Supervisor', 'staff' -> 'Staff'.
 *
 * Label TAMPILAN saja. Hak akses tetap ditentukan `canEditProductionLog`,
 * `canEditSalary`, dan policy RLS — bukan oleh teks ini.
 */
function roleLabel(role: string): string {
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : '';
}

/**
 * Blok pengguna di kaki sidebar: nama, peran, dan tombol keluar.
 *
 * Dua perbaikan dari versi sebelumnya:
 *
 * 1. **Nama & peran diambil dari `AuthContext`.** Sebelumnya dibaca dari
 *    `localStorage['app.currentDisplayName']` — kunci yang TIDAK PERNAH ditulis
 *    oleh aplikasi mana pun (terverifikasi: hanya muncul di dokumen rencana lama
 *    dan berkas cadangan), sehingga selalu tampil "User / authenticated" siapa
 *    pun yang login. Identitas aslinya sudah tersedia di context.
 * 2. **Tombol "Log out" benar-benar bekerja.** Sebelumnya ia tidak punya handler
 *    sama sekali — item menu tanpa aksi, jadi tidak mungkin keluar dari aplikasi.
 *
 * `AuthGate` mendengarkan `onAuthStateChange`, jadi begitu sesi berakhir halaman
 * login muncul sendiri; komponen ini ikut terlepas saat itu terjadi.
 */
export function NavUser() {
  const { profile, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const displayName = profile.displayName || 'User';

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      // Tidak ada yang perlu direset saat berhasil: AuthGate melepas seluruh
      // pohon aplikasi (termasuk komponen ini) begitu sesi berakhir.
    } catch {
      // Gagal keluar (mis. jaringan putus): tombol dinyalakan lagi supaya bisa
      // dicoba ulang. Tidak memakai toast karena `useToast` hidup di App.tsx,
      // di luar subtree sidebar ini.
      setSigningOut(false);
    }
  }

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
                  {roleLabel(profile.role)}
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
            <DropdownMenuItem
              className="text-sm text-rose-600 hover:text-rose-700"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
            >
              {signingOut ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Keluar…
                </>
              ) : (
                <>
                  <LogOut className="h-3.5 w-3.5" />
                  Log out
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </div>
  );
}
