# Operasional Konveksi

Bahasa bersama untuk penerimaan order, produksi pakaian, kinerja karyawan, dan penyelesaian keuangan. Seluruh area ini memakai satu konteks domain; halaman atau menu bukan konteks bisnis terpisah.

## Language

### Order dan identitas

**Client**:
Pihak yang memesan pekerjaan produksi konveksi.
_Avoid_: Akun login, penjahit, vendor.

**Order Produksi**:
Satu pesanan produksi dengan identitas bersama, sejumlah variasi, dan harga per pcs yang berlaku untuk order tersebut.
_Avoid_: Work Order, baris variasi, invoice.

**Kode Produksi Konveksi**:
Kode bisnis internal yang mengenali satu Order Produksi dan mengelompokkan variasinya.
_Avoid_: Kode Produksi Client, Work Code; “Product Note” adalah nama lama untuk konsep ini.

**Kode Produksi Client**:
Kode produksi dari pihak Client yang dicatat sebagai referensi pasangannya di konveksi; berbeda dari kode internal konveksi.
_Avoid_: Kode Client, Kode Produksi Konveksi.

**Batch Produksi**:
Urutan produksi ulang produk yang dinyatakan dalam kode Client; repeat 00 berarti batch pertama dan repeat 01 berarti batch kedua.
_Avoid_: Jumlah variasi, jumlah setoran, nomor urut order internal.

**Kode Client**:
Kode pengenal Client, bukan kode untuk satu pesanan atau satu variasi.
_Avoid_: Kode Produksi Client.

**Variasi**:
Satu kombinasi warna dan size dengan kuantitasnya di dalam Order Produksi.
_Avoid_: Order Produksi, kelompok produksi.

**Work Order**:
Unit pelaksanaan produksi untuk satu variasi yang sudah ditarik ke proses produksi.
_Avoid_: Order Produksi, seluruh variasi dari satu kode produksi.

**Work Code**:
Kode pengenal unit pekerjaan pada tingkat variasi, bukan identitas seluruh Order Produksi.
_Avoid_: Kode Produksi Konveksi, Kode Produksi Client.

**Pull**:
Tindakan memindahkan Order Produksi yang siap ke pelaksanaan produksi, dengan pekerjaan tersendiri untuk setiap variasi.
_Avoid_: Generate Target, impor data, pembayaran.

### Pelaksanaan produksi

**Cutting**:
Tahap pemotongan bahan sebelum pekerjaan jahit berlangsung.
_Avoid_: Selesai Jahit, Finishing.

**Setoran Jahit**:
Catatan jumlah pcs yang diselesaikan seorang penjahit pada tanggal kerja tertentu.
_Avoid_: Target Jahit, pembayaran upah.

**Pasang Kancing**:
Tahap pekerjaan pemasangan kancing yang dicatat terpisah dari jahit dan finishing.
_Avoid_: Setoran Jahit, Finishing.

**Finishing**:
Tahap penyelesaian fisik pakaian setelah pekerjaan sebelumnya, bukan status pembayaran order.
_Avoid_: Invoiced, lunas.

**Status Produksi**:
Keadaan kemajuan pekerjaan fisik suatu variasi; keadaan kelompok produksi ditentukan dari variasi-variasinya.
_Avoid_: Status Invoice, status persetujuan Planning.

**Status Invoice**:
Keadaan penagihan atau pembayaran yang terpisah dari kemajuan produksi fisik.
_Avoid_: Status Produksi, lunas produksi.

**Sisa Tahap**:
Kuantitas yang masih dapat dikerjakan pada satu tahap menurut hasil tahap sebelumnya dan jumlah yang telah dicatat pada tahap tersebut.
_Avoid_: Seluruh Qty Order, target bulanan karyawan.

### Orang, rencana, dan kinerja

**Karyawan**:
Orang yang tercatat bekerja di konveksi, dengan posisi dan status keaktifannya; seseorang dapat tercatat tanpa memiliki akun login.
_Avoid_: Akun, role.

**Penjahit**:
Karyawan dengan posisi pekerjaan menjahit; bukan nama umum untuk semua akun Staff atau seluruh karyawan.
_Avoid_: Staff, Finishing, Leader.

**Posisi**:
Jenis pekerjaan seorang karyawan, seperti Penjahit, Finishing, atau Leader.
_Avoid_: Role akun, hak akses.

**Akun Login**:
Identitas untuk masuk ke aplikasi, yang dapat dihubungkan ke satu Karyawan.
_Avoid_: Nama karyawan, posisi pekerjaan.

**Role Akun**:
Peran otorisasi akun, seperti Owner, Finance, Inventory, Supervisor, atau Staff; peran ini berbeda dari posisi pekerjaan.
_Avoid_: Posisi, divisi, nama orang.

**Planning Produksi**:
Rencana penugasan kuantitas suatu variasi kepada penjahit untuk bulan target tertentu.
_Avoid_: Order Produksi, setoran aktual.

**Generate Target**:
Tindakan membentuk atau menambahkan Target Jahit dari Planning Produksi yang memenuhi syarat.
_Avoid_: Pull, mencatat realisasi produksi.

**Target Jahit**:
Sasaran jumlah pcs yang harus diselesaikan penjahit pada bulan tertentu.
_Avoid_: Setoran Jahit, Benefit, target biaya.

**Belum Jahit**:
Sisa pekerjaan jahit dari produksi yang sedang berjalan, bukan sisa target bulanan seseorang.
_Avoid_: Utang Staff, Target Jahit.

**Realisasi Produksi**:
Jumlah pekerjaan aktual yang telah dicatat untuk orang, tahap, dan periode yang dimaksud.
_Avoid_: Rencana, target, nilai uang.

**Tarif per Pcs**:
Nilai pekerjaan per potong untuk order dan jenis pekerjaan tertentu, dengan keberlakuan waktunya.
_Avoid_: Gaji, total invoice, satu tarif tetap untuk semua order.

**Realisasi Cost / Posisi**:
Nilai uang dari hasil kerja aktual menurut tarif pekerjaan terkait; berbeda dari gaji yang sudah dibayarkan.
_Avoid_: Gaji diterima, Benefit bruto.

**Akumulasi**:
Penggabungan riwayat sampai batas waktu tertentu; lingkup riwayat dan tanggal batas harus disebutkan.
_Avoid_: Bulan terpilih, bulan berjalan saja.

**Bulan Final**:
Periode kinerja yang sudah ditutup sehingga perubahan sumber yang memengaruhi hasilnya memerlukan pembukaan kembali oleh pihak berwenang.
_Avoid_: Bulan lewat, pembayaran otomatis.

### Keuangan dan penyelesaian

**Gaji Diterima**:
Pembayaran gaji kepada karyawan yang menjadi dasar pembanding dengan nilai hasil kerjanya.
_Avoid_: Realisasi Cost / Posisi, pembayaran Benefit.

**Benefit Bruto**:
Nilai tambahan dari produksi melebihi target bulanan yang memenuhi aturan perhitungan, sebelum potongan utang dan pembayaran tunai.
_Avoid_: Uang pasti dapat dibayar, seluruh realisasi kerja.

**Benefit Potong Utang**:
Bagian Benefit yang dipakai mengurangi Utang Staff sebelum menentukan sisa yang bisa dibayar tunai.
_Avoid_: Transfer tunai, Expense baru, pembayaran gaji.

**Utang Staff**:
Sisa kewajiban karyawan setelah perbandingan gaji dan hasil kerja, pemakaian Benefit untuk potong utang, serta pembayaran Benefit yang sudah terjadi.
_Avoid_: Utang Staf, Belum Jahit, seluruh gaji yang pernah diterima.

**Benefit Dapat Dibayar**:
Sisa Benefit setelah memperhitungkan utang dan pembayaran sebelumnya; saldo sementara belum tentu memenuhi syarat dibayar dari periode final.
_Avoid_: Benefit Bruto, pembayaran yang sudah terjadi.

**Pembayaran Benefit**:
Transfer tunai atas Benefit yang memenuhi syarat, tercatat sebagai transaksi tersendiri dan bukan pembayaran gaji.
_Avoid_: Benefit Potong Utang, SALARY.

**Invoice**:
Tagihan kepada Client untuk satu Kode Produksi Konveksi yang mencakup variasi-variasinya.
_Avoid_: Work Order tunggal, bukti pembayaran, Expense.

**Expense**:
Catatan transaksi pengeluaran beserta klasifikasi dan pihak terkaitnya; gaji dan pembayaran Benefit adalah jenis transaksi yang berbeda.
_Avoid_: Invoice penjualan, Benefit Potong Utang.

**Vendor**:
Pihak penyedia barang atau jasa yang terkait dengan pengeluaran konveksi.
_Avoid_: Client, akun karyawan.

**Complain & Penalti**:
Catatan masalah produksi beserta pertanggungjawaban dan potongan terkaitnya; tidak sama dengan sisa pekerjaan yang belum selesai.
_Avoid_: Belum Jahit, Utang Staff.

**Hapus Permanen**:
Penghapusan catatan bisnis dan dependensi yang diizinkan setelah dampaknya diperiksa; berbeda dari pembatalan proses atau penonaktifan master.
_Avoid_: Batal, Non-Aktif, arsip.
