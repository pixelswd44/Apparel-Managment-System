import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Download, FileSpreadsheet, FileText, RefreshCw,
  TrendingUp, TrendingDown, Wallet, Filter,
} from 'lucide-react';
import api from '../lib/api';
import PeriodPicker from '../components/PeriodPicker';

const pkr  = n => `Rs${Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

export default function Ledger() {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [section,     setSection]     = useState('All');
  const [search,      setSearch]      = useState('');
  const [periodRange, setPeriodRange] = useState({ from: null, to: null, label: 'All Time' });
  const tableRef = useRef();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = periodRange.from ? { from: periodRange.from, to: periodRange.to } : {};
      const { data: res } = await api.get('/financials/ledger', { params });
      setData(res);
    } catch {}
    finally { setLoading(false); }
  }, [periodRange.from, periodRange.to]);

  useEffect(() => { load(); }, [load]);

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const rows = (data?.ledger || []).filter(e => {
    if (section !== 'All' && e.section !== section) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (e.description || '').toLowerCase().includes(q)
          || (e.party       || '').toLowerCase().includes(q)
          || (e.category    || '').toLowerCase().includes(q)
          || (e.reference   || '').toLowerCase().includes(q);
    }
    return true;
  });

  const summary = data?.summary || {};

  // ── Export Excel ──────────────────────────────────────────────────────────
  function exportExcel() {
    const wsData = [
      ['Date', 'Section', 'Category', 'Description', 'Party', 'Reference', 'Credit (In)', 'Debit (Out)', 'Balance'],
      ...rows.map(e => [
        fmtD(e.date), e.section, e.category, e.description, e.party, e.reference || '',
        e.credit > 0 ? e.credit : '', e.debit > 0 ? e.debit : '', e.balance,
      ]),
      [],
      ['SUMMARY'],
      ['Total Income (Credits)', '', '', '', '', '', summary.totalCredit || 0],
      ['Total Expenses (Debits)', '', '', '', '', '', '', summary.totalDebit || 0],
      ['Net Balance', '', '', '', '', '', '', '', summary.netBalance || 0],
    ];

    // Section breakdown
    if (summary.bySection) {
      wsData.push([]);
      wsData.push(['Section Breakdown', '', 'Credits', 'Debits', 'Net']);
      for (const [sec, vals] of Object.entries(summary.bySection)) {
        wsData.push([sec, '', vals.credit, vals.debit, vals.credit - vals.debit]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = [
      { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 35 },
      { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
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
        ? Object.entries(summary.bySection).map(([sec, v]) => [sec, v.credit, v.debit, v.credit - v.debit])
        : []),
      [],
      ['TOTAL', summary.totalCredit || 0, summary.totalDebit || 0, summary.netBalance || 0],
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
      head: [['Date', 'Section', 'Category', 'Description', 'Party', 'Credit (In)', 'Debit (Out)', 'Balance']],
      body: rows.map(e => [
        fmtD(e.date), e.section, e.category,
        e.description || '', e.party || '',
        e.credit > 0 ? pkr(e.credit) : '—',
        e.debit  > 0 ? pkr(e.debit)  : '—',
        pkr(e.balance),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 26 },
        2: { cellWidth: 28 },
        3: { cellWidth: 55 },
        4: { cellWidth: 30 },
        5: { cellWidth: 25, halign: 'right', textColor: [5, 150, 105] },
        6: { cellWidth: 25, halign: 'right', textColor: [220, 38, 38] },
        7: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: 14, right: 14 },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 7) {
          const bal = rows[data.row.index]?.balance || 0;
          data.cell.styles.textColor = bal >= 0 ? [5, 150, 105] : [220, 38, 38];
        }
      },
    });

    doc.save(`Ledger_${periodRange.label || 'AllTime'}.pdf`);
  }

  return (
    <div className="animate-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ledger</h1>
          <p className="text-sm text-slate-500 mt-0.5">Full transaction history with running balance</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 bg-white rounded-xl text-slate-600 hover:border-indigo-300 font-medium">
            <RefreshCw size={14} />
          </button>
          <button onClick={exportExcel} disabled={!data}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold disabled:opacity-50 transition-colors">
            <FileSpreadsheet size={14} /> Export Excel
          </button>
          <button onClick={exportPDF} disabled={!data}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold disabled:opacity-50 transition-colors">
            <FileText size={14} /> Export PDF
          </button>
        </div>
      </div>

      {/* Period Picker */}
      <div className="mb-5">
        <PeriodPicker onChange={range => setPeriodRange(range)} />
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 mb-2">
              <TrendingUp size={13} /> Total Income
            </div>
            <p className="text-lg sm:text-2xl font-black text-emerald-700 break-all">{pkr(summary.totalCredit)}</p>
            <p className="text-xs text-emerald-500 mt-1">All payments received</p>
          </div>

          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-600 mb-2">
              <TrendingDown size={13} /> Total Expenses
            </div>
            <p className="text-lg sm:text-2xl font-black text-rose-700 break-all">{pkr(summary.totalDebit)}</p>
            <p className="text-xs text-rose-500 mt-1">All costs paid out</p>
          </div>

          <div className={`border rounded-2xl p-4 ${(summary.netBalance||0) >= 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-rose-50 border-rose-200'}`}>
            <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2 ${(summary.netBalance||0) >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
              <Wallet size={13} /> Net Balance
            </div>
            <p className={`text-lg sm:text-2xl font-black break-all ${(summary.netBalance||0) >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
              {(summary.netBalance||0) >= 0 ? '' : '−'}{pkr(Math.abs(summary.netBalance||0))}
            </p>
            <p className="text-xs text-slate-400 mt-1">Income − Expenses</p>
          </div>

          {/* Section breakdown mini-card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">By Section</p>
            <div className="space-y-1">
              {summary.bySection && Object.entries(summary.bySection).map(([sec, v]) => (
                <div key={sec} className="flex justify-between text-xs">
                  <span className={`font-semibold px-1.5 py-0.5 rounded ${SECTION_COLORS[sec] || 'text-slate-600 bg-slate-50'}`}>{sec}</span>
                  <span className={`font-bold ${v.credit > v.debit ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {v.credit > 0 ? `+${pkr(v.credit)}` : `−${pkr(v.debit)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto scrollbar-hide flex-shrink-0">
          {SECTIONS.map(s => (
            <button key={s} onClick={() => setSection(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex-shrink-0
                ${section === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search description, party…"
            className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 w-full" />
        </div>
        <span className="text-xs text-slate-400 text-right sm:ml-auto">{rows.length} entries</span>
      </div>

      {/* Table — desktop */}
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
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Section</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Party</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-emerald-500 uppercase tracking-wider">Credit (In)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-rose-500 uppercase tracking-wider">Debit (Out)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((e, i) => (
                  <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtD(e.date)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SECTION_COLORS[e.section] || 'text-slate-600 bg-slate-100'}`}>
                        {e.section}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{e.category}</td>
                    <td className="px-4 py-3 text-sm text-slate-800 font-medium max-w-xs truncate">{e.description}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[140px] truncate">{e.party || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {e.credit > 0 ? <span className="font-bold text-emerald-600">{pkr(e.credit)}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.debit > 0 ? <span className="font-bold text-rose-500">{pkr(e.debit)}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`px-4 py-3 text-right font-black ${e.balance >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
                      {e.balance >= 0 ? '' : '−'}{pkr(Math.abs(e.balance))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td colSpan={5} className="px-4 py-3 text-sm font-bold text-slate-700">Total</td>
                  <td className="px-4 py-3 text-right font-black text-emerald-600">{pkr(rows.reduce((s,e)=>s+e.credit,0))}</td>
                  <td className="px-4 py-3 text-right font-black text-rose-500">{pkr(rows.reduce((s,e)=>s+e.debit,0))}</td>
                  <td className={`px-4 py-3 text-right font-black ${(rows[rows.length-1]?.balance||0) >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
                    {pkr(rows[rows.length-1]?.balance || 0)}
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
                    {e.party && <p className="text-xs text-slate-400 truncate">{e.party}</p>}
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
