# Target Jahit: Planning, Pricing, dan Perhitungan Utang — Design

**Date:** 2026-08-06
**Status:** Approved for implementation planning

## Context

Target Jahit saat ini adalah tabel statis (22 kolom, satu baris per orang per bulan) yang menampung target/realisasi/cost/akumulasi, tanpa ada sumber data yang menghidupinya. User ingin sistem yang lebih hidup: planning produk yang akan dikerjakan staf ke depan, harga per proses per desain, target staf yang dihitung dari planning, perhitungan utang staf, dan pencatatan complain/potongan/poin — semuanya transparan dengan pembatasan hak akses.

## Goals

1. **Planning Produksi** — rencana per staf (produk, warna, jumlah) untuk periode ke depan, dengan konteks stock; auto-generate draf target bulan berikutnya yang masih bisa diedit.
2. **Harga per desain** — bersumber dari **Register PO** (bukan tabel harga baru); tambahkan komponen **Jasa Pasang Kancing** ke Register PO untuk kebutuhan Target Jahit.
3. **Target staf** — baris `target_jahit` per orang per bulan di-generate dari planning, tetap editable; kolom turunan (target_daily, dll.) dihitung otomatis.
4. **Perhitungan utang** — `Utang = Total Gaji Diterima − Total Nilai Pcs Selesai`, dengan nilai per pcs = (harga Jahit + harga Obras) per desain; sejak hari pertama kerja. Utang>0 → kejar; bertambah terus → evaluasi.
5. **Complain & Penalti** — CS mencatat complain (dari chat customer), potongan per pcs dari posisi relevan, poin → surat peringatan.
6. **Transparansi** — data produksi bisa dilihat semua role; gaji & utang khusus owner/finance.
7. **Rincian per desain** — satu baris ringkas per orang per bulan (parent) + rincian per produk (child), supaya bisa lihat realisasi per desain.

## Non-Goals (fase berikutnya)

- Finishing, Potong/leader masuk perhitungan target & utang (versi 1 fokus penjahit).
- Potongan otomatis full-flow dari laporan finishing.
- Hardening RLS `anon` (sudah dicatat sebagai follow-up terpisah).
- Export/import bulk untuk tabel baru.
- Login/role baru untuk CS (CS cukup sebagai nilai `input_by` pada complain; tidak menambah role auth).

## Current Architecture

- `target_jahit` (existing): 22 kolom target/realisasi/cost/akumulasi per orang per bulan. **Catatan inspeksi live schema:** kolom live bernama `bulanTahun` (camelCase) — inkonsistensi dengan file migration yang memakai `bulan_tahun`. Konvensi baru: snake_case; live Supabase schema dianggap kebenaran.
- `register_po` + `register_po_components`: harga per production order; komponen Potong, Jahit, Obras, Operational, Material Basic, Margin, Finishing.
- `sewing_records`: `pic_penjahit`, `work_order_id`, `work_code`, `qty_selesai` — sumber realisasi & identitas penjahit (jahit+obras satu orang).
- `register_penjahit`: daftar staf (kosong saat ini).
- `raw_product_monitoring`: konteks stock (available_quantity) per variant.
- `finishing_records`: laporan finishing (sudah terlacak, untuk fase 2).
- App: sidebar multi-menu, DataTable shared, service per tabel di `src/services/`.

## Design

### Arsitektur (Opsi 2 — Hub Target Jahit)

```
planning_produksi (baru) ──► auto-generate draf ──► target_jahit (HUB, diperluas)
                                                      ├─ target_jahit_detail (baru, per produk)
complain_penalti (baru) ──► potongan & poin
register_po (harga per desain, existing) + komponen "Jasa Pasang Kancing"
```

`target_jahit` menjadi hub: planning meng-umpan target, complain mengurangi nilai.

### Data model

#### 1. `target_jahit` (existing, hub)
- Tetap menyimpan kolom existing.
- Tambahan (jika diperlukan untuk utang): kolom nilai utang / status utang.
- Unique `(bulan, nama)` dipertahankan (parent).

#### 2. `target_jahit_detail` (baru — child per produk)
```
id, target_jahit_id (FK → target_jahit),
product, warna, qty_target,
qty_realisasi, harga_jahit, harga_obras
```

#### 3. `planning_produksi` (baru)
```
id, nama_penjahit, product, warna, qty, bulan_target,
status (draft/final), created_at, updated_at
```
- Konteks stock tampil saat menyusun (dari `raw_product_monitoring`) tapi tidak disimpan sebagai referensi wajib.

#### 4. `complain_penalti` (baru)
```
id, tanggal, product, warna, pcs, posisi (jahit/obras/finishing/kancing),
pic, detail_complain, potongan_per_pcs, poin, bukti_url,
input_by (CS), created_at
```

#### 5. `register_po` (existing) — tambah komponen
- Tambah **Jasa Pasang Kancing** ke daftar komponen Register PO (menjadi 8 komponen). Tersimpan sebagai transparansi biaya desain; TIDAK masuk perhitungan utang penjahit (yang memakai Jahit+Obras saja).

### Perhitungan

#### Alur bulanan
1. Pemilik menyusun planning (per penjahit, produk, warna, qty, bulan_target). Konteks stock tampil.
2. **Generate** → sistem membuat **draf** parent `target_jahit` (target_monthly = total pcs) + `target_jahit_detail` (per produk) untuk bulan target.
3. Pemilik bisa **edit** draf sebelum disahkan.
4. `target_daily` = `target_monthly ÷ total_hari_kerja` (hari kerja efektif bulan berjalan).

#### Rumus kolom target_jahit (existing)
| Kolom | Rumus |
|---|---|
| `target_daily` | `target_monthly ÷ total_hari_kerja` |
| `target_ngebut_hari` | `target_daily + (sisa target ÷ sisa hari)` |
| `realisasi_monthly` | Σ pcs selesai dari `sewing_records` bulan itu |
| `sisa_target_monthly` | `target_monthly − realisasi_monthly` |
| `progress_monthly` | `realisasi_monthly ÷ target_monthly` |
| `target_cost_posisi` | Σ(pcs target × (harga jahit+obras)) per desain |
| `realisasi_cost_posisi` | Σ(pcs selesai × (harga jahit+obras)) per desain |
| `target_accum` / `realisasi_accum` | akumulasi seluruh bulan |
| `selisih_accum` | `realisasi_accum − target_accum` |
| `status_final*` | computed (memenuhi target / tidak) |

#### Utang
```
Utang (Rp) = Total Gaji Diterima − Total Nilai Pcs Selesai

Total Gaji Diterima = Σ(salary) semua bulan di target_jahit, sejak hari pertama kerja
Total Nilai Pcs     = Σ( pcs selesai × (harga Jahit + harga Obras) ) per desain
```

- Harga per desain dari **Register PO** → komponen `Jahit` + `Obras` untuk PO yang memproduksi desain itu.
- Sumber pcs: `sewing_records` → `work_order_id` → `work_orders` → `source_order_id` (production order) → `register_po` → `register_po_components`.
- Hari pertama kerja = bulan pertama orang itu tercatat di `target_jahit`.
- Jika Utang > 0 → status "Utang"; ≤ 0 → "Tidak Utang". Utang bertambah terus → flag "Evaluasi".

#### Nilai bersih setelah penalti
```
Nilai Bersih = Total Nilai Pcs Selesai − Σ(Potongan valid untuk orang itu)
```
Potongan valid = `complain_penalti` dengan `posisi = jahit/obras` dan `pic = penjahit itu`. (Potongan finishing/kancing tidak memengaruhi penjahit.)

### Transparansi & hak akses

| Data | Owner | Finance | Inventory |
|---|---|---|---|
| Data produksi (pcs selesai, desain, planning) | ✅ | ✅ | ✅ |
| Harga per desain (Register PO) | ✅ | ✅ | ✅ |
| Target bulanan, cost, akumulasi | ✅ | ✅ | ❌ |
| Gaji & Utang | ✅ | ✅ | ❌ |

Pembatasan di level **service**: function kalkulasi utang/gaji hanya dipanggil untuk owner/finance.

### UI (3 menu sidebar)

**Planning Produksi** — tabel `planning_produksi`; form tambah (staf dari `register_penjahit`, produk, warna, qty, konteks stock); tombol Generate Target.

**Target Jahit** (hub) — tabel parent `target_jahit` (kolom sesuai user + akumulasi); sub-tab **Utang Staf** (owner/finance): per penjahit → total gaji, total nilai pcs, utang, status; edit draf target; `target_daily` dihitung ulang otomatis.

**Complain & Penalti** — tabel `complain_penalti`; form tambah oleh CS; ringkasan poin per penjahit → SP.

### Build order
1. Migration DB (planning_produksi, complain_penalti, target_jahit_detail; tambah komponen Jasa Pasang Kancing; rapikan kolom live target_jahit bila perlu).
2. Service layer (planning, complain, target detail, utang).
3. UI & wiring route sidebar.
4. Generate target + perhitungan utang.

## Verification Strategy
- `npm run build` (TypeScript + Vite) dan `npm run lint` (laporkan pre-existing failure terpisah).
- Manual: generate target dari planning → cek draf + detail; edit draf; cek realisasi & utang; tambah complain → potongan memengaruhi nilai bersih; cek tampilan per role (inventory tidak lihat gaji/utang).
- Semua operasi DB lewat Supabase MCP; inspeksi live schema sebelum migration.

## Acceptance Criteria
- Planning dapat dibuat per staf dan meng-generate draf target (parent + detail) bulan berikutnya yang bisa diedit.
- Target_daily dihitung dari target_monthly ÷ hari kerja efektif.
- Utang terhitung benar: total gaji − total nilai pcs (harga jahit+obras per desain), sejak hari pertama.
- Complain mencatat potongan & poin; potongan valid mengurangi nilai bersih penjahit.
- Inventory tidak dapat melihat gaji/utang; owner/finance dapat.
- Tampilan ringkas (parent) dan realisasi per desain (child) keduanya tersedia.
- Jasa Pasang Kancing tersedia sebagai komponen Register PO dan tidak masuk hitungan utang penjahit.
