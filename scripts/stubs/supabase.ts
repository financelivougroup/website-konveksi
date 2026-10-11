/**
 * Stand-in for `@/lib/supabase` used only by the SSR smoke test. The real
 * module throws without VITE_SUPABASE_* env vars, and the table under test
 * never touches the database.
 */
export const supabase = {
  from: () => {
    throw new Error('supabase is not available in the smoke test');
  },
  channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
  removeChannel: () => {},
};

export default supabase;
