import { toPng } from 'html-to-image';

export async function downloadInvoicePng(element: HTMLElement, fileNameBase: string): Promise<void> {
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: '#ffffff',
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