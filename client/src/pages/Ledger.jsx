import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Download, FileSpreadsheet, FileText, SlidersHorizontal,
  Filter, Pencil, Check, X,
} from 'lucide-react';
import api from '../lib/api';
import PeriodPicker, { currentMonthRange } from '../components/PeriodPicker';
import { pkr, convert, displayCurrency } from '../lib/currency';

const fmtD = d => {
  if (!d) return '—';
  // Handle SQLite "YYYY-MM-DD HH:MM:SS" (space-separated) and ISO "YYYY-MM-DDTHH:MM:SS"
  const iso = d.includes('T') ? d : d.replace(' ', 'T');
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const SECTION_COLORS = {
  'Income':            'text-emerald-600 bg-emerald-50',
  'Project Costs':     'text-rose-600    bg-rose-50',
  'Business Expenses': 'text-orange-600  bg-orange-50',
  'Salaries':          'text-blue-600    bg-blue-50',
  'Opening Balance':   'text-violet-600  bg-violet-50',
};

const SECTIONS = ['All', 'Income', 'Project Costs', 'Business Expenses', 'Salaries'];

// Returns 'YYYY-MM' when the range is exactly one full calendar month, else null.
function monthKeyOf({ from, to }) {
  if (!from || !to) return null;
  const d = new Date(from + 'T00:00:00');
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const expectedTo = `${from.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
  return (from.slice(8) === '01' && to === expectedTo) ? from.slice(0, 7) : null;
}

export default function Ledger() {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [section,     setSection]     = useState('All');
  const [search,      setSearch]      = useState('');
  const [periodRange, setPeriodRange] = useState(currentMonthRange());
  const [editingOpening, setEditingOpening] = useState(false);
  const [openingInput,   setOpeningInput]   = useState('');
  const [savingOpening,  setSavingOpening]  = useState(false);
  const [showFilters,    setShowFilters]    = useState(false);
  const [showExport,     setShowExport]     = useState(false);
  const tableRef = useRef();

  const monthKey = monthKeyOf(periodRange);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = periodRange.from ? { from: periodRange.from, to: periodRange.to } : {};
      const { data: res } = await api.get('/financials/ledger', { params });
      setData(res);
    } catch {}
    finally { setLoading(false); }
  }, [periodRange.from, periodRange.to]);

  useEffect(() => { setEditingOpening(false); }, [periodRange.from, periodRange.to]);

  async function saveOpening() {
    if (!monthKey || openingInput === '') return;
    setSavingOpening(true);
    try {
      await api.put(`/financials/monthly-opening-balances/${monthKey}`, { amount: openingInput });
      setEditingOpening(false);
      await load();
    } catch {} finally { setSavingOpening(false); }
  }

  async function clearOpening() {
    if (!monthKey) return;
    setSavingOpening(true);
    try {
      await api.delete(`/financials/monthly-opening-balances/${monthKey}`);
      setEditingOpening(false);
      await load();
    } catch {} finally { setSavingOpening(false); }
  }

  useEffect(() => { load(); }, [load]);

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const rows = (data?.ledger || []).filter(e => {
    if (section !== 'All' && e.section !== section) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (e.description || '').toLowerCase().includes(q)
          || (e.paid_to     || '').toLowerCase().includes(q)
          || (e.paid_by     || '').toLowerCase().includes(q)
          || (e.category    || '').toLowerCase().includes(q)
          || (e.reference   || '').toLowerCase().includes(q);
    }
    return true;
  });

  const summary = data?.summary || {};

  // ── Export Excel ──────────────────────────────────────────────────────────
  function exportExcel() {
    const wsData = [
      ['Date', 'Section', 'Category', 'Description', 'Paid To', 'Paid By', 'Reference', `Credit (In) ${displayCurrency().code}`, `Debit (Out) ${displayCurrency().code}`, 'Balance'],
      ...rows.map(e => [
        fmtD(e.date), e.section, e.category, e.description, e.paid_to || '', e.paid_by || '', e.reference || '',
        e.credit > 0 ? convert(e.credit) : '', e.debit > 0 ? convert(e.debit) : '', convert(e.balance),
      ]),
      [],
      ['SUMMARY'],
      ['Total Income (Credits)', '', '', '', '', '', '', convert(summary.totalCredit)],
      ['Total Expenses (Debits)', '', '', '', '', '', '', '', convert(summary.totalDebit)],
      ['Net Balance', '', '', '', '', '', '', '', '', convert(summary.netBalance)],
    ];

    // Section breakdown
    if (summary.bySection) {
      wsData.push([]);
      wsData.push(['Section Breakdown', '', 'Credits', 'Debits', 'Net']);
      for (const [sec, vals] of Object.entries(summary.bySection)) {
        wsData.push([sec, '', convert(vals.credit), convert(vals.debit), convert(vals.credit - vals.debit)]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = [
      { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 35 },
      { wch: 22 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');

    // Summary sheet
    const sumData = [
      ['Financial Ledger Summary'],
      ['Period', periodRange.label || 'All Time'],
      [],
      ['Category', 'Credits (In)', 'Debits (Out)', 'Net'],
      ...(summary.bySection
        ? Object.entries(summary.bySection).map(([sec, v]) => [sec, convert(v.credit), convert(v.debit), convert(v.credit - v.debit)])
        : []),
      [],
      ['TOTAL', convert(summary.totalCredit), convert(summary.totalDebit), convert(summary.netBalance)],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(sumData);
    ws2['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

    XLSX.writeFile(wb, `Ledger_${periodRange.label || 'AllTime'}.xlsx`);
  }

  // ── Export PDF ────────────────────────────────────────────────────────────
  function exportPDF() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Header
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text('Financial Ledger', 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Period: ${periodRange.label || 'All Time'}`, 14, 26);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, 14, 32);

    // Summary boxes
    const s = summary;
    doc.setFontSize(9);
    const boxes = [
      { label: 'Total Income',   val: pkr(s.totalCredit),  color: [209, 250, 229] },
      { label: 'Total Expenses', val: pkr(s.totalDebit),   color: [254, 226, 226] },
      { label: 'Net Balance',    val: pkr(s.netBalance),   color: (s.netBalance||0) >= 0 ? [219, 234, 254] : [254, 226, 226] },
    ];
    boxes.forEach((b, i) => {
      const x = 14 + i * 90;
      doc.setFillColor(...b.color);
      doc.roundedRect(x, 38, 85, 16, 3, 3, 'F');
      doc.setTextColor(71, 85, 105);
      doc.text(b.label, x + 4, 44);
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(b.val, x + 4, 51);
      doc.setFontSize(9);
    });

    // Section breakdown
    if (s.bySection) {
      autoTable(doc, {
        startY: 60,
        head: [['Section', 'Credits (In)', 'Debits (Out)', 'Net']],
        body: Object.entries(s.bySection).map(([sec, v]) => [
          sec, pkr(v.credit), pkr(v.debit),
          `${(v.credit - v.debit) >= 0 ? '+' : ''}${pkr(v.credit - v.debit)}`,
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [99, 102, 241], textColor: 255 },
        columnStyles: { 0: { fontStyle: 'bold' }, 3: { fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
        tableWidth: 150,
      });
    }

    const afterSummary = doc.lastAutoTable?.finalY || 90;

    // Ledger table
    autoTable(doc, {
      startY: afterSummary + 8,
      head: [['Date', 'Section', 'Category', 'Description', 'Paid To', 'Paid By', 'Credit (In)', 'Debit (Out)', 'Balance']],
      body: rows.map(e => [
        fmtD(e.date), e.section, e.category,
        e.description || '', e.paid_to || '', e.paid_by || '',
        e.credit > 0 ? pkr(e.credit) : '—',
        e.debit  > 0 ? pkr(e.debit)  : '—',
        pkr(e.balance),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 24 },
        2: { cellWidth: 24 },
        3: { cellWidth: 46 },
        4: { cellWidth: 26 },
        5: { cellWidth: 26 },
        6: { cellWidth: 24, halign: 'right', textColor: [5, 150, 105] },
        7: { cellWidth: 24, halign: 'right', textColor: [220, 38, 38] },
        8: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: 14, right: 14 },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 8) {
          const bal = rows[data.row.index]?.balance || 0;
          data.cell.styles.textColor = bal >= 0 ? [5, 150, 105] : [220, 38, 38];
        }
      },
    });

    doc.save(`Ledger_${periodRange.label || 'AllTime'}.pdf`);
  }

  const net = summary.netBalance || 0;
  const income = (summary.totalCredit || 0) - (summary.openingBalance || 0);
  const showOpening = monthKey || summary.openingBalance;
  const activeFilters = section !== 'All' ? 1 : 0;

  return (
    <div className="animate-page">
      {/* Header — stays on top while scrolling */}
      <div className="sticky top-[57px] lg:top-0 z-10 bg-[#f2f2f7] flex items-center justify-between gap-3 mb-3 py-2 -mt-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">Ledger</h1>
          <p className="text-sm text-slate-500 mt-0.5 truncate">{periodRange.label || 'All time'}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm border rounded-xl font-medium transition-colors ${
              showFilters ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'}`}>
            <SlidersHorizontal size={14} /> <span className="hidden sm:inline">Filters</span>
            {activeFilters > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-2xs font-bold flex items-center justify-center">{activeFilters}</span>}
          </button>
          <div className="relative">
            <button onClick={() => setShowExport(v => !v)} disabled={!data} title="Export"
              className="flex items-center gap-1.5 px-3.5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold disabled:opacity-50 transition-colors">
              <Download size={14} /> <span className="hidden sm:inline">Export</span>
            </button>
            {showExport && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowExport(false)} />
                <div className="absolute right-0 mt-1.5 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-30 overflow-hidden">
                  <button onClick={() => { exportExcel(); setShowExport(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                    <FileSpreadsheet size={14} className="text-emerald-600" /> Excel
                  </button>
                  <button onClick={() => { exportPDF(); setShowExport(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 border-t border-slate-100">
                    <FileText size={14} className="text-rose-600" /> PDF
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filters — hidden, not unmounted, so the period picker keeps its state */}
      <div className={`${showFilters ? '' : 'hidden'} bg-white border border-slate-200 rounded-2xl p-4 mb-3 shadow-sm space-y-4`}>
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2">Period</p>
          <PeriodPicker defaultMode="month" onChange={range => setPeriodRange(range)} />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2">Type</p>
          <div className="flex flex-wrap gap-1.5">
            {SECTIONS.map(sec => (
              <button key={sec} onClick={() => setSection(sec)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${section === sec ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700'}`}>{sec}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary — one slim strip */}
      {data && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-3 grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100">
          {showOpening && (
            <div className="px-4 py-3 col-span-2 sm:col-span-1 !border-t-0">
              <div className="flex items-center justify-between text-2xs font-semibold uppercase tracking-wider text-slate-400">
                Opening
                {monthKey && !editingOpening && (
                  <button onClick={() => { setOpeningInput(summary.openingBalance ? String(summary.openingBalance) : ''); setEditingOpening(true); }}
                    className="text-slate-300 hover:text-indigo-600" title="Set opening balance for this month"><Pencil size={11} /></button>
                )}
              </div>
              {editingOpening ? (
                <div className="mt-1 flex items-center gap-1">
                  <input type="number" step="1" autoFocus value={openingInput} onChange={e => setOpeningInput(e.target.value)} placeholder="Amount"
                    className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  <button onClick={saveOpening} disabled={savingOpening || openingInput === ''} className="p-1.5 bg-indigo-600 text-white rounded-lg disabled:opacity-50"><Check size={12} /></button>
                  <button onClick={() => setEditingOpening(false)} className="p-1.5 border border-slate-200 text-slate-500 rounded-lg"><X size={12} /></button>
                  {summary.openingManual && <button onClick={clearOpening} disabled={savingOpening} className="text-2xs text-rose-500 font-semibold px-1">Reset</button>}
                </div>
              ) : (
                <p className="text-base font-bold text-slate-800 tabular-nums mt-0.5">
                  {(summary.openingBalance || 0) < 0 ? '−' : ''}{pkr(Math.abs(summary.openingBalance || 0))}
                </p>
              )}
            </div>
          )}
          <div className="px-4 py-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-slate-400">In</p>
            <p className="text-base font-bold text-emerald-600 tabular-nums mt-0.5">{pkr(income)}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-slate-400">Out</p>
            <p className="text-base font-bold text-rose-500 tabular-nums mt-0.5">{pkr(summary.totalDebit)}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-slate-400">Balance</p>
            <p className={`text-base font-bold tabular-nums mt-0.5 ${net >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>{net < 0 ? '−' : ''}{pkr(Math.abs(net))}</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Filter size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${rows.length} entries…`}
          className="pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 w-full" />
      </div>

      {/* Table card — filters live in its toolbar */}
      <div className="hidden sm:block bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-7 h-7 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-slate-500 font-semibold">No entries found</p>
            <p className="text-slate-400 text-sm mt-1">{search ? 'Try clearing the search' : 'No transactions in this period'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto" ref={tableRef}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Entry</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Paid To</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Paid By</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-emerald-600 uppercase tracking-wider">In</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-rose-600 uppercase tracking-wider">Out</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((e, i) => {
                  const dot = (SECTION_COLORS[e.section] || 'text-slate-500').split(' ')[0].replace('text-', 'bg-');
                  return (
                    <tr key={i} className={`hover:bg-indigo-50/40 transition-colors `}>
                      <td className="px-4 py-3 text-xs text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap tabular-nums">{fmtD(e.date)}</td>
                      <td className="px-4 py-3 max-w-md">
                        <p className="text-sm text-slate-800 font-medium truncate">{e.description}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-[160px] truncate">{e.paid_to || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-[160px] truncate">{e.paid_by || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block text-2xs font-semibold px-2 py-0.5 rounded-full ${SECTION_COLORS[e.section] || 'text-slate-600 bg-slate-100'}`}>
                          {e.isOpeningBalance ? 'Opening' : (e.category && e.category !== e.section ? e.category : e.section)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {e.credit > 0 ? <span className="font-bold text-emerald-600">+{pkr(e.credit)}</span> : <span className="text-slate-200">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {e.debit > 0 ? <span className="font-bold text-rose-500">−{pkr(e.debit)}</span> : <span className="text-slate-200">—</span>}
                      </td>
                      <td className={`px-4 py-3 text-right font-black tabular-nums ${e.balance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                        {e.balance >= 0 ? '' : '−'}{pkr(Math.abs(e.balance))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-white border-t-2 border-slate-300 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
                  <td colSpan={6} className="px-4 py-3 text-sm font-bold text-slate-700">Period total</td>
                  <td className="px-4 py-3 text-right font-black text-emerald-600 tabular-nums">+{pkr(rows.reduce((s,e)=>s+e.credit,0))}</td>
                  <td className="px-4 py-3 text-right font-black text-rose-500 tabular-nums">−{pkr(rows.reduce((s,e)=>s+e.debit,0))}</td>
                  <td className={`px-4 py-3 text-right font-black tabular-nums ${(rows[rows.length-1]?.balance||0) >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
                    {(rows[rows.length-1]?.balance||0) >= 0 ? '' : '−'}{pkr(Math.abs(rows[rows.length-1]?.balance || 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Cards — mobile */}
      <div className="sm:hidden space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center bg-white border border-slate-200 rounded-2xl">
            <p className="text-slate-500 font-semibold">No entries found</p>
            <p className="text-slate-400 text-sm mt-1">{search ? 'Try clearing the search' : 'No transactions in this period'}</p>
          </div>
        ) : (
          <>
            {rows.map((e, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{e.description}</p>
                    {(e.paid_to || e.paid_by) && (
                      <p className="text-xs text-slate-400 truncate">
                        {e.paid_to && <>To: <span className="text-slate-600">{e.paid_to}</span></>}
                        {e.paid_to && e.paid_by && ' · '}
                        {e.paid_by && <>By: <span className="text-slate-600">{e.paid_by}</span></>}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {e.credit > 0
                      ? <p className="text-sm font-black text-emerald-600">+{pkr(e.credit)}</p>
                      : <p className="text-sm font-black text-rose-500">−{pkr(e.debit)}</p>}
                    <p className={`text-xs font-bold ${e.balance >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>
                      Bal: {e.balance >= 0 ? '' : '−'}{pkr(Math.abs(e.balance))}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-2xs text-slate-400">{fmtD(e.date)}</span>
                  <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full ${SECTION_COLORS[e.section] || 'text-slate-600 bg-slate-100'}`}>
                    {e.section}
                  </span>
                  {e.category && <span className="text-2xs text-slate-500">{e.category}</span>}
                </div>
              </div>
            ))}
            {/* Mobile totals */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex justify-between">
              <div>
                <p className="text-2xs text-slate-400 uppercase font-bold">Total In</p>
                <p className="text-sm font-black text-emerald-600">{pkr(rows.reduce((s,e)=>s+e.credit,0))}</p>
              </div>
              <div className="text-center">
                <p className="text-2xs text-slate-400 uppercase font-bold">Total Out</p>
                <p className="text-sm font-black text-rose-500">{pkr(rows.reduce((s,e)=>s+e.debit,0))}</p>
              </div>
              <div className="text-right">
                <p className="text-2xs text-slate-400 uppercase font-bold">Balance</p>
                <p className={`text-sm font-black ${(rows[rows.length-1]?.balance||0) >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
                  {pkr(rows[rows.length-1]?.balance || 0)}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
