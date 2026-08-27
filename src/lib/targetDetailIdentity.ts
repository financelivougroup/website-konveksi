export interface WorkOrderDesignIdentity {
  productNote: string | null;
  product: string;
  warna: string | null;
}

export interface PlannedTargetDetailInput extends WorkOrderDesignIdentity {
  qty: number;
}

export interface GroupedTargetDetail extends PlannedTargetDetailInput {}

export interface TargetDetailIdentityInput extends WorkOrderDesignIdentity {
  qtyTarget: number;
  hargaJahit: number;
  hargaObras: number;
}

export interface SewingIdentityInput {
  workOrderId: string;
  picPenjahit: string;
  qtySelesai: number;
  tanggalLaporan: string;
}

export interface DetailRealization {
  qtyRealisasi: number;
  nilai: number;
}

export function designIdentityKey(identity: WorkOrderDesignIdentity): string {
  return JSON.stringify([
    identity.productNote ?? '',
    identity.product,
    identity.warna ?? '',
  ]);
}

export function groupPlannedTargetDetails(
  rows: PlannedTargetDetailInput[],
): GroupedTargetDetail[] {
  const grouped = new Map<string, GroupedTargetDetail>();
  for (const row of rows) {
    const key = designIdentityKey(row);
    const existing = grouped.get(key);
    if (existing) existing.qty += row.qty;
    else grouped.set(key, { ...row });
  }
  return Array.from(grouped.values());
}

export function calculateDetailRealizations(
  details: TargetDetailIdentityInput[],
  sewing: SewingIdentityInput[],
  person: string,
  ym: string,
  workOrders: Map<string, WorkOrderDesignIdentity>,
): DetailRealization[] {
  const preciseDetailKeys = new Set<string>();
  const legacyProducts = new Set<string>();

  for (const detail of details) {
    if (detail.productNote != null && detail.productNote !== '') {
      preciseDetailKeys.add(designIdentityKey(detail));
    } else {
      legacyProducts.add(detail.product);
    }
  }

  const qtyByPreciseKey = new Map<string, number>();
  const qtyByLegacyProduct = new Map<string, number>();

  for (const record of sewing) {
    if (record.picPenjahit !== person) continue;
    if (!record.tanggalLaporan.startsWith(ym)) continue;

    const workOrder = workOrders.get(record.workOrderId);
    if (!workOrder) continue;

    const preciseKey = designIdentityKey(workOrder);
    if (preciseDetailKeys.has(preciseKey)) {
      qtyByPreciseKey.set(
        preciseKey,
        (qtyByPreciseKey.get(preciseKey) ?? 0) + record.qtySelesai,
      );
    } else if (legacyProducts.has(workOrder.product)) {
      qtyByLegacyProduct.set(
        workOrder.product,
        (qtyByLegacyProduct.get(workOrder.product) ?? 0) + record.qtySelesai,
      );
    }
  }

  const targetByPreciseKey = new Map<string, number>();
  const targetByLegacyProduct = new Map<string, number>();

  for (const detail of details) {
    if (detail.productNote != null && detail.productNote !== '') {
      const key = designIdentityKey(detail);
      targetByPreciseKey.set(
        key,
        (targetByPreciseKey.get(key) ?? 0) + detail.qtyTarget,
      );
    } else {
      targetByLegacyProduct.set(
        detail.product,
        (targetByLegacyProduct.get(detail.product) ?? 0) + detail.qtyTarget,
      );
    }
  }

  return details.map((detail) => {
    const isPrecise = detail.productNote != null && detail.productNote !== '';
    const key = designIdentityKey(detail);
    const totalQty = isPrecise
      ? qtyByPreciseKey.get(key) ?? 0
      : qtyByLegacyProduct.get(detail.product) ?? 0;
    const totalTarget = isPrecise
      ? targetByPreciseKey.get(key) ?? 0
      : targetByLegacyProduct.get(detail.product) ?? 0;
    const share = totalTarget > 0 ? detail.qtyTarget / totalTarget : 0;
    const qtyRealisasi = Math.round(totalQty * share);
    const nilai = qtyRealisasi * (detail.hargaJahit + detail.hargaObras);
    return { qtyRealisasi, nilai };
  });
}
