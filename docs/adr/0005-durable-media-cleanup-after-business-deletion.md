---
status: accepted
---

# Penghapusan bisnis dan cleanup media memiliki batas transaksi berbeda

PostgreSQL dan Cloudflare R2 tidak berbagi satu transaksi: menghapus berkas dahulu dapat merusak record yang gagal dihapus, sedangkan menghapus record dahulu tanpa catatan cleanup dapat meninggalkan objek selamanya. Hapus permanen karena itu memeriksa graph dependensi dan fingerprint di server, lalu menyimpan pekerjaan cleanup yang tahan kegagalan bersama penghapusan bisnis; Worker mengklaim pekerjaan dengan lease dan mengakui hasil penghapusan objek. Cleanup tertunda harus terlihat dan dapat dicoba ulang, bukan disebut sukses total karena baris database sudah hilang.

Dicatat retrospektif pada 2026-10-22, berdasarkan `src/services/permanentDeletion.ts`, `worker/src/cleanup.ts`, serta tabel/fungsi cleanup yang diperiksa lewat Supabase MCP. Keputusan ini mempertahankan blocker bisnis, pemeriksaan referensi objek, dan pembatasan Owner/Finance; bukan izin untuk menghapus data atau lampiran selama audit dokumentasi.
