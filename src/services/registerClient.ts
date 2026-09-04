import { supabase } from '@/lib/supabase'
import {
  findClientByBrand,
  tallyClientUsage,
  type ClientUsage,
  type ResolvedClient,
} from '@/lib/clientCode'

const TABLE = 'register_client'

// Row shape used by the UI (camelCase, matches viewConfig keys).
export interface RegisterClientRow {
  id: number
  namaClient: string
  kodeClient: string
  status: string
}

export const STATUS_OPTIONS = ['Aktif', 'Non-Aktif']

function mapRow(row: Record<string, unknown>): RegisterClientRow {
  return {
    id: row.id as number,
    namaClient: row.nama_client as string,
    kodeClient: row.kode_client as string,
    status: (row.status as string) ?? 'Aktif',
  }
}

export async function fetchAll(): Promise<{ data: RegisterClientRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('id', { ascending: true })
  if (error) return { data: null, error }
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error: null }
}

export async function create(input: Omit<RegisterClientRow, 'id'>): Promise<{ data: RegisterClientRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      nama_client: input.namaClient,
      kode_client: input.kodeClient,
      status: input.status ?? 'Aktif',
    })
    .select()
    .single()
  if (error) return { data: null, error }
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error: null }
}

export async function update(id: number, updates: Partial<RegisterClientRow>): Promise<{ error: Error | null }> {
  const dbUpdates: Record<string, unknown> = {}
  if (updates.namaClient !== undefined) dbUpdates.nama_client = updates.namaClient
  if (updates.kodeClient !== undefined) dbUpdates.kode_client = updates.kodeClient
  if (updates.status !== undefined) dbUpdates.status = updates.status
  const { error } = await supabase
    .from(TABLE)
    .update(dbUpdates)
    .eq('id', id)
  return { error }
}

export async function remove(id: number): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
  return { error }
}

/**
 * Terjemahkan brand Work Order ke kode client master.
 *
 * Mengembalikan `null` bila brand belum terdaftar di Register Client, supaya
 * pemanggil bisa memilih antara gagal cepat (jalur pembuatan invoice) atau
 * lewati saja (jalur backfill). Kode client disalin sebagai nilai tersendiri
 * di baris invoice, jadi invoice lama tidak terpengaruh bila master diubah.
 */
export async function resolveClientByBrand(brand: string): Promise<{ data: ResolvedClient | null; error: Error | null }> {
  const { data, error } = await fetchAll()
  if (error) return { data: null, error }
  return { data: findClientByBrand(brand, data ?? []), error: null }
}

const USAGE_PAGE_SIZE = 1_000

interface UsageWorkOrder {
  id: string
  brand: string | null
}

interface UsageInvoice {
  workOrderId: string
  clientName: string | null
}

async function fetchUsageWorkOrders(): Promise<{ data: UsageWorkOrder[] | null; error: Error | null }> {
  const rows: UsageWorkOrder[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('work_orders')
      .select('id, brand')
      .order('id', { ascending: true })
      .range(from, from + USAGE_PAGE_SIZE - 1)

    if (error) return { data: null, error }

    const page = (data as Array<{ id: string; brand: string | null }> | null) ?? []
    rows.push(...page)
    if (page.length < USAGE_PAGE_SIZE) break
    from += USAGE_PAGE_SIZE
  }

  return { data: rows, error: null }
}

async function fetchUsageInvoices(): Promise<{ data: UsageInvoice[] | null; error: Error | null }> {
  const rows: UsageInvoice[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('invoices')
      .select('work_order_id, client_name')
      .order('work_order_id', { ascending: true })
      .range(from, from + USAGE_PAGE_SIZE - 1)

    if (error) return { data: null, error }

    const page = (data as Array<{ work_order_id: string; client_name: string | null }> | null) ?? []
    rows.push(...page.map((row) => ({ workOrderId: row.work_order_id, clientName: row.client_name })))
    if (page.length < USAGE_PAGE_SIZE) break
    from += USAGE_PAGE_SIZE
  }

  return { data: rows, error: null }
}

/** Hitung pemakaian client sebelum UI mengizinkan penghapusan. */
export async function fetchClientUsage(
  clients: readonly Pick<RegisterClientRow, 'namaClient'>[],
): Promise<{ data: ClientUsage[] | null; error: Error | null }> {
  const [workOrdersResult, invoicesResult] = await Promise.all([
    fetchUsageWorkOrders(),
    fetchUsageInvoices(),
  ])

  if (workOrdersResult.error) return { data: null, error: workOrdersResult.error }
  if (invoicesResult.error) return { data: null, error: invoicesResult.error }

  return {
    data: tallyClientUsage(
      clients,
      workOrdersResult.data ?? [],
      invoicesResult.data ?? [],
    ),
    error: null,
  }
}
