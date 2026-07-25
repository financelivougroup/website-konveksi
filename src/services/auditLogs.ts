import { supabase } from '@/lib/supabase'

const TABLE = 'audit_logs'

export interface AuditLogEntry {
  id?: number
  phase: string
  record_id: string
  field: string
  old_value: string | null
  new_value: string | null
  changed_by: string | null
  reason: string | null
}

export async function fetchAll(): Promise<{ data: AuditLogEntry[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('changed_at', { ascending: false })
  return { data: data as AuditLogEntry[] | null, error }
}

export async function create(input: AuditLogEntry): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from(TABLE)
    .insert(input)
  return { error }
}
