# Verifikasi Target Jahit — saldo dan benefit

Checkpoint 2026-10-21; **perhitungan/UI tersedia, pembayaran publik masih nonaktif**. Bukan persetujuan rilis penuh.

## Koreksi konteks 2026-10-22 — akses baca pribadi

- MCP read-only memverifikasi bahwa `staff_settlement_read` kini memberi Owner/Finance seluruh staf yang memenuhi eligibility settlement, sedangkan akun lain hanya identitas `profiles.orang_id` sendiri. Akun tanpa tautan identitas menerima `[]`; permintaan ID orang lain ditolak. Pernyataan di riwayat bawah bahwa semua staff ditolak atau tab inventory terkunci adalah hasil versi lama, bukan aturan UI terkini.
- RPC pembayaran/pembatalan tetap Owner/Finance. `staff_settlement_release.enabled` masih **false** pada pemeriksaan ini; akses baca tidak mengaktifkan pembayaran.
- Akun tertaut tidak menjamin baris settlement: query menyertakan posisi Penjahit, orang dengan Target Jahit, atau orang dengan riwayat Benefit. Sumber `staff_settlement_months` masih `sewing_records`/tarif Penjahit, bukan produksi Finishing. Gaji saja tidak otomatis memasukkan semua posisi ke daftar.
- `scripts/smoke-settlement-browser.mjs` masih membawa fixture penolakan role lama; hasil browser historis di bawah tidak membuktikan akses pribadi terbaru. Tidak ada browser/login nyata, pembayaran, finalisasi, atau migration baru dalam audit dokumentasi ini.
- Lihat [CONTEXT.md](../CONTEXT.md), [GLOSSARY.md](../GLOSSARY.md), dan [ADR-0004](adr/0004-benefit-offsets-debt-before-cash-payment.md). Riwayat perhitungan/pengujian di bawah dipertahankan apa adanya; baca menurut tanggal, bukan sebagai satu kontrak aktif.

## Refinement terbaru — benefit langsung memotong utang (2026-10-21)

User mengonfirmasi eksplisit utang awal Arief460rb − benefit240rb = **sisa utang220rb**, walau nilai extra sudah termasuk cost. Ini menggantikan formula lama di riwayat dokumen ini; jangan mengembalikan debt460rb sebagai hasil terkini.

- MCP tersambung kembali. Forward migration `2026-10-21-benefit-debt-offset.sql` (`benefit_debt_offset`) memperbarui person/month/final-prefix dan alokasi cash candidate berdasarkan definisi live terinspeksi. Fingerprint diberi versi aturan. Public release tetapfalse.
- Rumus: beforeDebt=max(0,S−R), unpaidGross=max(0,B−P), offset=min(beforeDebt,unpaidGross), netDebt=max(0,S−R+P−B), payable=max(0,min(B−P,R−S+B−P)). Offset bukan payment/Expense; tidak ada record offset ditambahkan tiap refresh. Cash yang sudah dibayar tidak dapat dipakai lagi memotong debt.
- MCP live sesudah: Arief cost540rb/salary1jt/gross240rb/beforeDebt460rb/offset240rb/**debt220rb**,payable0. Months dan summary konsisten.
- MCP rollback: salary fixture640rb/cost540rb/gross240rb => offset100rb/payable140rb; partial50rb => payable90rb, offset100rb; replay tidak dobel; void mengembalikan140rb. Open month ditolak INSUFFICIENT_FINAL_BALANCE; fingerprint aturan lama ditolak STALE_BALANCE. Semua rollback; pembayaran0,finals0,Expense6 (tetap),gatefalse; anon readfalse/private candidate authenticatedfalse.
- Unit baru terbukti **5 tes gagal pada formula lama**, sesudah patch helper **8/8**, suite penuh **866/866**. TypeScript/scoped lint dan service smoke lulus. Chrome fixture actual table+dialog lulus before460rb/offset240rb/net220rb, pembayaran input disabled saat debt tersisa, case cash retry/idempotency existing, inventory lock dan HP; screenshot potongan diperiksa. Fixture tidak menggantikan login/API live.
- Kolom beforeDebt/offset/netDebt ditambah pada Utang/Benefit/detail; hanya sisa menjadi cash payable. Build final revisi offset **exit0**, main2507.50kB/gzip668.99kB; peringatan existing sama. Local3000/8787 terverifikasi HTTP200. Local user server tidak dihentikan; fixture/browser khusus ditutup.
- Gate release pembayaran lama belum dituntaskan dan tidak diaktifkan sebagai bagian revisi rumus. Tidak commit/push/deploy, tidak mengubah jumlah gaji/produksi bisnis.

## Riwayat keputusan sebelum refinement
JAHIT+OBRAS per order/tanggal; extra bulanan berdasarkan urutan setoran tanggal/input_at/id; tanpa target bukan extra; debt=gaji+benefit dibayar−seluruh biaya realisasi; surplus menutup debt dahulu. Owner/Finance dapat membayar sebagian melalui Expense, hanya bulan final. Pembayaran bukan SALARY dan tidak dihitung dua kali. Klik orang menunjukkan bulan dan entry.

## Bukti data live read-only
MCP: Arief target Oktober50, satu sewing entry90, tidak ada target detail; resolver tarif6000 baseline_unverified. `staff_settlement_person` menghasilkan cost540000, extra40, gross benefit240000, salary1000000, debt460000, payable0. Ini menunjukkan extra gross tidak otomatis dapat dibayar. Data tersebut tidak diperbaiki/direkayasa.

## Perubahan backend diterapkan via Supabase MCP
- Ledger `staff_benefit_payments`, link Expense, release gate false, kategori EXPENSE/MANPOWER/BENEFIT berdasarkan lookup parent tanpa hardcode ID.
- Private monthly allocation/person helper; authorized read RPC; payment RPC dan private candidate; void/correction terpisah, audit; generic linked Expense edit/delete ditolak, preview permanent delete memberi blocker.
- Salary ikut advisory gate dan final-month guard. Fingerprint final diperluas ke salary input dan sewing input_at yang menentukan urutan extra. Tidak ada bulan final saat pemasangan wrapper sehingga tidak perlu mengubah snapshot existing.
- File mirror: `supabase/migrations/2026-10-20-target-jahit-benefit-payments.sql`. MCP menerapkan bagian kecil berturut: staff_benefit_ledger, staff_settlement_months, staff_settlement_read, staff_benefit_write_guard, staff_benefit_payment_rpc, staff_benefit_void, staff_benefit_delete_preview, staff_settlement_fingerprint, staff_benefit_interval_fix, staff_benefit_candidate_gate, staff_settlement_ordering_guard.
- Satu payload integrity gagal `Invalid or expired requestState`; inspeksi membuktikan kolom belum ada lalu dipecah menjadi migration kecil. Probe payment awal menemukan literal interval tidak sah `1 month-1 day`; diperbaiki lewat MCP menjadi `1 month - 1 day`. Tidak menyebut payload gagal sebagai terpasang.

## Pengujian nyata database
Semua mutation probe dalam BEGIN/ROLLBACK, tidak commit payment atau finalisasi bulan. Beberapa probe memakai baris Arief sementara di transaksi rollback, lalu nilai operasional diverifikasi kembali (Oktober90/target50/salary1jt). Sequence Expense naik karena rollback tidak memutar sequence; tidak dianggap data pembayaran tersimpan.

- Owner role authenticated membaca6 orang, tidak punya direct private helper execute atau ledger INSERT.
- Staff authenticated ditolak 42501; anon EXECUTE read/pay false.
- Partial bayar10rb atas fixture eligible240rb membuat satu Expense; replay request sama tidak dobel; sisa230rb; void menghapus Expense dan mempertahankan ledger void/audit. Owner dan Finance authenticated sama-sama berhasil bayar fixture. Owner general salary UPDATE tetap0 baris; Finance ordinary salary no-op tetap berhasil.
- Finance generic linked Expense UPDATE ditolak42501 BENEFIT_USE_SETTLEMENT_ACTION. Owner generic linked UPDATE0 baris dari RLS (bukan keberhasilan edit; probe awal yang hanya mengandalkan exception salah ditandai FAIL, kemudian dibedakan affected rows).
- Final salary mutation ditolak42501 KPI_MONTH_FINAL. Linked Expense permanent-delete graph mempunyai blocker eksplisit.
- Overpay ditolak BENEFIT_INSUFFICIENT_FINAL_BALANCE, fingerprint lama STALE_BALANCE, tanggal sebelum akhir cutoff ditolak.

### Overlap yang benar-benar terbukti
1. Gate holder PID1984844 memegang sekitar16:10:10–16:10:35.372505 UTC; payment contender PID1984845 16:10:16.531849 dan salary contender PID1984848 16:10:26.420802 ditolak40001 KPI_WRITE_BUSY_RETRY. Holder ini gate-only, bukan actual payment.
2. **Actual payment holder** PID1988527 setelah payment candidate berhasil memegang **2026-10-20 17:02:13.338455–17:02:33.365843 UTC**. Payment contender PID1988530 pada17:02:21.021666 ditolak40001 KPI_WRITE_BUSY_RETRY. Probe sebelumnya17:02:12 datang sebelum holder dan STALE_BALANCE, bukan bukti overlap.
3. **Salary writer holder** PID1989218 17:04:57.772136–17:05:17.793764 UTC; payment contender PID1989219 17:04:59.038840 ditolak40001 KPI_WRITE_BUSY_RETRY.
- Holder30 detik terdahulu berakhir16:16:32.644614; contender16:16:33.626428 terlambat, tidak dihitung. Holder60 detik MCP timeout setelah2395s tanpa evidence; tidak diklaim sukses. Pemeriksaan sesudahnya payments0/finals0/gatefalse. Tidak ada bukti holder tersebut meninggalkan transaksi aktif, tetapi cek pg_stat_activity spesifik terakhir perlu diulang jika akan release.

## Frontend/verifikasi kode
- Target page dan Laporan memakai monetary month overlay dari satu service backend; monthly cost tidak lagi tertahan detail kosong. Error/tarif kosong ditampilkan unavailable, bukan nol. Laporan financial fail-closed untuk cost incomplete.
- Utang dan Benefit akumulasi per staff ID tidak dipengaruhi filter Target; klik membuka shadcn dialog bulanan/entry/history. Nilai provisional dan final dipisah. Expense linked tidak menawarkan generic edit/attachment/duplicate; backend tetap enforcement utama.
- Browser Chrome nyata service fixture: actual cost tanpa detail, benefit kumulatif, perbulan/entry, error pembayaran dan retry request UUID sama, pembayaran10rb menyisakan230rb, role inventory terkunci, HP390 tanpa overflow. Screenshot diperiksa, dialog yang awalnya melebar diperbaiki dan bounding box diverifikasi. **Bukan login/API live**.
- Unit suite saat checkpoint **863/863**; service smoke lulus; TypeScript/scoped lint lulus. Build final produksi setelah patch Report incomplete/overlay actual **exit0**,3858 modul, main2506.48kB/gzip668.79kB; peringatan existing Browserslist/import invoiceCode/chunk besar. Typecheck/scoped lint/service smoke sesudah patch lulus.

## Gate terbuka — jangan enable release dulu
- Supabase MCP terakhir terputus `getaddrinfo ENOTFOUND mcp.supabase.com`; tidak fallback SQL client. Aktifkan/koneksikan ulang MCP sebelum melanjutkan DB.
- Matrix no-target/open-month/error atomic Expense write/fingerprint ordering guard dan source correction setelah payment, serta payment vs produksi arrival order lain belum lengkap. No-target helper unit lulus, tetapi probe SQL terakhir tidak jalan karena MCP putus.
- Final-prefix/cutoff setelah beberapa pembayaran lintasbulan, tanggal transfer/historical read, rollover salary/month gap, ambiguous/renamed identity dan void dengan lampiran perlu regression lebih lengkap. Benefit payment tidak menyediakan attachment; void row yang sudah punya proof diblokir agar tidak orphan media.
- Nama lama yang sudah berganti belum memiliki alias history; tidak boleh mengklaim pemetaan historical identity seluruhnya selesai. Nilai legacy tidak terpetakan perlu peringatan/penanganan sebelum release.
- Staff yang memiliki ledger terlindungi FK Expense/ledger; penjelasan preview master biasanya memakai expense existing, void-only historical reference perlu explicit blocker tambahan.
- Belum ada pengujian login nyata maupun pembacaan UI memakai sesi produksi user. Local Vite user jangan dihentikan; fixture browser/server khusus sudah ditutup.
- Tidak commit/push/deploy. Tidak membuat pembayaran bisnis atau memfinalkan bulan operasional.
