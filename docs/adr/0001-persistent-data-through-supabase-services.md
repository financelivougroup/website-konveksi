---
status: accepted
---

# Data persisten melalui service Supabase

Order, produksi, dan keuangan memerlukan penyimpanan bersama serta transaksi dan otorisasi server; mutasi array fixture tidak dapat menjadi catatan bisnis yang dapat diandalkan. Aplikasi karena itu memakai service Supabase di `src/services/`, sedangkan `src/data/` menyimpan konfigurasi tampilan, fixture, dan helper referensi. Ini mempertahankan batas UI/data yang sudah ada tanpa membangun struktur persistensi paralel.

Dicatat retrospektif pada 2026-10-22 dari keputusan integrasi yang sudah diimplementasikan; bukan keputusan migrasi baru. Lihat [spec integrasi](../superpowers/specs/2026-07-08-supabase-integration-design.md) dan [konteks terkini](../../CONTEXT.md). Deployment saat audit memakai Supabase cloud; database lokal tetap pilihan deployment, bukan fakta bahwa stack lokal sedang hidup. Operasi database oleh agent tetap melalui Supabase MCP.
