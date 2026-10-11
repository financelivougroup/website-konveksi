import {
  ORDER_PRICE_COMPONENTS,
  type OrderEntryDetail,
  type OrderPriceComponent,
  type ProductionOrderVariation,
} from '../types/pipeline.ts';

export function normalizeProductionCode(value: string): string {
  return value.trim().toLocaleLowerCase('id-ID');
}

export function normalizeVariationPart(value: string): string {
  return value.trim().toLocaleLowerCase('id-ID');
}

export function variationCombinationKey(
  variation: Pick<ProductionOrderVariation, 'color' | 'size'>,
): string {
  return `${normalizeVariationPart(variation.color)}::${normalizeVariationPart(variation.size)}`;
}

export function hasDuplicateVariations(
  variations: Array<Pick<ProductionOrderVariation, 'color' | 'size'>>,
): boolean {
  const keys = variations.map(variationCombinationKey);
  return new Set(keys).size !== keys.length;
}

/**
 * Jumlah seluruh qty satu order.
 *
 * Sejak input qty manual dihapus dari Order Entry (permintaan user: "kOlOm
 * quantity harusnya dihapus aja"), angka ini **tidak lagi berasal dari form** —
 * form hanya mengirim warna dan size. Nilainya dibaca dari data tersimpan
 * (`detail.variations`), yang berisi qty hasil sinkronisasi POS client, dan
 * bernilai 0 selama POS belum mengirim apa pun.
 *
 * Fungsi ini sengaja tetap ada: ia masih dipakai untuk menjumlahkan qty yang
 * sudah tersimpan, dan `|| 0` di dalamnya menangani qty kosong/null.
 */
export function totalOrderQuantity(
  variations: Array<Pick<ProductionOrderVariation, 'quantity'>>,
): number {
  return variations.reduce((sum, variation) => sum + (Number(variation.quantity) || 0), 0);
}

export function totalOrderPrice(
  components: Array<Pick<OrderPriceComponent, 'value'>>,
): number {
  return components.reduce((sum, component) => sum + (Number(component.value) || 0), 0);
}

export function emptyOrderPriceComponents(): OrderPriceComponent[] {
  return ORDER_PRICE_COMPONENTS.map((component, index) => ({
    ...component,
    value: 0,
    sortOrder: index,
  }));
}

export function mergeOrderPriceComponents(
  components: OrderPriceComponent[] | null | undefined,
): OrderPriceComponent[] {
  return ORDER_PRICE_COMPONENTS.map((definition, index) => {
    const saved = components?.find((component) => component.key === definition.key);
    return {
      id: saved?.id,
      key: definition.key,
      label: definition.label,
      value: saved?.value ?? 0,
      sortOrder: index,
    };
  });
}

export function isOrderPriceComplete(
  components: Array<Pick<OrderPriceComponent, 'key' | 'value'>>,
): boolean {
  const keys = new Set(components.map((component) => component.key));
  return (
    ORDER_PRICE_COMPONENTS.every((component) => keys.has(component.key)) &&
    components.every((component) => Number.isInteger(component.value) && component.value >= 0) &&
    totalOrderPrice(components) > 0
  );
}

/**
 * Nilai awal form Create New Order.
 *
 * `variations` hanya berisi warna + size — **tanpa quantity**. Kolom qty dihapus
 * dari form atas permintaan user ("pada saat Create New Order di Order Entry,
 * kOlOm quantity harusnya dihapus aja"); angkanya nanti datang dari POS client.
 * Sebelumnya di sini ada `quantity: 1`, dan angka 1 itu yang membuat setiap
 * order baru tampak ber-qty 1 pcs padahal client belum mengirim apa pun.
 */
export function emptyOrderEntryValues() {
  return {
    productionCode: '',
    clientProductionCode: '',
    productId: '',
    product: '',
    brand: '',
    variations: [{ color: '', size: '' }],
    components: emptyOrderPriceComponents(),
  };
}

/**
 * Isi form saat order lama dibuka untuk dilihat/diedit.
 *
 * `quantity` sengaja TIDAK ikut: ia tidak lagi ditampilkan maupun dikirim, dan
 * menyertakannya di sini akan membuat `submit` mengirim balik nilai lama
 * seolah-olah hasil ketikan user. Nilai tersimpannya tetap utuh di database —
 * `order_entry_save` tidak lagi menyentuh kolom itu saat update.
 */
export function orderEntryValuesFromDetail(detail: OrderEntryDetail) {
  return {
    productionCode: detail.productionCode,
    clientProductionCode: detail.clientProductionCode ?? '',
    productId: detail.productId,
    product: detail.product,
    brand: detail.brand,
    variations: detail.variations.map((variation) => ({
      color: variation.color,
      size: variation.size,
    })),
    components: mergeOrderPriceComponents(detail.pricing.components),
  };
}

/** Awalan tetap kode produksi yang dibuat sistem: `PO/001-LVU/09/2026/001`. */
export const PRODUCTION_CODE_PREFIX = 'PO';

/**
 * Apakah sebuah kode produksi dibuat otomatis oleh sistem.
 *
 * Kode bentuk lama (`PDFF_...`) tetap tersimpan apa adanya, jadi perlu ada
 * cara membedakannya. Format finalnya dirakit di SQL
 * (`next_production_code`) agar tidak ada dua sumber kebenaran — di sini
 * hanya dikenali awalannya, sehingga aturan tidak perlu dirangkap.
 */
export function isAutoProductionCode(code: string | null | undefined): boolean {
  return (code ?? '').trim().toUpperCase().startsWith(`${PRODUCTION_CODE_PREFIX}/`);
}

export const PRODUCT_PHOTO_BUCKET = 'product-photos';

/**
 * Sanitasi nama file agar aman dipakai sebagai segmen path objek storage.
 * Karakter di luar [A-Za-z0-9_.-] diganti underscore — pola ini sama dengan
 * yang dipakai uploadComplainProof di src/services/complainFiles.ts.
 */
export function sanitizeProductPhotoName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_');
}

/**
 * Path objek untuk foto produk satu order: `<orderId>/<timestamp>-<nama aman>`.
 * Murni (tanpa IO) supaya bisa diuji.
 */
export function productPhotoPath(orderId: string, fileName: string, timestamp: number): string {
  return `${orderId}/${timestamp}-${sanitizeProductPhotoName(fileName)}`;
}

/**
 * Path objek untuk foto satu variasi: `<orderId>/<variationId>/<timestamp>-<nama aman>`.
 *
 * Variasi ikut jadi segmen path supaya foto per variasi tidak saling menimpa
 * walau nama filenya sama. Murni (tanpa IO) supaya bisa diuji.
 */
export function variationPhotoPath(
  orderId: string,
  variationId: string,
  fileName: string,
  timestamp: number,
): string {
  return `${orderId}/${variationId}/${timestamp}-${sanitizeProductPhotoName(fileName)}`;
}

export function orderEntryErrorMessage(error: Error): string {
  const message = error.message;
  if (message.includes('ORDER_EDIT_BLOCKED_BY_PROGRESS')) {
    return 'Order berubah menjadi view-only karena progres produksi atau invoice sudah tercatat.';
  }
  if (message.includes('ORDER_VARIATIONS_LOCKED_AFTER_PULL')) {
    return 'Struktur warna, size, dan qty sudah dikunci setelah order di-Pull.';
  }
  if (message.includes('ORDER_PRICE_INCOMPLETE')) {
    return 'Delapan komponen harga harus lengkap dan total harga harus lebih dari Rp0.';
  }
  if (message.includes('ORDER_VARIATIONS_INCOMPLETE')) {
    return 'Variasi belum lengkap atau masih memerlukan pemeriksaan.';
  }
  if (message.includes('Kode produksi sudah digunakan')) {
    return 'Kode produksi sudah digunakan. Simpan ulang untuk mendapatkan nomor berikutnya.';
  }
  if (message.includes('Client belum terdaftar di Register Client')) {
    return 'Client belum terdaftar di Register Client. Tambahkan clientnya dulu di menu Contact → tab Client.';
  }
  return message;
}
