interface DebtCandidate {
  nama: string;
  utang: number;
}

interface AccumSnapshot {
  nama: string;
  bulan_tahun: string;
  selisihAccum: number;
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
    return row.utang > 0 && latest != null && latest.selisihAccum < 0;
  });
}
