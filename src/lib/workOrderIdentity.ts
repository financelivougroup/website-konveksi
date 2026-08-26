const COLOR_ABBREVIATIONS: Record<string, string> = {
  black: 'BLK',
  white: 'WHT',
  navy: 'NVY',
  red: 'RED',
  grey: 'GRY',
  gray: 'GRY',
  beige: 'BEG',
  blue: 'BLU',
  green: 'GRN',
  brown: 'BRN',
  pink: 'PNK',
  yellow: 'YLW',
  orange: 'ORG',
  purple: 'PRP',
  cream: 'CRM',
  khaki: 'KHK',
  maroon: 'MRN',
  silver: 'SLV',
  gold: 'GLD',
};

export function getColorAbbreviation(color: string): string {
  const key = color.toLowerCase().trim();
  if (COLOR_ABBREVIATIONS[key]) return COLOR_ABBREVIATIONS[key];

  const withoutVowels = key.replace(/[aeiou]/gi, '');
  return withoutVowels.toUpperCase().substring(0, 3) || key.toUpperCase().substring(0, 3);
}

export function buildProductId(brand: string, product: string): string {
  return `${brand.substring(0, 3).toUpperCase()}-${product.replace(/\s/g, '-').toUpperCase().substring(0, 5)}`;
}

export function buildVariationId(productId: string, color: string, size: string): string {
  if (!productId || !color || !size) return '';
  return `${productId}-${getColorAbbreviation(color)}-${size}`;
}
