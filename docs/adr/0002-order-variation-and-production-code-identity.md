---
status: accepted
---

# Pisahkan identitas order, variasi, dan kode Client

Satu Order Produksi dapat memiliki banyak warna/size dan menghasilkan Work Order tersendiri per variasi, sedangkan harga dan penagihan berada pada tingkat order. Identitas order karena itu tidak digantikan Product ID, Work Code, ataupun Kode Produksi Client: Kode Produksi Konveksi (`product_note`) mengelompokkan order, variasi mempunyai identitasnya sendiri, dan kode Client disimpan sebagai referensi terpisah. Menyatukannya akan mencampur pekerjaan atau harga dari produksi berbeda dan membuat tagihan parsial tampak sebagai seluruh order.

Dicatat retrospektif pada 2026-10-22. [Spec identitas Target Jahit](../superpowers/specs/2026-08-27-target-jahit-product-note-identity-design.md) mendokumentasikan mengapa identitas produksi ikut membedakan rincian; [CONTEXT.md](../../CONTEXT.md) memetakan tabel dan field terkini. Referensi legacy yang kosong tidak boleh diisi dengan tebakan hanya agar tampilan terlihat lengkap; mempertahankan ketidakpastian lebih aman daripada mengaitkan produksi yang salah.
