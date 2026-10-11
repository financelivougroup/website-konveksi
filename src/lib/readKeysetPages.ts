export interface KeysetRow { id: string | number }

/** Keep reading to an empty page: the API may cap pages below our requested limit. */
export async function readKeysetPages<T extends KeysetRow>(
  readPage: (after: T['id'] | null) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  let after: T['id'] | null = null;
  const cursors = new Set<T['id']>();
  for (;;) {
    const page = await readPage(after);
    if (page.length === 0) return rows;
    const next = page[page.length - 1].id;
    if (next === after || cursors.has(next)) throw new Error('Cursor pembacaan data tidak maju.');
    cursors.add(next);
    rows.push(...page);
    after = next;
  }
}

/** The UI must never interpret a failed production source as an empty source. */
export async function readCompleteSources<T extends Record<string, unknown>>(
  readers: { [K in keyof T]: () => Promise<T[K]> },
): Promise<T> {
  const keys = Object.keys(readers) as Array<keyof T>;
  const values = await Promise.all(keys.map((key) => readers[key]()));
  return Object.fromEntries(keys.map((key, index) => [key, values[index]])) as T;
}
