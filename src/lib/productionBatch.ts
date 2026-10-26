/** Client repeat codes are zero-based: B-00 is the first production batch. */
export function productionBatchNumber(clientProductionCode: string | null | undefined): number | null {
  const matches = [...(clientProductionCode ?? '').trim().matchAll(/(?:^|_)B-(\d+)(?=_|$)/gi)];
  if (matches.length !== 1) return null;
  const repeat = Number(matches[0][1]);
  return Number.isSafeInteger(repeat) && repeat < Number.MAX_SAFE_INTEGER ? repeat + 1 : null;
}
