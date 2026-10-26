---
status: accepted
---

# Kartu produksi mengikuti variasi yang paling tertinggal

Satu kartu Kanban mewakili seluruh variasi pada Kode Produksi Konveksi; memakai status tertinggi akan menyembunyikan pekerjaan yang masih berjalan ketika satu variasi sudah selesai. Status kelompok karena itu memakai status terendah dari variasinya, sementara total qty tetap mencakup seluruh variasi. Tiga variasi PROGRESS dan satu FINISHED tetap menghasilkan kartu PROGRESS, bukan FINISHED.

Dicatat retrospektif pada 2026-10-22 berdasarkan `src/lib/kanban.ts` (`buildKanbanGroups`, `groupStatus`) dan `tests/kanban.test.ts`. Keputusan ini menggantikan aturan **status tertinggi** pada [spec Kanban 2026-08-10](../superpowers/specs/2026-08-10-kanban-productnote-fullscreen-design.md); spec tersebut dipertahankan sebagai riwayat, bukan kontrak aktif.
