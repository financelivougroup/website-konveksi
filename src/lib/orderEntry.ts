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

export function emptyOrderEntryValues() {
  return {
    productionCode: '',
    productId: '',
    product: '',
    brand: '',
    variations: [{ color: '', size: '', quantity: 1 }],
    components: emptyOrderPriceComponents(),
  };
}

export function orderEntryValuesFromDetail(detail: OrderEntryDetail) {
  return {
    productionCode: detail.productionCode,
    productId: detail.productId,
    product: detail.product,
    brand: detail.brand,
    variations: detail.variations.map((variation) => ({
      color: variation.color,
      size: variation.size,
      quantity: variation.quantity,
    })),
    components: mergeOrderPriceComponents(detail.pricing.components),
  };
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
    return 'Kode produksi sudah digunakan. Gunakan Product Note yang berbeda.';
  }
  return message;
}
