export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Konversi daftar string menjadi opsi — bentuk yang dipakai sebagian besar
 * dropdown di aplikasi ini (`penjahitList`, `bulanList`, dst).
 *
 * Dipisah dari `AppSelect.tsx` agar berkas komponen hanya mengekspor komponen
 * (syarat fast-refresh pada aturan `react-refresh/only-export-components`).
 */
export function toOptions(values: readonly string[]): SelectOption[] {
  return values.map((value) => ({ value, label: value }));
}
