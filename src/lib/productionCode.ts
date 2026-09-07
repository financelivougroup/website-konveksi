// Kunci harga per Product Note dan tipe peta harganya.
// Sengaja dipisah dari `src/services/staffDebt.ts`: modul itu mengimpor
// Supabase, sehingga mengimpornya dari `src/lib/` akan menarik klien Supabase
// ke dalam helper murni dan merusak pengujian yang tidak punya `import.meta.env`
// (hanya tersedia di bawah Vite).

export interface PriceMapValue {
  jahit: number
  obras: number
}

export type PriceMap = Record<string, PriceMapValue>

export function productionCodePriceKey(productNote: string | null | undefined): string {
  return productNote?.trim().toLocaleLowerCase('id-ID') ?? ''
}
