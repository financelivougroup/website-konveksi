import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCategoryTree,
  childLevel,
  childrenOf,
  findDuplicateName,
  levelLabel,
  pathOf,
  validatePlacement,
  type ExpenseCategory,
} from '../src/lib/expenseCategories.ts';

// ===== Fixture: potongan NYATA dari daftar kategori yang diberikan user =====
// Sengaja memuat kasus-kasus yang membentuk desain: nama item yang sama di dua
// Sub Category berbeda, dan Sub Category tanpa item sama sekali.
function c(
  id: number,
  level: ExpenseCategory['level'],
  parentId: number | null,
  name: string,
  sortOrder = 0,
  isActive = true,
): ExpenseCategory {
  return { id, level, parentId, name, sortOrder, isActive };
}

const ROWS: ExpenseCategory[] = [
  c(1, 'type', null, 'EXPENSE', 1),
  c(2, 'type', null, 'PURCHASE', 2),

  c(10, 'main', 1, 'MOBILITY', 1),
  c(11, 'main', 1, 'OTHERS', 2),
  c(12, 'main', 1, 'MANPOWER', 3),
  c(13, 'main', 2, 'PRODUCTION', 1),

  c(20, 'sub', 10, 'TRANSPORTATION', 1),
  c(21, 'sub', 10, 'DELIVERY', 2),
  c(22, 'sub', 11, 'MEALS', 1),
  c(23, 'sub', 12, 'SALARY', 1),
  c(24, 'sub', 13, 'SEWING', 1),
  c(25, 'sub', 13, 'CUTTING', 2),
  c(26, 'sub', 13, 'FINISHING', 3),

  // 'Visit Offline Purchase' ada di DUA sub berbeda — ini yang membuktikan
  // identitas kategori adalah jalur lengkapnya, bukan namanya.
  c(30, 'item', 20, 'Visit Offline Purchase', 1),
  c(31, 'item', 22, 'Visit Offline Purchase', 1),

  c(32, 'item', 21, 'Delivery Accessories', 1),
  c(33, 'item', 21, 'Delivery Equipment', 2),

  // 'Support Tools' dan 'Mesin' juga muncul di dua Sub Category berbeda.
  c(34, 'item', 24, 'Mesin', 1),
  c(35, 'item', 24, 'Support Tools', 4),
  c(36, 'item', 24, 'Benang', 6),
  c(37, 'item', 25, 'Mesin', 4),
  c(38, 'item', 25, 'Support Tools', 2),

  // SALARY sengaja TIDAK punya item.

  // Satu kategori non-aktif untuk menguji penyembunyian.
  c(39, 'item', 26, 'Kancing', 1, false),
];

// ===== Ketentuan 1-4: pilihan bergantung pada tingkat di atasnya =====

test('tidak memilih apa pun -> hanya Type yang muncul', () => {
  const roots = childrenOf(ROWS, null);
  assert.deepEqual(roots.map((r) => r.name), ['EXPENSE', 'PURCHASE']);
});

test('Main Category hanya milik Type terpilih (ketentuan 1)', () => {
  const expense = childrenOf(ROWS, 1).map((r) => r.name);
  assert.deepEqual(expense, ['MOBILITY', 'OTHERS', 'MANPOWER']);
  // PRODUCTION milik PURCHASE, jadi TIDAK boleh muncul di sini.
  assert.ok(!expense.includes('PRODUCTION'));
});

test('Sub Category hanya milik Main Category terpilih (ketentuan 2)', () => {
  assert.deepEqual(childrenOf(ROWS, 13).map((r) => r.name), ['SEWING', 'CUTTING', 'FINISHING']);
  // SALARY milik MANPOWER, bukan PRODUCTION.
  assert.ok(!childrenOf(ROWS, 13).some((r) => r.name === 'SALARY'));
});

test('Item hanya milik Sub Category terpilih (ketentuan 3)', () => {
  assert.deepEqual(
    childrenOf(ROWS, 21).map((r) => r.name),
    ['Delivery Accessories', 'Delivery Equipment'],
  );
});

test('pilihan yang tidak berhubungan tidak pernah muncul (ketentuan 4)', () => {
  // Rantai EXPENSE > MOBILITY > DELIVERY tidak boleh memunculkan item SEWING.
  const items = childrenOf(ROWS, 21);
  for (const forbidden of ['Benang', 'Mesin', 'Support Tools', 'Kancing']) {
    assert.ok(!items.some((i) => i.name === forbidden), `${forbidden} bocor ke DELIVERY`);
  }
});

// ===== Nama item yang tidak unik =====

test('nama item yang sama di dua Sub Category tetap dua baris terpisah', () => {
  const a = childrenOf(ROWS, 20);
  const b = childrenOf(ROWS, 22);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(a[0].name, b[0].name);
  // Id-nya berbeda: inilah alasan nilai dropdown memakai id, bukan nama.
  assert.notEqual(a[0].id, b[0].id);
});

test('memilih satu Sub Category tidak memunculkan item kembar dari Sub lain', () => {
  const only = childrenOf(ROWS, 20);
  assert.equal(only.filter((r) => r.name === 'Visit Offline Purchase').length, 1);
  assert.equal(only[0].parentId, 20);
});

test('pathOf membedakan kategori yang namanya sama', () => {
  assert.equal(pathOf(ROWS, 30), 'EXPENSE › MOBILITY › TRANSPORTATION › Visit Offline Purchase');
  assert.equal(pathOf(ROWS, 31), 'EXPENSE › OTHERS › MEALS › Visit Offline Purchase');
  assert.notEqual(pathOf(ROWS, 30), pathOf(ROWS, 31));
  assert.notEqual(pathOf(ROWS, 34), pathOf(ROWS, 37)); // Mesin di SEWING vs CUTTING
});

// ===== Item opsional =====

test('Sub Category tanpa item mengembalikan daftar kosong, bukan error', () => {
  assert.deepEqual(childrenOf(ROWS, 23), []); // SALARY
});

test('childLevel menyatakan Item sebagai tingkat terdalam', () => {
  assert.equal(childLevel('type'), 'main');
  assert.equal(childLevel('main'), 'sub');
  assert.equal(childLevel('sub'), 'item');
  assert.equal(childLevel('item'), null);
});

// ===== Non-aktif =====

test('kategori non-aktif tidak muncul di dropdown', () => {
  assert.deepEqual(childrenOf(ROWS, 26), []); // Kancing non-aktif
});

test('kategori non-aktif tetap terlihat di halaman pengelola', () => {
  const shown = childrenOf(ROWS, 26, { includeInactive: true });
  assert.deepEqual(shown.map((r) => r.name), ['Kancing']);
  assert.equal(shown[0].isActive, false);
});

test('anak non-aktif dari induk aktif tidak ikut tersembunyi induknya', () => {
  // FINISHING tetap muncul walau seluruh itemnya non-aktif.
  assert.ok(childrenOf(ROWS, 13).some((r) => r.name === 'FINISHING'));
});

// ===== Urutan =====

test('urutan mengikuti sort_order, bukan alfabet', () => {
  // SEWING(1), CUTTING(2), FINISHING(3) — alfabet akan memberi CUTTING dulu.
  assert.deepEqual(childrenOf(ROWS, 13).map((r) => r.name), ['SEWING', 'CUTTING', 'FINISHING']);
});

test('sort_order sama dipecah dengan nama agar urutannya stabil', () => {
  const rows = [c(1, 'type', null, 'ZETA', 1), c(2, 'type', null, 'ALPHA', 1)];
  assert.deepEqual(childrenOf(rows, null).map((r) => r.name), ['ALPHA', 'ZETA']);
});

// ===== Validasi letak (cerminan trigger database) =====

test('Type harus tanpa induk', () => {
  assert.equal(validatePlacement(ROWS, { level: 'type', parentId: null }), null);
  assert.ok(validatePlacement(ROWS, { level: 'type', parentId: 1 }));
});

test('Main Category harus punya induk', () => {
  assert.ok(validatePlacement(ROWS, { level: 'main', parentId: null }));
  assert.equal(validatePlacement(ROWS, { level: 'main', parentId: 1 }), null);
});

test('tingkat anak harus tepat satu di bawah induknya', () => {
  // item di bawah main -> ditolak
  assert.ok(validatePlacement(ROWS, { level: 'item', parentId: 10 }));
  // sub di bawah type -> ditolak
  assert.ok(validatePlacement(ROWS, { level: 'sub', parentId: 1 }));
  // item di bawah sub -> sah
  assert.equal(validatePlacement(ROWS, { level: 'item', parentId: 20 }), null);
});

test('induk yang tidak ada ditolak', () => {
  assert.ok(validatePlacement(ROWS, { level: 'main', parentId: 999 }));
});

// ===== Deteksi nama kembar =====

test('nama kembar DI DALAM induk yang sama terdeteksi', () => {
  assert.ok(findDuplicateName(ROWS, { name: 'Benang', parentId: 24 }));
});

test('nama sama di induk BERBEDA dianggap sah', () => {
  // Inilah yang membuat 'Visit Offline Purchase' boleh ada dua kali.
  assert.equal(findDuplicateName(ROWS, { name: 'Visit Offline Purchase', parentId: 21 }), null);
});

test('pencocokan nama tidak peka huruf besar dan spasi pinggir', () => {
  assert.ok(findDuplicateName(ROWS, { name: '  bEnAnG  ', parentId: 24 }));
});

test('baris yang sedang diganti nama tidak dianggap bentrok dengan dirinya sendiri', () => {
  assert.equal(findDuplicateName(ROWS, { name: 'Benang', parentId: 24, excludeId: 36 }), null);
});

test('nama kosong tidak pernah dianggap kembar', () => {
  assert.equal(findDuplicateName(ROWS, { name: '   ', parentId: 24 }), null);
});

// ===== Pohon =====

test('buildCategoryTree menyusun hierarki lengkap', () => {
  const tree = buildCategoryTree(ROWS);
  assert.deepEqual(tree.map((t) => t.name), ['EXPENSE', 'PURCHASE']);

  const mobility = tree[0].children.find((m) => m.name === 'MOBILITY');
  assert.ok(mobility);
  assert.deepEqual(mobility.children.map((s) => s.name), ['TRANSPORTATION', 'DELIVERY']);

  const delivery = mobility.children.find((s) => s.name === 'DELIVERY');
  assert.deepEqual(delivery?.children.map((i) => i.name), [
    'Delivery Accessories',
    'Delivery Equipment',
  ]);
});

test('pohon tanpa kategori non-aktif memuat FINISHING tetap tanpa anak', () => {
  const tree = buildCategoryTree(ROWS);
  const finishing = tree[1].children
    .find((m) => m.name === 'PRODUCTION')!
    .children.find((s) => s.name === 'FINISHING');
  assert.ok(finishing);
  assert.deepEqual(finishing.children, []);
});

// ===== Ketahanan data rusak =====

test('pathOf pada id yang tidak ada mengembalikan string kosong', () => {
  assert.equal(pathOf(ROWS, 999), '');
});

test('pathOf tidak menggantung saat data melingkar', () => {
  const circular = [c(1, 'type', 2, 'A'), c(2, 'main', 1, 'B')];
  assert.equal(typeof pathOf(circular, 1), 'string');
});

test('input tidak dimutasi', () => {
  const before = JSON.stringify(ROWS);
  childrenOf(ROWS, 13);
  buildCategoryTree(ROWS);
  pathOf(ROWS, 30);
  assert.equal(JSON.stringify(ROWS), before);
});

test('levelLabel memberi label yang tampil di layar', () => {
  assert.equal(levelLabel('type'), 'Type');
  assert.equal(levelLabel('main'), 'Main Category');
  assert.equal(levelLabel('sub'), 'Sub Category');
  assert.equal(levelLabel('item'), 'Item');
});
