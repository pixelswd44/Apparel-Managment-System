import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Monthly report export (Ledger → Monthly Report) — built from
// GET /financials/monthly-report. Everything is stored in PKR, so the report is
// always in PKR ("Rs" — the PDF's built-in font has no ₨ glyph).

const rs = v => {
  const n = parseFloat(v) || 0;
  return `${n < 0 ? '-' : ''}Rs ${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};
const fmtDate = d => {
  if (!d) return '';
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00');
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const monthLabel = month => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
// Short payment method for the PDF's narrow column
const METHOD_SHORT = { 'bank transfer': 'Bank' };
const shortMethod = m => cap(METHOD_SHORT[m] || m);

// P&L rows shared by the PDF and the Excel summary
function plRows(s) {
  return [
    ['Client payments received', s.invoiceRevenue],
    ['Other income', s.otherIncome],
    ['Total income', s.totalIncome, 'total'],
    ['Business expenses', s.businessExpenses],
    ['Project costs (incl. shipping)', s.projectCosts],
    ['Salaries (payroll)', s.salaries],
    ['Total spending', s.totalSpending, 'total'],
    [s.net >= 0 ? 'Net profit' : 'Net loss', s.net, 'net'],
  ];
}

const spendingRow = r => [fmtDate(r.date), r.title || '', r.category || '', r.paid_to || '', r.project || '', shortMethod(r.method), rs(r.amount)];
const fileBase = data => `Monthly_Report_${data.month}`;

export function exportMonthlyPDF(data) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const s = data.summary;
  const ink = [15, 23, 42], muted = [100, 116, 139];
  const head = { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' };
  const next = () => doc.lastAutoTable.finalY + 9;
  const table = opts => autoTable(doc, { showFoot: 'lastPage', rowPageBreak: 'avoid', margin: { bottom: 16 }, ...opts });
  const section = (title, y) => {
    if (y > 260) { doc.addPage(); y = 18; }
    doc.setFontSize(11); doc.setTextColor(...ink); doc.setFont(undefined, 'bold');
    doc.text(title, 14, y);
    doc.setFont(undefined, 'normal');
    return y + 3;
  };

  // Header
  doc.setFontSize(18); doc.setTextColor(...ink); doc.setFont(undefined, 'bold');
  doc.text('Monthly Report', 14, 18);
  doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.setTextColor(...muted);
  doc.text([data.company_name, monthLabel(data.month)].filter(Boolean).join('  ·  '), 14, 25);
  doc.text(`Generated ${fmtDate(new Date().toISOString())}  ·  All amounts in PKR`, 14, 31);

  // Profit & loss
  table({
    startY: section('Profit & Loss', 41),
    body: plRows(s).map(([label, v]) => [label, rs(v)]),
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2.2 },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: c => {
      const kind = plRows(s)[c.row.index]?.[2];
      if (kind) { c.cell.styles.fontStyle = 'bold'; c.cell.styles.fillColor = kind === 'net' ? (s.net >= 0 ? [219, 234, 254] : [254, 226, 226]) : [248, 250, 252]; }
    },
  });

  // Spending by category
  if (data.byCategory.length) {
    table({
      startY: section('Spending by Category', next()),
      head: [['Category', 'Amount', 'Share']],
      body: data.byCategory.map(c => [c.category, rs(c.total), s.totalSpending > 0 ? `${((c.total / s.totalSpending) * 100).toFixed(1)}%` : '']),
      headStyles: head, styles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    });
  }

  // Income
  if (data.payments.length) {
    table({
      startY: section('Client Payments', next()),
      head: [['Date', 'Client', 'Invoice', 'Amount', 'PKR']],
      body: data.payments.map(p => [fmtDate(p.date), p.client_name || '', p.invoice_number || '',
        p.currency === 'PKR' ? '' : `${p.currency} ${(parseFloat(p.amount) || 0).toLocaleString('en-US')}`, rs(p.pkr)]),
      foot: [['', '', '', 'Total', rs(s.invoiceRevenue)]],
      headStyles: head, footStyles: head, styles: { fontSize: 9 },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
  }
  if (data.otherIncome.length) {
    table({
      startY: section('Other Income', next()),
      head: [['Date', 'Title', 'Category', 'Amount']],
      body: data.otherIncome.map(r => [fmtDate(r.date), r.title || '', r.category || '', rs(r.amount)]),
      foot: [['', '', 'Total', rs(s.otherIncome)]],
      headStyles: head, footStyles: head, styles: { fontSize: 9 },
      columnStyles: { 3: { halign: 'right' } },
    });
  }

  // Every expense line
  table({
    startY: section(`All Expenses (${data.spending.length})`, next()),
    head: [['Date', 'Title', 'Category', 'Paid To', 'Project', 'Method', 'Amount']],
    body: data.spending.length ? data.spending.map(spendingRow) : [['No expenses this month', '', '', '', '', '', '']],
    foot: [['', '', '', '', '', 'Total', rs(s.totalSpending)]],
    headStyles: head, footStyles: head, styles: { fontSize: 8, cellPadding: 1.6 },
    columnStyles: { 0: { cellWidth: 20 }, 2: { cellWidth: 26 }, 3: { cellWidth: 26 }, 4: { cellWidth: 30 }, 5: { cellWidth: 14 }, 6: { halign: 'right', cellWidth: 23 } },
  });

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...muted);
    doc.text(`Monthly Report — ${monthLabel(data.month)}`, 14, 290);
    doc.text(`Page ${i} of ${pages}`, 196, 290, { align: 'right' });
  }
  doc.save(`${fileBase(data)}.pdf`);
}

export function exportMonthlyExcel(data) {
  const s = data.summary;
  const wb = XLSX.utils.book_new();
  const num = v => Math.round((parseFloat(v) || 0) * 100) / 100;

  const summary = [
    ['Monthly Report', monthLabel(data.month)],
    data.company_name ? ['Company', data.company_name] : null,
    ['All amounts in PKR'],
    [],
    ['Profit & Loss', 'PKR'],
    ...plRows(s).map(([label, v]) => [label, num(v)]),
    [],
    ['Spending by Category', 'PKR', 'Share'],
    ...data.byCategory.map(c => [c.category, num(c.total), s.totalSpending > 0 ? num((c.total / s.totalSpending) * 100) / 100 : 0]),
  ].filter(Boolean);
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

  const ws2 = XLSX.utils.aoa_to_sheet([
    ['Date', 'Title', 'Category', 'Paid To', 'Project', 'Method', 'Amount (PKR)', 'Bill attached'],
    ...data.spending.map(r => [r.date, r.title || '', r.category || '', r.paid_to || '', r.project || '', cap(r.method), num(r.amount), r.receipt_url ? 'Yes' : '']),
    [],
    ['', '', '', '', '', 'Total', num(s.totalSpending)],
  ]);
  ws2['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 20 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Expenses');

  const ws3 = XLSX.utils.aoa_to_sheet([
    ['Client Payments'],
    ['Date', 'Client', 'Invoice', 'Currency', 'Amount', 'PKR'],
    ...data.payments.map(p => [p.date, p.client_name || '', p.invoice_number || '', p.currency, num(p.amount), num(p.pkr)]),
    ['', '', '', '', 'Total', num(s.invoiceRevenue)],
    [],
    ['Other Income'],
    ['Date', 'Title', 'Category', 'Method', '', 'PKR'],
    ...data.otherIncome.map(r => [r.date, r.title || '', r.category || '', cap(r.payment_method), '', num(r.amount)]),
    ['', '', '', '', 'Total', num(s.otherIncome)],
  ]);
  ws3['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Income');

  XLSX.writeFile(wb, `${fileBase(data)}.xlsx`);
}
