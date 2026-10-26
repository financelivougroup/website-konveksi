# Domain Docs

Repository ini memakai **satu konteks domain**. Menu produksi, kinerja, dan finance merupakan area dalam konteks yang sama; tidak perlu membuat context map atau glossary per folder.

## Sebelum eksplorasi

1. Baca ringkasan dan Latest Progress di `project.md` sesuai `CLAUDE.md`.
2. Baca `CONTEXT.md` untuk batas domain, pemetaan implementasi, akses, dan kesenjangan yang diketahui.
3. Gunakan istilah bisnis dari `GLOSSARY.md`; baca ADR terkait melalui `docs/adr/README.md` sebelum mengubah keputusan yang sudah ada.
4. Untuk pekerjaan fitur, temukan spec/plan terkait melalui `docs/README.md`. Dokumen bertanggal adalah riwayat desain/pengujian; periksa status dan perubahan yang menggantikannya.

## Satu fungsi per dokumen

| Dokumen | Isi | Saat diperbarui |
|---|---|---|
| `GLOSSARY.md` | Definisi bisnis singkat, istilah kanonis dan yang dihindari | Segera ketika arti istilah disepakati; tanpa tabel DB, API, status implementasi, atau rencana kerja |
| `CONTEXT.md` | Batas domain, hubungan konsep, pemetaan kode, aturan aktif, batas verifikasi | Saat perilaku atau pemahaman terkini berubah |
| `docs/adr/NNNN-slug.md` | Alasan keputusan yang mahal dibalik, mengejutkan tanpa konteks, dan melibatkan trade-off nyata | Hanya bila ketiganya terpenuhi; bukan untuk setiap perubahan UI |
| `project.md` | Ringkasan, pekerjaan terbuka dan Latest Progress | Pada akhir tugas; sebutkan bukti yang dijalankan serta batasnya |
| Spec/plan/checkpoint bertanggal | Desain atau bukti pada saat itu | Pertahankan riwayat; tambahkan pointer supersession bila perlu, bukan menulis ulang hasil lama menjadi seolah baru |

## Menyelaraskan dokumen

- Cocokkan pernyataan implementasi dengan working tree, termasuk perubahan belum commit. Catat konflik; dokumentasi tidak boleh mengubah perilaku aplikasi secara terselubung.
- Untuk klaim live database, baca objek yang relevan lewat **Supabase MCP**. Migration lama dan tipe TypeScript adalah petunjuk, bukan bukti objek live sudah terpasang.
- Pisahkan role akun, posisi karyawan, hak baca, hak tulis, dan release gate. Jangan menerjemahkan "tab terbuka" sebagai izin semua transaksi.
- Saat ADR berubah, beri status superseded dan tautkan penggantinya. ADR retrospektif menyebut bahwa ia merekam keputusan lama, bukan persetujuan baru.
- Uji tautan lokal dan ejaan istilah sesudah edit. Laporkan hal yang belum diuji; browser fixture, impersonasi SQL, dan login nyata adalah bukti berbeda.

Format glossary dan ADR mengikuti skill `mattpocock-skills:domain-modeling` yang terpasang. Gunakan `mattpocock-skills:writing-for-agents` ketika mengubah instruksi pembacaan dokumen.
