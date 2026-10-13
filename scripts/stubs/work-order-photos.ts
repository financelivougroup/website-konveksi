type Row = Record<string, unknown>;
type QueryError = { code: string; message: string };

export const fixture: {
  tables: Record<string, Row[]>;
  errors: Record<string, QueryError | undefined>;
} = { tables: {}, errors: {} };

export const supabase = {
  from(table: string) {
    let rows = fixture.tables[table] ?? [];
    let single = false;
    const query = {
      select() { return query; },
      order() { return query; },
      eq(field: string, value: unknown) {
        rows = rows.filter((row) => row[field] === value);
        return query;
      },
      in(field: string, values: unknown[]) {
        rows = rows.filter((row) => values.includes(row[field]));
        return query;
      },
      single() { single = true; return query; },
      then(resolve: (result: { data: Row[] | Row | null; error: QueryError | null }) => unknown) {
        const error = fixture.errors[table] ?? null;
        return Promise.resolve(resolve({ data: error ? null : single ? rows[0] ?? null : rows, error }));
      },
    };
    return query;
  },
};
