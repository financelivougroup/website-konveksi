---
status: accepted
---

# Benefit mengurangi utang sebelum dibayar tunai

User telah menetapkan bahwa utang sebelum Benefit Rp460.000 dengan Benefit bruto Rp240.000 menjadi sisa utang Rp220.000, meskipun produksi extra juga masuk nilai realisasi. Kita mengikuti aturan bisnis ini alih-alih mempertahankan utang Rp460.000 atau langsung membayar seluruh Benefit: Benefit yang belum dibayar dipakai memotong utang, lalu hanya sisa yang memenuhi syarat periode final dapat dibayar tunai. Potongan adalah perhitungan saldo, bukan transaksi Expense baru; uang yang sudah dibayar tidak dapat dipakai kembali sebagai potongan utang.

Keputusan bisnis 2026-10-21, dicatat retrospektif pada 2026-10-22. Rumus dan batas implementasi ada di [CONTEXT.md](../../CONTEXT.md); bukti sebelum/sesudah dan gate transaksi ada di [checkpoint settlement](../target-jahit-settlement-verification-2026-10-21.md). Ledger pembayaran tetap terpisah dari gaji, dengan Expense terkait dan alur void; akses baca saldo bukan izin membayar dan bukan persetujuan mengaktifkan release gate.
