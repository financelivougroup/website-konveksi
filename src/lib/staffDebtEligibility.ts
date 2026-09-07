interface DebtCandidate {
  nama: string;
  utang: number;
}

export interface DebtSourceRow {
  nama: string;
  target_cost_posisi: number;
  /** Hasil komputasi live — BUKAN kolom DB `realisasi_cost_posisi`,
   *  karena kolom tersebut tidak pernah ditulis dan selalu 0. */
  realisasiCostPosisi: number;
}

export interface DebtRowResult {
  nama: string;
  totalTargetCost: number;
  totalRealisasiCost: number;
  utang: number;
}

/**
 * Hitung utang kumulatif per staf dari baris Target yang sudah di-enrich.
 *
 * Sumber harganya sama dengan Sisa Uang: `target cost - realisasi cost`.
 * Tidak ada pengurangan potongan complain sesuai keputusan produk.
 */
export function computeDebtFromRows(rows: DebtSourceRow[]): DebtRowResult[] {
  const byStaff = new Map<string, { targetCost: number; realisasiCost: number }>();

  for (const row of rows) {
    const acc = byStaff.get(row.nama) ?? { targetCost: 0, realisasiCost: 0 };
    acc.targetCost += Number(row.target_cost_posisi) || 0;
    acc.realisasiCost += Number(row.realisasiCostPosisi) || 0;
    byStaff.set(row.nama, acc);
  }

  return Array.from(byStaff, ([nama, acc]) => ({
    nama,
    totalTargetCost: acc.targetCost,
    totalRealisasiCost: acc.realisasiCost,
    utang: Math.max(0, Math.round(acc.targetCost - acc.realisasiCost)),
  }));
}

interface AccumSnapshot {
  nama: string;
  bulan_tahun: string;
  selisihCostAccum: number;
}

export function filterDebtRowsByLatestAccum<T extends DebtCandidate>(
  debtRows: T[],
  targets: AccumSnapshot[],
): T[] {
  const latestByStaff = new Map<string, AccumSnapshot>();

  for (const target of targets) {
    const latest = latestByStaff.get(target.nama);
    if (!latest || target.bulan_tahun > latest.bulan_tahun) {
      latestByStaff.set(target.nama, target);
    }
  }

  return debtRows.filter((row) => {
    const latest = latestByStaff.get(row.nama);
    return row.utang > 0 && latest != null && latest.selisihCostAccum < 0;
  });
}
