export interface WorkOrderDesignIdentity {
  productNote: string | null;
  product: string;
  warna: string | null;
}

export interface PlannedTargetDetailInput extends WorkOrderDesignIdentity {
  qty: number;
}

export type GroupedTargetDetail = PlannedTargetDetailInput;

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
  if (!ym) {
    return details.map(() => ({ qtyRealisasi: 0, nilai: 0 }));
  }

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

  const preciseDetailIndices = new Map<string, number[]>();
  const legacyDetailIndices = new Map<string, number[]>();

  details.forEach((detail, index) => {
    if (detail.productNote != null && detail.productNote !== '') {
      const key = designIdentityKey(detail);
      const indices = preciseDetailIndices.get(key) ?? [];
      indices.push(index);
      preciseDetailIndices.set(key, indices);
    } else {
      const indices = legacyDetailIndices.get(detail.product) ?? [];
      indices.push(index);
      legacyDetailIndices.set(detail.product, indices);
    }
  });

  const allocatedQty = Array<number>(details.length).fill(0);
  const allocateBucket = (indices: number[], totalQty: number) => {
    const totalTarget = indices.reduce(
      (sum, index) => sum + details[index].qtyTarget,
      0,
    );
    if (totalTarget <= 0) return;

    const allocations = indices.map((index) => {
      const exact = totalQty * details[index].qtyTarget / totalTarget;
      const base = Math.floor(exact);
      allocatedQty[index] = base;
      return { index, remainder: exact - base };
    });
    const allocatedBase = allocations.reduce(
      (sum, allocation) => sum + allocatedQty[allocation.index],
      0,
    );
    const remaining = totalQty - allocatedBase;

    allocations.sort((a, b) =>
      b.remainder - a.remainder || a.index - b.index,
    );
    for (let i = 0; i < remaining; i++) {
      allocatedQty[allocations[i].index] += 1;
    }
  };

  for (const [key, indices] of preciseDetailIndices) {
    allocateBucket(indices, qtyByPreciseKey.get(key) ?? 0);
  }
  for (const [product, indices] of legacyDetailIndices) {
    allocateBucket(indices, qtyByLegacyProduct.get(product) ?? 0);
  }

  return details.map((detail, index) => {
    const qtyRealisasi = allocatedQty[index];
    const nilai = qtyRealisasi * (detail.hargaJahit + detail.hargaObras);
    return { qtyRealisasi, nilai };
  });
}
