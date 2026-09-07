import { formatDate } from '@/data/pipelineData';
import { INVOICE_PAGE_HEIGHT, INVOICE_PAGE_WIDTH } from '@/lib/invoicePage';
import { formatCurrency } from '@/lib/utils';
import type { InvoiceRow, WorkOrder } from '@/types/pipeline';

interface InvoiceImageProps {
  invoice: InvoiceRow;
  workOrder: WorkOrder | null;
  elementRef?: (element: HTMLDivElement | null) => void;
}

// Palet kertas cream hangat: dicat eksplisit agar hasil capture PNG konsisten.
const CREAM = '#FAF6EF';
const INK = '#2B2A26';
const MUTED = '#8A8175';
const RULE = '#D9CFBF';
const RULE_STRONG = '#C9BCA8';

// Referensi memakai serif hampir di seluruh isi dokumen, jadi serif dipakai
// sebagai font dasar dan sans hanya untuk angka yang perlu terlihat netral.
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const PAGE_PADDING = 60;

const billingTypeLabel = (bt: InvoiceRow['billingType']) =>
  bt === 'mass_production' ? 'Mass Production' : 'Sample Production';

const dash = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '—' : String(value);

export function InvoiceImage({ invoice, workOrder, elementRef }: InvoiceImageProps) {
  const quantity = workOrder?.quantity ?? invoice.pcsLinked;

  // Work code tidak ditampilkan: isinya memuat prefix fase internal
  // ("Produksi - Awal") yang bukan informasi untuk klien. Detail item diambil
  // dari work order agar kolom produk tidak pernah jatuh ke nama client.
  const variation = [workOrder?.warna, workOrder?.size, workOrder?.brand && `Brand: ${workOrder.brand}`]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <div
      ref={elementRef}
      style={{
        position: 'absolute',
        left: -9999,
        top: 0,
        width: INVOICE_PAGE_WIDTH,
        height: INVOICE_PAGE_HEIGHT,
        background: CREAM,
        color: INK,
        fontFamily: SERIF,
        padding: `${PAGE_PADDING}px`,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          paddingBottom: 28,
          borderBottom: `1px solid ${RULE}`,
        }}
      >
        <div style={monogram}>LK</div>
        <div style={title}>INVOICE</div>
      </header>

      <section style={{ padding: '24px 0', fontSize: 13, lineHeight: 1.9 }}>
        <div>Tanggal: {formatDate(invoice.invoiceDate)}</div>
        <div>No. Invoice: {dash(invoice.invoiceCode)}</div>
        <div>Periode: {dash(invoice.monthYear)}</div>
      </section>

      <section style={{ display: 'flex', gap: 40, paddingBottom: 26 }}>
        <div style={{ flex: 1 }}>
          <div style={partyLabel}>Kepada</div>
          <div style={partyName}>{dash(invoice.clientName)}</div>
          <div style={partySub}>{billingTypeLabel(invoice.billingType)}</div>
        </div>
        {/* Tanpa alamat rekaan: data alamat belum tersedia di sistem. */}
        <div style={{ width: 260 }}>
          <div style={partyLabel}>Dari</div>
          <div style={partyName}>Livou Konveksi</div>
          <div style={partySub}>Garment Production</div>
        </div>
      </section>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thLeft}>Item</th>
            <th style={thCenter}>Kuantitas</th>
            <th style={thRight}>Harga</th>
            <th style={thRight}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdLeft}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{dash(workOrder?.product)}</div>
              {variation && <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{variation}</div>}
            </td>
            <td style={tdCenter}>{dash(quantity)}</td>
            <td style={tdRight}>{formatCurrency(invoice.unitPrice)}</td>
            <td style={tdRight}>{formatCurrency(invoice.totalAmount)}</td>
          </tr>
        </tbody>
      </table>

      {/* Ringkasan hanya memuat nilai yang benar-benar ada di data. Ongkos
          kirim dan diskon sengaja tidak ditulis karena tidak ada field-nya. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
        <div style={{ width: 300 }}>
          <div style={summaryRow}>
            <span style={summaryLabel}>Subtotal</span>
            <span style={summaryValue}>{formatCurrency(invoice.totalAmount)}</span>
          </div>
          <div style={{ ...summaryRow, borderTop: `1px solid ${RULE_STRONG}`, marginTop: 8, paddingTop: 10 }}>
            <span style={{ ...summaryLabel, color: INK, fontSize: 14, fontWeight: 700 }}>Total</span>
            <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {formatCurrency(invoice.totalAmount)}
            </span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <footer
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 40,
          borderTop: `1px solid ${RULE}`,
          paddingTop: 22,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={partyLabel}>Metode Pembayaran</div>
          {/* Placeholder aman: detail rekening resmi belum tersedia di sistem. */}
          <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>
            <div>Bank: BCA</div>
            <div>No. Rekening: •••• •••• ••••</div>
            <div>Atas Nama: ••••••••</div>
          </div>
        </div>

        {/* Tanpa tanda tangan rekaan: hanya nama badan usaha yang nyata. */}
        <div style={{ width: 240, textAlign: 'right' }}>
          <div style={partyLabel}>Hormat Kami,</div>
          <div style={{ height: 34 }} />
          <div style={{ borderTop: `1px solid ${RULE_STRONG}`, paddingTop: 6, marginLeft: 'auto' }}>
            <span style={{ fontSize: 14 }}>Livou Konveksi</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

const monogram: React.CSSProperties = {
  width: 96,
  height: 96,
  boxSizing: 'border-box',
  border: `1px solid ${INK}`,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'Georgia, serif',
  fontSize: 26,
  letterSpacing: 1,
  lineHeight: 1,
  color: INK,
};

const title: React.CSSProperties = {
  fontFamily: SERIF,
  fontSize: 50,
  letterSpacing: 9,
  lineHeight: 1,
  marginTop: 20,
  color: INK,
};

const partyLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.4,
  marginBottom: 7,
};
const partyName: React.CSSProperties = { fontSize: 15, lineHeight: 1.4 };
const partySub: React.CSSProperties = { fontSize: 12, lineHeight: 1.4, marginTop: 4, color: MUTED };

const thBase: React.CSSProperties = {
  padding: '0 0 9px',
  borderBottom: `1px solid ${RULE_STRONG}`,
  fontSize: 12.5,
  fontWeight: 700,
  lineHeight: 1.35,
};
const thLeft: React.CSSProperties = { ...thBase, textAlign: 'left' };
const thCenter: React.CSSProperties = { ...thBase, textAlign: 'center' };
const thRight: React.CSSProperties = { ...thBase, textAlign: 'right' };

const tdBase: React.CSSProperties = {
  padding: '14px 0',
  borderBottom: `1px solid ${RULE}`,
  fontSize: 13,
  verticalAlign: 'top',
};
const tdLeft: React.CSSProperties = { ...tdBase, textAlign: 'left' };
const tdCenter: React.CSSProperties = { ...tdBase, textAlign: 'center', fontFamily: SANS };
const tdRight: React.CSSProperties = { ...tdBase, textAlign: 'right', whiteSpace: 'nowrap', fontFamily: SANS };

const summaryRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 16,
  fontSize: 13,
  lineHeight: 1.5,
};
const summaryLabel: React.CSSProperties = { color: MUTED };
const summaryValue: React.CSSProperties = { fontFamily: SANS, whiteSpace: 'nowrap' };
