// Pure reference model for the server settlement contract; no IO or browser state.
export interface SettlementEntry {
  id: string; date: string; inputAt: string; pcs: number; rate: number | null;
}
export function allocateMonthlyExtra(entries: readonly SettlementEntry[], target: number | null) {
  let accumulated = 0;
  return [...entries].sort((a,b) => a.date.localeCompare(b.date) || a.inputAt.localeCompare(b.inputAt) || a.id.localeCompare(b.id)).map(entry => {
    const extra = target === null ? 0 : Math.max(0, accumulated + entry.pcs - target) - Math.max(0, accumulated - target);
    accumulated += entry.pcs;
    return { ...entry, extra, cost: entry.rate === null ? null : entry.pcs * entry.rate, benefit: entry.rate === null ? null : extra * entry.rate };
  });
}
export function settlementBalance(cost: number, salary: number, benefit: number, paid: number) {
  const debtBeforeBenefit = Math.max(0, salary - cost);
  const grossRemaining = Math.max(0, benefit - paid);
  return {
    debtBeforeBenefit,
    benefitOffset: Math.min(debtBeforeBenefit, grossRemaining),
    debt: Math.max(0, salary - cost + paid - benefit),
    grossRemaining,
    payable: Math.max(0, Math.min(benefit - paid, cost - salary + benefit - paid)),
  };
}
