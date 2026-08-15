# Complain Form Redesign — Design

**Date:** 2026-08-15
**Status:** Approved (Parts 1-3 approved; Opsi A — upgrade existing form)

## Context

Form complain saat ini memakai input teks bebas untuk Produk, Warna, PIC, dan Bukti URL, plus field `pcs` yang tidak sesuai alur (input per pcs). Redesign ini menghubungkan form complain dengan data Production Monitoring (produk, warna, work code), Register Karyawan (PIC), dan Register PO (saran potongan), serta mengganti bukti URL dengan upload multi-foto.

## Goals

1. Form complain memakai data nyata: Produk/Warna/Work Code dari Production Monitoring, PIC dari Register Karyawan.
2. Saran potongan otomatis dari Register PO berdasarkan posisi + work code.
3. Level keparahan → poin otomatis (konsisten antar CS).
4. Multi-foto (maks 3) tersimpan di Storage, menggantikan Bukti URL.
5. Status tracking complain (Baru → Diproses → Selesai).
6. Field `pcs` dan `bukti_url` dihapus.

## Part 1 — Field Form (yang baru)

Alur bertingkat:

1. **Tanggal** — date picker, default hari ini
2. **Produk** — combobox dengan search; daftar produk unik dari `work_orders`; bisa diketik untuk filter
3. **Warna** — dropdown otomatis mengikuti produk; 1 warna → langsung terpilih; ganti produk → reset
4. **Work Code (PO ID)** — dropdown otomatis mengikuti produk+warna; penentu harga potongan
5. **PIC** — dropdown dari Register Karyawan (Aktif saja)
6. **Posisi** — dropdown: Jahit / Obras / Finishing / Kancing
7. **Potongan/PCS** — angka, default dari saran otomatis, bisa diedit manual
8. **Level Keparahan** — dropdown: Ringan (1 poin) / Sedang (2) / Berat (3); poin terisi otomatis
9. **Detail Complain** — textarea
10. **Status** — dropdown: Baru / Diproses / Selesai (default Baru)
11. **Bukti Foto** — upload multi-foto, maksimal 3

**Dihapus:** field `pcs` (input per pcs) dan `bukti_url`.

## Part 2 — Skema Database

### Tabel `complain_penalti` — perubahan kolom

| Perubahan | Kolom | Alasan |
|---|---|---|
| Tambah | `work_code TEXT` | Identitas produksi spesifik (penentu harga potongan) |
| Tambah | `tingkat TEXT` | Keparahan: `ringan` / `sedang` / `berat` |
| Tambah | `status TEXT NOT NULL DEFAULT 'Baru'` | Tracking: Baru / Diproses / Selesai |
| Hapus | `bukti_url TEXT` | Diganti multi-foto |

### Tabel baru `complain_files`

```
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
complain_id BIGINT NOT NULL REFERENCES complain_penalti(id) ON DELETE CASCADE
file_name   TEXT NOT NULL
file_path   TEXT NOT NULL
file_url    TEXT NOT NULL
uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

- FK ke `complain_penalti` dengan `ON DELETE CASCADE` — hapus complain otomatis menghapus file-filenya
- Pola sama persis dengan `invoice_payment_files`

### Storage bucket baru

`complain-proofs` (public, pola `invoice-payment-proofs`).

### Perhitungan utang

Tidak berubah — `computeDebt` masih membaca `potongan_per_pcs × pcs` dari `complain_penalti` dengan posisi jahit/obras. Karena input sekarang per-pcs, **kolom `pcs` tetap ada di database** (bukan dihapus) dengan nilai selalu 1 — hanya field input-nya di form yang dihapus.

### Konstanta level keparahan (frontend)

```
Ringan = 1 poin, Sedang = 2 poin, Berat = 3 poin
```
Jika nanti mau ubah angkanya, cukup ganti konstanta di kode.

## Part 3 — Perilaku UI & Logika

### Alur dropdown bertingkat

1. User buka modal form → field Produk aktif, Warna/Work Code kosong & disabled
2. User ketik di search box Produk → daftar ter-filter → pilih produk
3. Dropdown Warna aktif, terisi otomatis dengan warna yang dimiliki produk itu (dari `work_orders`)
4. User pilih warna → dropdown Work Code aktif, terisi work code yang cocok produk+warna
5. User pilih Work Code → saran potongan muncul otomatis: sistem cari Register PO dari production order work code itu, ambil rate komponen sesuai posisi yang dipilih, tampilkan di field Potongan sebagai nilai default
6. User pilih PIC dari dropdown Register Karyawan (Aktif saja)
7. User pilih Level Keparahan → poin terisi otomatis (1/2/3)
8. User upload foto (maks 3) → preview thumbnail dengan tombol hapus
9. Simpan → foto di-upload ke Storage dulu, lalu record complain + file records dibuat

### Saran potongan

- Sumber: `work_code` → `work_orders.source_order_id` → `register_po` → `register_po_components`
- Rate diambil sesuai posisi yang dipilih (jahit → komponen jahit, obras → komponen obras, dst.)
- Jika tidak ditemukan (belum ada Register PO untuk produk itu) → field tetap kosong, user isi manual
- Nilai saran bisa diedit — ini hanya default, bukan paksaan

### Foto

- Upload ke bucket `complain-proofs` dengan path `complain-{id}/{timestamp}-{filename}`
- Preview thumbnail di form sebelum simpan, tombol × untuk hapus
- Di tabel complain, kolom "Bukti" menampilkan ikon foto + jumlah (mis. 📷 2)
- Klik baris → modal edit menampilkan foto-foto yang sudah di-upload

### Tabel complain di-upgrade

- Kolom baru: Work Code, Tingkat (badge), Status (badge)
- Kolom dihapus: PCS, Bukti URL
- Badge status: Baru = biru, Diproses = kuning, Selesai = hijau
- Badge tingkat: Ringan = hijau, Sedang = kuning, Berat = merah

### Edit complain

- Buka modal edit → semua field terisi, termasuk foto yang sudah ada
- Bisa tambah/hapus foto, ubah status, ubah level keparahan

## Out of scope

- Perubahan perhitungan utang/penalti (tetap seperti sekarang)
- SP otomatis (kumpulan poin → surat peringatan) — bisa ditambahkan nanti
- Notifikasi ke karyawan saat ada complain baru

## Acceptance criteria

- Form complain memakai dropdown Produk (searchable), Warna (cascade), Work Code (cascade), PIC (dari Register Karyawan Aktif)
- Saran potongan otomatis muncul dari Register PO berdasarkan posisi + work code
- Level keparahan mengisi poin otomatis (1/2/3)
- Multi-foto maksimal 3, tersimpan di Storage bucket `complain-proofs`
- Status tracking Baru/Diproses/Selesai
- Field `bukti_url` dihapus dari form dan tabel; input `pcs` dihapus dari form (kolom DB tetap ada, nilai selalu 1)
- Perhitungan utang tidak berubah