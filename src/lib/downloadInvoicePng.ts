import { toPng } from 'html-to-image';
import { INVOICE_PAGE_HEIGHT, INVOICE_PAGE_WIDTH } from '@/lib/invoicePage';

// Warna fallback sama dengan kertas cream template agar hasil export konsisten.
const INVOICE_BACKGROUND = '#FAF6EF';

export async function downloadInvoicePng(element: HTMLElement, fileNameBase: string): Promise<void> {
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: INVOICE_BACKGROUND,
    // Ukuran kanvas diambil dari konstanta bersama bersama template, bukan dari
    // pengukuran DOM: node template disembunyikan di off-screen.
    width: INVOICE_PAGE_WIDTH,
    height: INVOICE_PAGE_HEIGHT,
    // Template disembunyikan dengan `position:absolute; left:-9999px`.
    // html-to-image menyalin computed style ke node kloning, termasuk offset
    // tersebut, lalu menaruh klon di dalam <foreignObject> ber-viewBox
    // "0 0 width height" — sehingga isi tergambar di luar kanvas dan yang
    // tersisa hanya warna latar. Paksa klon ke pojok kiri-atas kanvas.
    style: {
      position: 'static',
      left: '0',
      top: '0',
      transform: 'none',
      margin: '0',
    },
  });

  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileNameBase}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
