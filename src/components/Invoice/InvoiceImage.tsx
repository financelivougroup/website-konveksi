import type { InvoicePaymentRow, InvoiceRow } from '@/types/pipeline';

interface InvoiceImageProps {
  invoice: InvoiceRow;
  payments: InvoicePaymentRow[];
  totalPayment: number;
  outstanding: number;
}

const formatCurrency = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

const billingTypeLabel = (bt: InvoiceRow['billingType']) =>
  bt === 'mass_production' ? 'Mass Production' : 'Sample Production';

export function InvoiceImage({ invoice, payments, totalPayment, outstanding }: InvoiceImageProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: -9999,
        top: 0,
        width: 800,
        background: '#ffffff',
        color: '#0f172a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '40px 48px',
        boxSizing: 'border-box',
      }}
    >
      <header style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Livou Konveksi</h1>
      </header>

      <section style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <Row label="Kode Invoice" value={invoice.invoiceCode} />
          <Row label="Tgl Invoice" value={invoice.invoiceDate} />
          <Row label="Bulan Tahun" value={invoice.monthYear} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <Row label="Nama Client" value={invoice.clientName} />
          <Row label="Jenis Tagihan" value={billingTypeLabel(invoice.billingType)} />
        </div>
      </section>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          marginBottom: 24,
        }}
      >
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={th}>Work Code</th>
            <th style={th}>Produk</th>
            <th style={th}>Warna</th>
            <th style={th}>Size</th>
            <th style={thRight}>PCS</th>
            <th style={thRight}>Nominal/PCS</th>
            <th style={thRight}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>{invoice.invoiceCode}</td>
            <td style={td}>{invoice.clientName}</td>
            <td style={td}>—</td>
            <td style={td}>—</td>
            <td style={tdRight}>{invoice.pcsLinked}</td>
            <td style={tdRight}>{formatCurrency(invoice.unitPrice)}</td>
            <td style={tdRight}>{formatCurrency(invoice.totalAmount)}</td>
          </tr>
        </tbody>
      </table>

      <section style={{ marginBottom: 24, fontSize: 13 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>Rincian Keuangan</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <Row label="Total Income Manpower" value={formatCurrency(invoice.totalIncomeManpower)} />
          <Row label="Total Income Operational" value={formatCurrency(invoice.totalIncomeOperational)} />
        </div>
      </section>

      <section style={{ marginBottom: 24, fontSize: 13 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>Pembayaran</h3>
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6 }}>
          <p style={{ margin: '0 0 6px' }}>
            <strong>Rekening:</strong> BCA xxxxx a.n. JAN CHUN SIONG
          </p>
          {payments.length === 0 ? (
            <p style={{ margin: 0, color: '#64748b', fontStyle: 'italic' }}>Belum ada payment.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {payments.map((p) => (
                <li key={p.id}>
                  {p.paymentType === 'cash'
                    ? `Cash · ${p.paymentDate} · ${formatCurrency(p.amount)}`
                    : `Termin ${p.terminNo ?? '-'} · ${p.paymentDate} · ${formatCurrency(p.amount)}`}
                </li>
              ))}
            </ul>
          )}
          <p style={{ margin: '8px 0 0', borderTop: '1px solid #cbd5e1', paddingTop: 6 }}>
            <strong>Total Pembayaran:</strong> {formatCurrency(totalPayment)}
          </p>
          <p style={{ margin: '4px 0 0' }}>
            <strong>Outstanding:</strong> {formatCurrency(outstanding)}
          </p>
        </div>
      </section>

      <footer style={{ marginTop: 32, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
        Invoice ini dihasilkan otomatis oleh sistem Livou Konveksi.
      </footer>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '1px solid #cbd5e1',
  fontWeight: 600,
};
const thRight: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '1px solid #e2e8f0',
};
const tdRight: React.CSSProperties = { ...td, textAlign: 'right' };

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}