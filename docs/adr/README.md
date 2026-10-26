# Keputusan Arsitektur dan Domain

ADRs ini mencatat alasan keputusan yang sudah diimplementasikan, bukan proposal perubahan perilaku. Nomor menunjukkan urutan pencatatan; tanggal keputusan asli dicantumkan bila diketahui. Rekonstruksi retrospektif tidak mengklaim ada persetujuan baru.

| ADR | Keputusan | Status |
|---|---|---|
| [0001](0001-persistent-data-through-supabase-services.md) | Data persisten melalui service Supabase; fixture/config tetap terpisah | Accepted |
| [0002](0002-order-variation-and-production-code-identity.md) | Pisahkan identitas order, variasi, dan kode Client | Accepted |
| [0003](0003-kanban-follows-least-advanced-variation.md) | Kartu Kanban mengikuti variasi paling tertinggal | Accepted; menggantikan aturan tertinggi pada spec 2026-08-10 |
| [0004](0004-benefit-offsets-debt-before-cash-payment.md) | Benefit memotong utang sebelum pembayaran tunai | Accepted; keputusan bisnis 2026-10-21 |
| [0005](0005-durable-media-cleanup-after-business-deletion.md) | Cleanup media tahan kegagalan di luar transaksi bisnis | Accepted |

Definisi istilah ada di [GLOSSARY.md](../../GLOSSARY.md); pemetaan implementasi dan batas yang belum selesai ada di [CONTEXT.md](../../CONTEXT.md). Tidak setiap styling, label, atau pilihan library memerlukan ADR.
