import { useState } from 'react';
import { PillTabs, type PillTabItem } from '@/components/Production/PillTabs';
import { KaryawanTab } from '@/components/Contact/KaryawanTab';
import { ClientTab } from '@/components/Contact/ClientTab';
import { VendorTab } from '@/components/Contact/VendorTab';

/** Tab di halaman Contact. ID-nya memakai id modul lama supaya rujukan yang
 *  sudah ada (mis. `register-client` di App.tsx) tidak perlu berubah. */
type ContactTabId = 'register-penjahit' | 'register-client' | 'vendor';

const TABS: PillTabItem<ContactTabId>[] = [
  { id: 'register-penjahit', label: 'Karyawan' },
  { id: 'register-client', label: 'Client' },
  { id: 'vendor', label: 'Vendor' },
];

/**
 * Contact — satu menu untuk tiga master data: Karyawan, Client, Vendor.
 *
 * Sebelumnya ketiganya berdiri sebagai tiga menu sidebar terpisah. Yang
 * digabung adalah **cara menjangkaunya**, bukan isinya: tiap tab tetap
 * komponen tersendiri dengan state, pemuatan data, dan dialognya sendiri —
 * sehingga tombol Refresh/Tambah milik tiap tab mengurus datanya masing-masing,
 * dan berpindah tab tidak memuat ulang data tab lain.
 *
 * Tabnya memakai `PillTabs` yang sudah ada (pola halaman Production Order),
 * bukan komponen baru.
 *
 * `<main>` ada DI SINI, bukan di dalam tab: dua `<main>` bersarang tidak sah,
 * dan tinggi penuh milik halaman, bukan milik satu tab.
 */
export function ContactPage() {
  const [activeTab, setActiveTab] = useState<ContactTabId>('register-penjahit');

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="px-6 pt-3 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Contact</h1>
          </div>
        </div>
        <PillTabs
          items={TABS}
          active={activeTab}
          aria-label="Pilih master data Contact"
          onChange={setActiveTab}
        />
      </div>

      {/* Isi tab mengisi sisa tinggi; tiap tab menggulir sendiri di dalamnya. */}
      <div className="flex-1 flex flex-col min-h-0">
        {activeTab === 'register-penjahit' && <KaryawanTab />}
        {activeTab === 'register-client' && <ClientTab />}
        {activeTab === 'vendor' && <VendorTab />}
      </div>
    </main>
  );
}

export default ContactPage;
