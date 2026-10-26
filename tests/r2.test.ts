import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALLOWED_R2_CONTENT_TYPES,
  DENIED_R2_CONTENT_TYPES,
  isAllowedR2ContentType,
  isR2LogicalBucket,
  isSafeObjectPath,
  MAX_R2_KEY_LENGTH,
  MAX_R2_UPLOAD_BYTES,
  MEDIA_PATH_PREFIX,
  parseMediaObjectPath,
  R2_LOGICAL_BUCKETS,
  r2Key,
  r2PublicUrl,
} from '../src/lib/r2.ts';

test('mengenali keempat jenis lampiran dan menolak yang lain', () => {
  assert.deepEqual([...R2_LOGICAL_BUCKETS], [
    'product-photos',
    'complain-proofs',
    'expense-proofs',
    'invoice-payment-proofs',
  ]);
  for (const bucket of R2_LOGICAL_BUCKETS) {
    assert.equal(isR2LogicalBucket(bucket), true, bucket);
  }
  assert.equal(isR2LogicalBucket('product-photo'), false);
  assert.equal(isR2LogicalBucket(''), false);
  assert.equal(isR2LogicalBucket(null), false);
  assert.equal(isR2LogicalBucket(undefined), false);
});

test('membubuhkan awalan jenis lampiran pada kunci objek', () => {
  assert.equal(
    r2Key('product-photos', 'PO-abc/1700000000000-foto.jpg'),
    'product-photos/PO-abc/1700000000000-foto.jpg',
  );
  assert.equal(r2Key('expense-proofs', 'expense-17/1-XGF.png'), 'expense-proofs/expense-17/1-XGF.png');
});

test('membuang garis miring di depan supaya kunci tidak pernah diawali //', () => {
  assert.equal(r2Key('complain-proofs', '/complain-2/a.jpeg'), 'complain-proofs/complain-2/a.jpeg');
  assert.equal(r2Key('complain-proofs', '///complain-2/a.jpeg'), 'complain-proofs/complain-2/a.jpeg');
});

test('merangkai URL publik dari basis dan path relatif', () => {
  assert.equal(
    r2PublicUrl('https://cdn.example.com', 'product-photos', 'PO-abc/foto.jpg'),
    'https://cdn.example.com/product-photos/PO-abc/foto.jpg',
  );
});

test('menormalkan garis miring di ujung basis URL', () => {
  assert.equal(
    r2PublicUrl('https://cdn.example.com/', 'expense-proofs', 'expense-17/a.png'),
    'https://cdn.example.com/expense-proofs/expense-17/a.png',
  );
  assert.equal(
    r2PublicUrl('https://cdn.example.com///', 'expense-proofs', 'expense-17/a.png'),
    'https://cdn.example.com/expense-proofs/expense-17/a.png',
  );
});

test('mengembalikan null untuk path kosong atau basis yang belum dikonfigurasi', () => {
  assert.equal(r2PublicUrl('https://cdn.example.com', 'product-photos', null), null);
  assert.equal(r2PublicUrl('https://cdn.example.com', 'product-photos', undefined), null);
  assert.equal(r2PublicUrl('https://cdn.example.com', 'product-photos', ''), null);
  assert.equal(r2PublicUrl(undefined, 'product-photos', 'PO-a/b.jpg'), null);
  assert.equal(r2PublicUrl('', 'product-photos', 'PO-a/b.jpg'), null);
});

test('menerima path relatif yang normal', () => {
  assert.equal(isSafeObjectPath('PO-abc/1700000000000-foto.jpg'), true);
  assert.equal(isSafeObjectPath('expense-17/1789703033702-XGF.png'), true);
  assert.equal(isSafeObjectPath('complain-2/a.jpeg'), true);
  assert.equal(isSafeObjectPath('a'), true);
});

test('menolak path yang mencoba keluar dari direktorinya (traversal)', () => {
  assert.equal(isSafeObjectPath('..'), false);
  assert.equal(isSafeObjectPath('../secrets'), false);
  assert.equal(isSafeObjectPath('a/../../b'), false);
  assert.equal(isSafeObjectPath('a/./b'), false);
  assert.equal(isSafeObjectPath('a//b'), false);
  assert.equal(isSafeObjectPath('/etc/passwd'), false);
  assert.equal(isSafeObjectPath('a\\..\\b'), false);
  assert.equal(isSafeObjectPath('C:\\Windows'), false);
});

test('menolak path kosong atau bukan string', () => {
  assert.equal(isSafeObjectPath(''), false);
  assert.equal(isSafeObjectPath(null), false);
  assert.equal(isSafeObjectPath(undefined), false);
  assert.equal(isSafeObjectPath(42), false);
  assert.equal(isSafeObjectPath({}), false);
});

test('menolak path yang kepanjangan', () => {
  const tooLong = 'a'.repeat(MAX_R2_KEY_LENGTH + 1);
  assert.equal(isSafeObjectPath(tooLong), false);
  assert.equal(isSafeObjectPath('a'.repeat(MAX_R2_KEY_LENGTH)), true);
});

test('mengizinkan semua gambar raster dan PDF, menolak sisanya', () => {
  assert.equal(isAllowedR2ContentType('image/png'), true);
  assert.equal(isAllowedR2ContentType('image/jpeg'), true);
  assert.equal(isAllowedR2ContentType('image/webp'), true);
  assert.equal(isAllowedR2ContentType('image/gif'), true);
  assert.equal(isAllowedR2ContentType('application/pdf'), true);
  assert.equal(isAllowedR2ContentType('application/octet-stream'), true);
  assert.equal(isAllowedR2ContentType(''), false);
  assert.equal(isAllowedR2ContentType(null), false);
});

test('menolak SVG dan markup yang bisa menyisipkan skrip', () => {
  // SVG lolos awalan `image/` tetapi bisa memuat skrip — vektor XSS tersimpan.
  assert.equal(isAllowedR2ContentType('image/svg+xml'), false);
  assert.equal(isAllowedR2ContentType('text/html'), false);
  assert.equal(isAllowedR2ContentType('application/xhtml+xml'), false);
});

test('mengabaikan parameter pada Content-Type dan beda huruf besar-kecil', () => {
  assert.equal(isAllowedR2ContentType('image/jpeg; charset=binary'), true);
  assert.equal(isAllowedR2ContentType('IMAGE/PNG'), true);
  assert.equal(isAllowedR2ContentType('image/svg+xml; charset=utf-8'), false);
});

test('menjaga batas ukuran unggahan tetap 10 MB', () => {
  assert.equal(MAX_R2_UPLOAD_BYTES, 10 * 1024 * 1024);
});

test('memakai tiga awalan MIME: image/*, PDF, dan cadangan octet-stream', () => {
  assert.deepEqual([...ALLOWED_R2_CONTENT_TYPES], [
    'image/',
    'application/pdf',
    'application/octet-stream',
  ]);
  assert.deepEqual([...DENIED_R2_CONTENT_TYPES], [
    'image/svg+xml',
    'text/html',
    'application/xhtml+xml',
  ]);
});

test('rute media memecah jenis lampiran dan path relatif', () => {
  assert.equal(MEDIA_PATH_PREFIX, '/media/');
  assert.deepEqual(
    parseMediaObjectPath('/media/product-photos/PO-abc/1700000000000-foto.jpg'),
    { logicalBucket: 'product-photos', path: 'PO-abc/1700000000000-foto.jpg' },
  );
  assert.deepEqual(
    parseMediaObjectPath('/media/expense-proofs/expense-17/1789703033702-XGF.png'),
    { logicalBucket: 'expense-proofs', path: 'expense-17/1789703033702-XGF.png' },
  );
  // Path bertingkat tetap utuh: hanya segmen pertama yang jadi jenis lampiran.
  assert.deepEqual(
    parseMediaObjectPath('/media/product-photos/PO-a/uuid/1700000000000-foto.jpg'),
    { logicalBucket: 'product-photos', path: 'PO-a/uuid/1700000000000-foto.jpg' },
  );
});

test('rute media menolak path yang bukan lampiran sah', () => {
  // Bukan rute media sama sekali.
  assert.equal(parseMediaObjectPath('/health'), null);
  assert.equal(parseMediaObjectPath('/sign/upload'), null);
  assert.equal(parseMediaObjectPath('/media/'), null);
  assert.equal(parseMediaObjectPath('/media'), null);
  // Jenis lampiran tidak dikenal.
  assert.equal(parseMediaObjectPath('/media/secrets/a.jpg'), null);
  assert.equal(parseMediaObjectPath('/media/../a.jpg'), null);
  // Path kosong setelah jenis lampiran.
  assert.equal(parseMediaObjectPath('/media/product-photos/'), null);
  // Traversal dan sintaks URL sisa.
  assert.equal(parseMediaObjectPath('/media/product-photos/../a.jpg'), null);
  assert.equal(parseMediaObjectPath('/media/product-photos/a/%2e%2e/b.jpg'), null);
  assert.equal(parseMediaObjectPath('/media/product-photos/a/b.jpg?x=1'), null);
  assert.equal(parseMediaObjectPath('/media/product-photos/a//b.jpg'), null);
});
