import { cn } from '@/lib/utils';

// ===== Data table design system (formal/enterprise) =====
// Zebra rows #FFFFFF/#F9FAFB, hover #F0F1F3, selected #EFF6FF.
// Horizontal dividers only (1px #E5E7EB rows, 2px #D1D5DB header underline).
// Sticky white header.
//
// Warna netral memakai token semantik ReUI (`bg-card`, `border-border`, `text-muted-foreground`)
// alih-alih hex mentah, supaya shading tabel mengikuti tema dan otomatis benar
// saat token tema berubah. Nilai HSL tokennya setara dengan hex lama, jadi
// tampilannya tidak bergeser.
export const T_WRAP = 'bg-card border border-border rounded-lg overflow-auto max-h-[calc(100vh-250px)]';
export const T_TABLE = 'w-full text-[13px] leading-[1.45] border-collapse';
export const T_HEAD_ROW = 'bg-card border-b-2 border-[#D1D5DB] dark:border-border sticky top-0 z-10';
// Softer semibold headers; preserve size/spacing and readable dark-mode text.
export const T_TH = 'py-2.5 px-4 text-[12px] font-semibold text-slate-700 dark:text-foreground whitespace-nowrap';
export const T_TD = 'py-1.5 px-3 align-middle';

/**
 * Checkbox baris tabel.
 *
 * Sebelumnya kelas ini ditulis ulang di 7 berkas dengan warna mentah
 * (`border-gray-300 text-blue-600 focus:ring-blue-500` — cincin fokusnya
 * dinetralkan menjadi `focus:ring-slate-500` pada 2026-09-22). Disatukan di sini dan
 * memakai token semantik ReUI agar ikut tema, tanpa mengubah elemennya dari
 * `<input>` — beberapa tabel membaca nilai form lewat DOM, jadi mengganti ke
 * komponen berbasis `<button>` akan memutus jalur simpan itu.
 */
export const T_CHECKBOX =
  'w-4 h-4 rounded align-middle border-input text-primary focus:ring-ring/40 focus:ring-2 focus:ring-offset-0';

// Baris kedua di dalam satu sel (mis. work code di bawah nama produk).
// Sengaja satu token bersama: sebelumnya tiap tabel menulis sendiri
// text-[11px] text-gray-400, jadi ukurannya berbeda-beda antar tab.
export const T_SUB_LABEL = 'text-[11px] text-muted-foreground';

/**
 * Tipografi untuk **Kode Produksi Konveksi** (`product_note`) dan **Kode
 * Produksi Client** — dua kode yang selalu ditampilkan berpasangan.
 *
 * Permintaan user (verbatim): *"Kode produksi dan Kode produksi client font
 * angkanya disamain yah, 0 yang normal aja gt"*.
 *
 * Sebelumnya keduanya memakai `font-mono`, yang di Windows jatuh ke **Consolas**
 * — font itu menggambar nol dengan garis miring (slashed zero) sehingga `0`
 * terbaca seperti huruf Ø/φ dan sulit dibedakan dari `O` pada kode yang penuh
 * angka seperti `PDFF_LVU-PNT-02_B-00_PRDN`.
 *
 * Solusinya bukan memilih font mono lain: Cascadia Mono memakai nol bertitik,
 * dan font mono lain di sistem belum tentu ada. Cocok-lebar karakternya juga
 * tidak dibutuhkan di sini (kode tidak disejajarkan per kolom). Jadi kode ikut
 * font aplikasi (Inter, via pewarisan) yang nol-nya lonjong biasa, dan
 * `tabular-nums` menjaga lebar angka tetap seragam supaya kode tidak "bergoyang"
 * saat kolom dirender ulang.
 */
export const T_CODE = 'tabular-nums';

// ===== Toolbar buttons (Filter/Sort/Kolom/Export dll.) =====
// Efek hover sama dengan tab bar Production Monitoring: lift + shadow biru.
export const T_TOOLBAR_BTN = 'h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 transition-all duration-200 ease-out';
export const T_TOOLBAR_BTN_IDLE = 'border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 hover:-translate-y-px hover:shadow-md hover:shadow-primary/15';
export const T_TOOLBAR_BTN_ACTIVE = 'bg-primary text-primary-foreground font-medium border border-primary hover:bg-primary/90 hover:-translate-y-px hover:shadow-md hover:shadow-primary/30';

// ===== Badge/label status (soft) =====
//
// Satu pola untuk SEMUA label status di tabel: latar sangat muda + teks sewarna
// yang lebih tua + garis tepi tipis. Sebelumnya tiap berkas menulis badge-nya
// sendiri sebagai pill SOLID (`bg-emerald-600` + teks putih) sehingga tampak
// berat dan berbeda-beda antar halaman; kini disatukan di sini.
//
// Referensinya badge "Main Category" di ExpensePage (`border-slate-200 bg-slate-50
// text-blue-700`) — gaya yang sama juga sudah dipakai OrderEntry.tsx dan
// ConditionalColorModal.tsx.
//
// Warna memakai kelas Tailwind mentah, BUKAN token tema: `--info` di tema ini
// bernilai `258 90% 66%` (violet), bukan biru, dan proyek tidak punya token biru
// sama sekali — badge biru akan tampak kelabu bila memakai token. Ini alasan yang
// sama dengan yang sudah ditulis di ExpensePage.
//
// `T_SOFT_BADGE_*` dipisah per warna, bukan satu map, supaya bisa dipakai
// langsung sebagai `Record` per halaman tanpa memaksa tiap halaman memakai
// seluruh warnanya.
//
// Paddingnya `py-0.5` + `leading-none`, bukan `py-1` dengan line-height bawaan.
// Alasannya tinggi baris: baris tabel setinggi ISI SEL TERTINGGI, jadi badge
// yang lebih gemuk membuat barisnya ikut naik. Dengan `py-1` badge setinggi
// 26px dan barisnya jadi 38.5px; dengan `py-0.5 leading-none` badge setinggi
// 17px dan barisnya 31.5px — sama persis dengan baris teks polos di Register
// Harga, tabel acuan user. Badge yang lebih tebal tidak sebanding dengan
// tabel yang tinggi barisnya berbeda-beda antar halaman.
export const T_SOFT_BADGE =
  'inline-block px-2.5 py-0.5 rounded-md border text-[11px] font-medium leading-none whitespace-nowrap';

/**
 * Tombol ikon di dalam baris tabel.
 *
 * Ukurannya dikunci 19px — bukan 32px (`w-8 h-8`) seperti sebelumnya — karena
 * baris tabel setinggi isi sel tertinggi: 19px + padding sel (`py-1.5` = 6px
 * atas + 6px bawah) = 31.5px, sama persis dengan baris teks polos di Register
 * Harga. Tombol 32px mendorong barisnya ke 44px, dan itulah yang membuat
 * tabel-tabel lain tampak "beda sendiri" dari tabel acuan.
 *
 * Ikon di dalamnya memakai `w-3.5 h-3.5` (14px) agar proporsional.
 */
export const T_ROW_BTN =
  'w-[19px] h-[19px] rounded-md flex items-center justify-center transition-colors';

export const T_SOFT_BADGE_TONE: Record<string, string> = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300',
  amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300',
  rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300',
  red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300',
  blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-300',
  violet: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300',
  slate: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-border dark:bg-muted dark:text-muted-foreground',
};

/**
 * Kelas lengkap satu badge status soft.
 *
 * `tone` yang tidak dikenal jatuh ke netral (slate) — sama seperti badge lama
 * yang jatuh ke `bg-gray-500` — supaya nilai tak terduga tetap tampil sebagai
 * badge yang terbaca, bukan tanpa gaya sama sekali.
 */
export function softBadgeClass(tone: string): string {
  return cn(T_SOFT_BADGE, T_SOFT_BADGE_TONE[tone] ?? T_SOFT_BADGE_TONE.slate);
}

export function rowClass(i: number, selected?: boolean) {
  if (selected) return 'bg-[#EFF6FF] hover:bg-[#E4EDFB] border-b border-[#E5E7EB] dark:bg-accent dark:hover:bg-accent/80 dark:border-border transition-colors';
  return cn(
    'border-b border-[#E5E7EB] hover:bg-[#F0F1F3] dark:border-border dark:hover:bg-muted transition-colors',
    i % 2 === 1 ? 'bg-[#F9FAFB] dark:bg-muted/30' : 'bg-card',
  );
}
