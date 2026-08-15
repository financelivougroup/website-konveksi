# Complain Form Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesain form complain dengan dropdown bertingkat dari data nyata (Produk → Warna → Work Code, PIC dari Register Karyawan), saran potongan otomatis dari Register PO, level keparahan → poin otomatis, status tracking, dan multi-foto (maks 3) di Storage.

**Architecture:** Opsi A — upgrade form modal yang sudah ada di `ComplainPenaltiPage`. Kolom baru di `complain_penalti` (`work_code`, `tingkat`, `status`), tabel baru `complain_files` + bucket `complain-proofs`. Helper cascade + saran potongan di `src/lib/complainHelper.ts`, service foto di `src/services/complainFiles.ts`.

**Tech Stack:** React 19 + TS, Supabase (Postgres + Storage), Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-08-15-complain-form-redesign-design.md`

## Global Constraints

- **DB ops wajib via Supabase MCP.** Live schema dulu, baru migration.
- Kolom `pcs` **tetap di DB** dengan nilai selalu 1 (untuk `computeDebt`); hanya input form-nya yang dihapus.
- `bukti_url` dihapus dari DB dan dari semua kode.
- Multi-foto **maksimal 3**, bucket `complain-proofs`, path `complain-{id}/{timestamp}-{safeName}`.
- PIC hanya dari **Register Karyawan Aktif**.
- Saran potongan dari: `work_code` → `work_orders.source_order_id` → `register_po` → `register_po_components` (rate sesuai posisi: jahit/obras/finishing/kancing → key komponen).
- Level keparahan: `ringan`=1 poin, `sedang`=2, `berat`=3 (konstanta frontend).
- Status: `Baru` (default) / `Diproses` / `Selesai`.
- Perhitungan utang (`computeDebt` di `staffDebt.ts`) **tidak diubah**.
- Semua konsumen `ModuleId`/`viewConfig` exhaustive.

---

## Task 1 — Migration & Storage bucket

**Files:**
- Create: `supabase/migrations/2026-08-15-complain-redesign.sql`
- DB changes via Supabase MCP (`apply_migration` + bucket SQL).

- [ ] **Step 1 — Inspect live schema** `complain_penalti` via `list_tables` (verifikasi kolom saat ini).
- [ ] **Step 2 — Apply migration** via Supabase MCP:

```sql
-- complain_penalti: add work_code, tingkat, status; drop bukti_url
ALTER TABLE public.complain_penalti ADD COLUMN IF NOT EXISTS work_code TEXT;
ALTER TABLE public.complain_penalti ADD COLUMN IF NOT EXISTS tingkat TEXT;
ALTER TABLE public.complain_penalti ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Baru';
ALTER TABLE public.complain_penalti DROP COLUMN IF EXISTS bukti_url;

-- complain_files: file records per complain
CREATE TABLE IF NOT EXISTS public.complain_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complain_id BIGINT NOT NULL REFERENCES public.complain_penalti(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_complain_files_complain ON public.complain_files(complain_id);
ALTER TABLE public.complain_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated complain files all"
  ON public.complain_files FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public read complain files"
  ON public.complain_files FOR SELECT TO public USING (true);

-- Storage bucket complain-proofs (public) + write policy for authenticated
INSERT INTO storage.buckets (id, name, public)
VALUES ('complain-proofs', 'complain-proofs', true)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Authenticated upload complain proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'complain-proofs');
CREATE POLICY "Authenticated delete complain proofs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'complain-proofs');
```

- [ ] **Step 3 — Verify** via MCP: `select column_name from information_schema.columns where table_name='complain_penalti'` (bukti_url hilang, work_code/tingkat/status ada); `select id, public from storage.buckets` (complain-proofs ada).
- [ ] **Step 4 — Write migration file** `supabase/migrations/2026-08-15-complain-redesign.sql` dengan isi SQL di atas (repo record).
- [ ] **Step 5 — Commit** migration file.

```bash
git add supabase/migrations/2026-08-15-complain-redesign.sql
git commit -m "feat(complain): migration work_code/tingkat/status, complain_files table, complain-proofs bucket"
```

**Test:** verifikasi MCP (Step 3).

---

## Task 2 — complainFiles service

**Files:**
- Create: `src/services/complainFiles.ts`

**Interfaces:**
- Consumes: `supabase` client, tabel `complain_files`, bucket `complain-proofs`.
- Produces: `ComplainFileRow`, `fetchFilesByComplainId`, `uploadComplainProof`, `createComplainFileRecord`, `removeComplainFile`.

Pola mengikuti `src/services/invoicePaymentFiles.ts` (baca dulu sebagai referensi).

- [ ] **Step 1 — Write** `src/services/complainFiles.ts`:

```ts
import { supabase } from '@/lib/supabase';

const TABLE = 'complain_files';
const BUCKET = 'complain-proofs';

export interface ComplainFileRow {
  id: string;
  complainId: number;
  fileName: string;
  filePath: string;
  fileUrl: string;
  uploadedAt: string;
}

// mapRow: snake_case -> camelCase (complain_id -> complainId, dst.)

export async function fetchFilesByComplainId(complainId: number): Promise<{ data: ComplainFileRow[] | null; error: Error | null }> {
  // select * where complain_id = complainId, order uploaded_at asc
}

export interface UploadComplainProofResult {
  fileName: string;
  filePath: string;
  fileUrl: string;
  error: Error | null;
}

export async function uploadComplainProof(input: { complainId: number; file: File }): Promise<UploadComplainProofResult> {
  // safeName = file.name.replace(/[^\w.\-]+/g, '_')
  // filePath = `complain-${input.complainId}/${Date.now()}-${safeName}`
  // supabase.storage.from(BUCKET).upload(filePath, file, { upsert: false, contentType: file.type || undefined })
  // getPublicUrl -> fileUrl
}

export async function createComplainFileRecord(input: { complainId: number; fileName: string; filePath: string; fileUrl: string }): Promise<{ data: ComplainFileRow | null; error: Error | null }> {
  // insert into complain_files
}

export async function removeComplainFile(id: string): Promise<{ error: Error | null }> {
  // fetch file_path dulu, delete row, lalu supabase.storage.from(BUCKET).remove([filePath])
}
```

- [ ] **Step 2 — Build** `npm run build` hijau.
- [ ] **Step 3 — Commit.**

**Test:** `npm run build`.

---

## Task 3 — complainHelper: cascade + saran potongan

**Files:**
- Create: `src/lib/complainHelper.ts`

**Interfaces:**
- Produces: `TINGKAT_OPTIONS`, `POTONGAN_POSISI_KEY`, `ComplainOption`, `buildComplainOptions`, `suggestPotongan`.

- [ ] **Step 1 — Write** `src/lib/complainHelper.ts`:

```ts
import { supabase } from '@/lib/supabase';

export const TINGKAT_OPTIONS = [
  { key: 'ringan', label: 'Ringan', poin: 1 },
  { key: 'sedang', label: 'Sedang', poin: 2 },
  { key: 'berat', label: 'Berat', poin: 3 },
];

export const STATUS_OPTIONS = ['Baru', 'Diproses', 'Selesai'];

// posisi complain -> key komponen di register_po_components
export const POTONGAN_POSISI_KEY: Record<string, string> = {
  jahit: 'jahit',
  obras: 'obras',
  finishing: 'finishing',
  kancing: 'jasa_pasang_kancing',
};

export interface ComplainOption {
  product: string;
  warna: string;
  workCode: string;
  sourceOrderId: string | null;
}

// Ambil kombinasi product/warna/workCode dari work_orders.
export async function fetchComplainOptions(): Promise<ComplainOption[]> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('product, warna, work_code, source_order_id');
  if (error || !data) return [];
  const seen = new Set<string>();
  const opts: ComplainOption[] = [];
  for (const r of data as Array<{ product: string; warna: string | null; work_code: string; source_order_id: string | null }>) {
    const key = `${r.product}|${r.warna ?? ''}|${r.work_code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    opts.push({ product: r.product, warna: r.warna ?? '', workCode: r.work_code, sourceOrderId: r.source_order_id });
  }
  return opts;
}

// Saran potongan: work_code -> source_order_id -> register_po -> komponen sesuai posisi.
export async function suggestPotongan(sourceOrderId: string | null, posisi: string): Promise<number | null> {
  if (!sourceOrderId) return null;
  const compKey = POTONGAN_POSISI_KEY[posisi];
  if (!compKey) return null;
  const { data: po } = await supabase
    .from('register_po')
    .select('id')
    .eq('production_order_id', sourceOrderId)
    .maybeSingle();
  if (!po) return null;
  const { data: comp } = await supabase
    .from('register_po_components')
    .select('value')
    .eq('register_po_id', po.id)
    .eq('key', compKey)
    .maybeSingle();
  if (!comp) return null;
  return Number(comp.value) || null;
}
```

- [ ] **Step 2 — Build** `npm run build` hijau.
- [ ] **Step 3 — Commit.**

**Test:** `npm run build`.

---

## Task 4 — ComplainPenaltiPage: cascade form, foto, tabel baru

**Files:**
- Modify: `src/services/complainPenalti.ts` (row shape: +workCode/+tingkat/+status, −buktiUrl)
- Modify: `src/data/mockData.ts` (viewConfig complain-penalti: kolom baru, hapus pcs/buktiUrl)
- Modify: `src/pages/ComplainPenaltiPage.tsx` (form + tabel)

**Interfaces:**
- Consumes: Task 2 (`complainFiles`), Task 3 (`complainHelper`), `workOrdersSvc.fetchAll` (untuk cascade), `registerPenjahitSvc.fetchAll` (untuk PIC), `useAuth`.

- [ ] **Step 1 — Update `complainPenalti.ts`:** tambah field `workCode: string | null`, `tingkat: string | null`, `status: string` di `ComplainPenaltiRow`; hapus `buktiUrl`; sesuaikan `mapRow`/`create`/`update` (kolom `work_code`, `tingkat`, `status`; hapus `bukti_url`).

- [ ] **Step 2 — Update `mockData.ts` viewConfig `complain-penalti`:**

```ts
'complain-penalti': {
  title: 'Complain & Penalti',
  editable: true,
  sync: false,
  columns: [
    { key: 'tanggal', label: 'Tanggal', width: '100px', icon: 'Calendar' },
    { key: 'workCode', label: 'Work Code', width: '200px', icon: 'FileText' },
    { key: 'product', label: 'Produk', width: '120px', icon: 'Box' },
    { key: 'posisi', label: 'Posisi', width: '90px', badge: true, icon: 'Briefcase' },
    { key: 'pic', label: 'PIC', width: '120px', icon: 'User' },
    { key: 'poin', label: 'Poin', width: '60px', align: 'right', icon: 'AlertTriangle' },
    { key: 'potonganPerPcs', label: 'Potongan/PCS', width: '110px', align: 'right', format: 'currency', icon: 'Scissors' },
    { key: 'tingkat', label: 'Tingkat', width: '90px', badge: true, icon: 'ShieldAlert' },
    { key: 'status', label: 'Status', width: '100px', badge: true, icon: 'Activity' },
    { key: 'inputBy', label: 'Input By', width: '100px', icon: 'UserCheck' },
  ],
},
```

- [ ] **Step 3 — Rewrite `ComplainPenaltiPage.tsx`:**

Form state baru (ganti `ComplainForm`):

```ts
interface ComplainForm {
  tanggal: string;
  product: string;
  warna: string;
  workCode: string;
  pic: string;
  posisi: string;
  tingkat: string;      // ringan/sedang/berat -> poin otomatis
  potonganPerPcs: string;
  detailComplain: string;
  status: string;       // Baru/Diproses/Selesai
}
```

State tambahan di komponen:

```ts
const [options, setOptions] = useState<ComplainOption[]>([]);        // dari fetchComplainOptions
const [penjahitList, setPenjahitList] = useState<RegisterPenjahitRow[]>([]);  // dari registerPenjahitSvc.fetchAll (filter Aktif)
const [pendingFiles, setPendingFiles] = useState<File[]>([]);        // foto baru (maks 3)
const [existingFiles, setExistingFiles] = useState<ComplainFileRow[]>([]);  // foto saat edit
const [fileCountById, setFileCountById] = useState<Record<number, number>>({}); // jumlah foto per complain untuk tabel
```

Cascade logic (derived, useMemo):

```ts
const productOptions = [...new Set(options.map(o => o.product))].sort();
const warnaOptions = form.product ? [...new Set(options.filter(o => o.product === form.product).map(o => o.warna).filter(Boolean))] : [];
const workCodeOptions = (form.product && form.warna) ? options.filter(o => o.product === form.product && o.warna === form.warna).map(o => o.workCode) : [];
const selectedOption = options.find(o => o.workCode === form.workCode);
```

Cascade handlers — saat ganti product: reset warna, workCode, potongan. Saat ganti warna: reset workCode, potongan. Saat ganti workCode/posisi → hitung saran potongan:

```ts
useEffect(() => {
  if (!selectedOption?.sourceOrderId || !form.posisi) return;
  suggestPotongan(selectedOption.sourceOrderId, form.posisi).then(v => {
    if (v !== null) setField('potonganPerPcs', String(v));
  });
}, [form.workCode, form.posisi]);
```

Poin otomatis dari tingkat:

```ts
const poin = TINGKAT_OPTIONS.find(t => t.key === form.tingkat)?.poin ?? 0;
```

Layout form (grid 2 kolom):
1. Tanggal* | Produk* (search input + list filter)
2. Warna* (disabled sampai produk dipilih) | Work Code* (disabled sampai warna dipilih)
3. PIC* (dropdown Aktif) | Posisi*
4. Tingkat* (dropdown ringan/sedang/berat) | Potongan/PCS (readonly hint "saran otomatis, bisa diubah")
5. Status (dropdown Baru/Diproses/Selesai) | (kosong / summary poin)
6. Detail Complain (textarea full width)
7. Bukti Foto (upload area, maks 3; thumbnail preview + tombol hapus)
8. Input By otomatis (footer box)

Produk searchable — pola sederhana:

```tsx
<input value={productSearch} onChange={...} placeholder="Cari produk..." />
<div className="max-h-32 overflow-y-auto border rounded-lg mt-1">
  {filteredProducts.map(p => <button onClick={() => pickProduct(p)}>{p}</button>)}
</div>
```

Foto — upload area:

```tsx
<input type="file" accept="image/*" multiple onChange={handleAddFiles} />
// handleAddFiles: tambah ke pendingFiles, batas total (existingFiles.length + pendingFiles.length) <= 3
// thumbnail: URL.createObjectURL(file), tombol X untuk hapus
```

Simpan (handleSave):

```ts
// 1. insert complain (tanpa foto dulu)
const fields = { tanggal, product, warna, workCode, pcs: 1, posisi, pic, detailComplain, potonganPerPcs, poin, tingkat, status, inputBy };
const { data: created, error } = editTarget ? await updateComplain(editTarget.id, fields) : await createComplain(fields);
// 2. untuk edit: hapus file yang di-remove (removeComplainFile)
// 3. untuk tiap pendingFile: uploadComplainProof({ complainId: id, file }) -> createComplainFileRecord
// 4. refresh + tutup modal
```

Tabel — render manual (bukan DataTable) dengan design system Production Monitoring (import dari `@/lib/tableStyles`: `T_WRAP, T_TABLE, T_HEAD_ROW, T_TH, T_TD, rowClass`):
- Kolom: Tanggal | Work Code | Produk | Posisi | PIC | Poin | Potongan/PCS | Tingkat (badge) | Status (badge) | Bukti (📷 n) | Action (edit/hapus)
- Badge tingkat: ringan=`bg-emerald-600`, sedang=`bg-amber-500`, berat=`bg-rose-600`, teks putih
- Badge status: Baru=`bg-blue-600`, Diproses=`bg-amber-500`, Selesai=`bg-emerald-600`
- Kolom Bukti: fetch count per complain saat refresh (`fetchFilesByComplainId` per item, atau hitung dari `complain_files` bulk)
- Edit: buka modal dengan `existingFiles` dari `fetchFilesByComplainId(item.id)`
- Hapus complain: `removeComplain` (file ikut terhapus via CASCADE)

- [ ] **Step 4 — Build** `npm run build` hijau.
- [ ] **Step 5 — Commit.**

**Test:** `npm run build`.

---

## Task 5 — Final: build, verify, docs

- [ ] **Step 1 — `npm run build`** hijau.
- [ ] **Step 2 — grep** tidak ada `buktiUrl` / `bukti_url` tersisa di `src/`.
- [ ] **Step 3 — `project.md`** Latest Progress update.
- [ ] **Step 4 — Commit** project.md.

## Notes

- `computeDebt` di `staffDebt.ts` tetap membaca `potongan_per_pcs × pcs` dengan `pcs = 1` — tidak perlu diubah.
- Badge `getBadgeClass` di `utils.ts` mungkin tidak cocok untuk status/tingkat baru — render badge manual di tabel complain.
- Jika `register_po_components` tidak punya komponen sesuai posisi → saran potongan null → field kosong, user isi manual.
