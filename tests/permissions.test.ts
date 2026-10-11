import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCTION_LOG_EDITOR_ROLES,
  PRODUCTION_LOG_EDIT_HINT,
  SALARY_EDITOR_ROLES,
  SALARY_EDIT_HINT,
  canEditProductionLog,
  canEditSalary,
} from '../src/lib/permissions.ts';

// Permintaan user (verbatim): "tolong buat settingan kalau khusus role finance
// dan owner bisa delete/edit row di bagian sewing, kancing, finishing. selain
// role tsb hanya bisa read dan input di awal aja."
//
// Tes ini menjaga satu hal saja: daftar role yang boleh mengubah/menghapus log
// produksi. Aturan yang sama ditulis ulang di database sebagai policy RLS
// (supabase/migrations/2026-09-24-production-log-role-restriction.sql), dan
// cerminan SQL-nya sudah diuji langsung lewat Supabase MCP dengan impersonasi
// tiap akun:
//   inventory  → 0 update, 0 delete, 1 insert
//   supervisor → 0 update, 0 delete, 1 insert   (keputusan user: "sama seperti Inventory")
//   staff      → 0 update, 0 delete, 1 insert
//   finance    → update & delete berhasil
//   owner      → update & delete berhasil
//   anon       → permission denied (hak tulis dicabut)

test('owner boleh mengubah dan menghapus log produksi', () => {
  assert.equal(canEditProductionLog('owner'), true);
});

test('finance boleh mengubah dan menghapus log produksi', () => {
  assert.equal(canEditProductionLog('finance'), true);
});

test('inventory TIDAK boleh mengubah atau menghapus log produksi', () => {
  // Inti permintaan user: "selain role tsb hanya bisa read dan input di awal".
  assert.equal(canEditProductionLog('inventory'), false);
});

test('supervisor TIDAK boleh mengubah atau menghapus log produksi', () => {
  // Permintaan user: hak Supervisor "sama seperti Inventory".
  assert.equal(canEditProductionLog('supervisor'), false);
});

test('staff TIDAK boleh mengubah atau menghapus log produksi', () => {
  assert.equal(canEditProductionLog('staff'), false);
});

test('tanpa profil (null/undefined) ditolak — gagal ke arah aman', () => {
  // Sebelum profil termuat, halaman tidak boleh menampilkan tombol ubah/hapus.
  assert.equal(canEditProductionLog(null), false);
  assert.equal(canEditProductionLog(undefined), false);
});

test('daftar role editor persis owner dan finance', () => {
  assert.deepEqual([...PRODUCTION_LOG_EDITOR_ROLES], ['owner', 'finance']);
});

test('inventory tidak ada di daftar editor', () => {
  assert.equal(PRODUCTION_LOG_EDITOR_ROLES.includes('inventory'), false);
});

test('canEditProductionLog sejalan dengan daftar editor', () => {
  // Dua ekspor ini tidak boleh berbeda: satu dipakai UI, satu jadi rujukan
  // dokumentasi/policy. Kalau daftarnya diubah, keduanya harus ikut bergerak.
  const semuaRole = ['owner', 'finance', 'inventory', 'supervisor', 'staff'] as const;
  for (const role of semuaRole) {
    assert.equal(
      canEditProductionLog(role),
      PRODUCTION_LOG_EDITOR_ROLES.includes(role),
      `tidak konsisten untuk role ${role}`,
    );
  }
});

test('allow-list, bukan deny-list: role baru tidak otomatis dapat hak', () => {
  // Role yang belum dikenal harus DITOLAK, supaya role baru di
  // public.profiles.role tidak diam-diam mewarisi hak ubah/hapus.
  assert.equal(canEditProductionLog('manager' as never), false);
  assert.equal(canEditProductionLog('' as never), false);
});

test('pesan penjelas menyebut kedua role yang berhak', () => {
  assert.match(PRODUCTION_LOG_EDIT_HINT, /Owner/);
  assert.match(PRODUCTION_LOG_EDIT_HINT, /Finance/);
});

// ===== Baris GAJI =====
//
// Permintaan user (verbatim): "yang isi cuma boleh finance". Owner boleh
// MELIHAT, tidak mengisi — itulah bedanya dengan log produksi di atas, dan
// itulah sebabnya daftarnya terpisah, bukan dipakai ulang.
//
// Cerminan SQL-nya (`public.is_finance()` di
// supabase/migrations/2026-09-25-expense-salary-entries.sql) sudah diuji lewat
// Supabase MCP.

test('finance boleh mencatat dan mengubah gaji', () => {
  assert.equal(canEditSalary('finance'), true);
});

test('owner TIDAK boleh mengisi gaji — hanya melihat', () => {
  // Ini inti bedanya dengan log produksi: owner ada di daftar sana, TIDAK di sini.
  assert.equal(canEditSalary('owner'), false);
});

test('inventory TIDAK boleh mengisi gaji', () => {
  assert.equal(canEditSalary('inventory'), false);
});

test('supervisor TIDAK boleh mengisi gaji', () => {
  // Hak Supervisor "sama seperti Inventory" — jadi gaji pun tidak boleh diisi.
  assert.equal(canEditSalary('supervisor'), false);
});

test('staff TIDAK boleh mengisi gaji', () => {
  assert.equal(canEditSalary('staff'), false);
});

test('tanpa profil (null/undefined) ditolak — gagal ke arah aman', () => {
  assert.equal(canEditSalary(null), false);
  assert.equal(canEditSalary(undefined), false);
});

test('daftar role editor gaji persis finance saja', () => {
  assert.deepEqual([...SALARY_EDITOR_ROLES], ['finance']);
});

test('owner tidak ada di daftar editor gaji', () => {
  // Ditegakkan eksplisit: memakai ulang PRODUCTION_LOG_EDITOR_ROLES akan
  // diam-diam memberi owner hak tulis gaji yang user tidak minta.
  assert.equal(SALARY_EDITOR_ROLES.includes('owner'), false);
});

test('canEditSalary sejalan dengan daftar editor gaji', () => {
  // Dua ekspor ini tidak boleh berbeda: satu dipakai UI, satu jadi rujukan
  // dokumentasi/policy.
  const semuaRole = ['owner', 'finance', 'inventory', 'supervisor', 'staff'] as const;
  for (const role of semuaRole) {
    assert.equal(
      canEditSalary(role),
      SALARY_EDITOR_ROLES.includes(role),
      `tidak konsisten untuk role ${role}`,
    );
  }
});

test('allow-list, bukan deny-list: role baru tidak otomatis dapat hak gaji', () => {
  assert.equal(canEditSalary('manager' as never), false);
  assert.equal(canEditSalary('' as never), false);
});

test('pesan penjelas gaji menyebut Finance, bukan Owner', () => {
  assert.match(SALARY_EDIT_HINT, /Finance/);
  assert.doesNotMatch(SALARY_EDIT_HINT, /Owner/);
});
