import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, FileText, Pencil, Trash2, Eye,
  AlertTriangle, User, X, Printer, ArrowLeft,
  MapPin, Phone, Mail, Globe, Building2,
  Landmark, MessageSquare, FileCheck, Receipt,
  Check, Download, Copy,
} from 'lucide-react';
import api from '../lib/api';
import { printDoc, downloadDoc } from '../lib/printDoc';
import TemplatePicker from '../components/TemplatePicker';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

const STATUS_CFG = {
  draft:    { label: 'Draft',    color: 'bg-slate-100 text-slate-600',     dot: 'bg-slate-400'   },
  sent:     { label: 'Sent',     color: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500'    },
  accepted: { label: 'Accepted', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', color: 'bg-rose-100 text-rose-700',       dot: 'bg-rose-500'    },
  expired:  { label: 'Expired',  color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500'   },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = d => {
  if (!d) return '—';
  // Replace SQLite space separator so all browsers parse correctly
  const dt = new Date(String(d).replace(' ', 'T'));
  if (isNaN(dt.getTime())) return '—';
  return `${String(dt.getDate()).padStart(2,'0')} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};
const fmtMoney = (v, sym = '$') => `${sym}${(parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const getSym   = code => ({ PKR: '₨', EUR: '€', GBP: '£', AED: 'د.إ' }[code] ?? '$');

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-100 transition-all duration-150 bg-white placeholder:text-slate-400';

// ── Shared UI ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function ConfirmDelete({ quotation, onConfirm, onCancel, loading, error }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-overlay">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-modal">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-rose-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Delete Quotation</h3>
            <p className="text-xs text-slate-400 mt-0.5">{quotation.number}</p>
          </div>
        </div>
        {error ? (
          <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2.5 rounded-xl flex items-start gap-2">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        ) : (
          <p className="text-slate-600 text-sm mb-5">
            Are you sure you want to permanently delete this quotation?
            {quotation.client_name && <> It was created for <span className="font-semibold text-slate-800">{quotation.client_name}</span>.</>}
            {' '}This action cannot be undone.
          </p>
        )}
        <div className="flex gap-3 mt-5">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors font-medium">
            {error ? 'Close' : 'Cancel'}
          </button>
          {!error && (
            <button onClick={onConfirm} disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-60 transition-colors font-medium">
              {loading ? 'Deleting…' : 'Yes, Delete'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Quotation View (document preview) ────────────────────────────────────────

function QuotationView({ quotationId, onClose, onEdit, onConverted, embedded = false }) {
  const navigate = useNavigate();
  const [quotation,    setQuotation]   = useState(null);
  const [settings,     setSettings]   = useState({});
  const [loading,      setLoading]    = useState(true);
  const [converting,   setConverting] = useState(false);
  const [downloading,  setDownloading] = useState(false);
  const [templates,    setTemplates]  = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const printRef = useRef();

  async function handleDownload() {
    setDownloading(true);
    try {
      const name = [quotation?.number, quotation?.client_name, quotation?.subject].filter(Boolean).join(' – ');
      await downloadDoc(printRef, name || 'Quotation');
    }
    finally { setDownloading(false); }
  }

  async function convertToInvoice() {
    if (!quotation) return;
    setConverting(true);
    try {
      const { data: inv } = await api.post('/invoices', {
        client_id:        quotation.client_id,
        quotation_id:     quotation.id,
        company_id:       quotation.company_id,
        status:           'unpaid',
        items:            quotation.items,
        tax_rate:         quotation.tax_rate,
        discount:         quotation.discount,
        notes:            quotation.notes,
        currency:         quotation.currency,
        subject:          quotation.subject,
        is_sampling:      quotation.is_sampling ? 1 : 0,
        shipping_name:    quotation.shipping_name,
        shipping_address: quotation.shipping_address,
        shipping_city:    quotation.shipping_city,
        shipping_country: quotation.shipping_country,
        shipping_phone:   quotation.shipping_phone,
        bank_details:     quotation.bank_details,
        customer_notes:   quotation.customer_notes,
        terms_conditions: quotation.terms_conditions,
      });
      // Mark quotation as accepted
      await api.patch(`/quotations/${quotation.id}/status`, { status: 'accepted' });
      onConverted?.();
      onClose();
      navigate('/invoices');
    } catch (e) {
      alert(e?.response?.data?.error ?? 'Failed to convert to invoice.');
    } finally { setConverting(false); }
  }

  useEffect(() => {
    async function load() {
      try {
        const [qRes, sRes, coRes, tplRes] = await Promise.all([
          api.get(`/quotations/${quotationId}`),
          api.get('/settings'),
          api.get('/companies'),
          api.get('/document-templates', { params: { type: 'quotation' } }),
        ]);
        setQuotation(qRes.data);
        setSettings({ ...sRes.data, _companies: coRes.data });
        const tpls = Array.isArray(tplRes.data) ? tplRes.data : [];
        setTemplates(tpls);
        setActiveTemplate(tpls.find(t => t.is_default) || tpls[0] || null);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, [quotationId]);

  if (loading) {
    return (
      <div className={embedded ? 'flex-1 flex items-center justify-center' : 'fixed inset-0 bg-black/60 flex items-center justify-center z-50'}>
        <div className={`w-8 h-8 border-2 ${embedded ? 'border-indigo-200 border-t-indigo-600' : 'border-white border-t-transparent'} rounded-full animate-spin`} />
      </div>
    );
  }
  if (!quotation) return null;

  const sym   = getSym(quotation.currency);
  let   items = [];
  try { items = JSON.parse(quotation.items || '[]'); } catch {}

  const subtotal  = items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
  const disc      = parseFloat(quotation.discount)      || 0;
  const ship      = parseFloat(quotation.shipping_cost) || 0;
  const taxable   = subtotal - disc;
  const taxAmt    = taxable * ((parseFloat(quotation.tax_rate) || 0) / 100);
  const total     = taxable + taxAmt + ship;
  const itemCount = items.length;
  const totalQty  = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);

  const companies = settings._companies || [];
  const selectedCo = (quotation.company_id && companies.find(c => c.id === quotation.company_id))
    || companies.find(c => c.is_default)
    || null;
  const co = selectedCo ? {
    name:         selectedCo.name         || '',
    logo:         selectedCo.logo         || '',
    logo_size:    selectedCo.logo_size    || 40,
    address:      selectedCo.address      || '',
    city:         selectedCo.city         || '',
    country:      selectedCo.country      || '',
    phone:        selectedCo.phone        || '',
    email:        selectedCo.email        || '',
    website:      selectedCo.website      || '',
    tax_number:   selectedCo.tax_number   || '',
    bank_details: selectedCo.bank_details || '',
  } : {
    name:    settings.company_name    || '',
    logo:    settings.company_logo    || '',
    logo_size: 40,
    address: settings.company_address || '',
    city:    settings.company_city    || '',
    country: settings.company_country || '',
    phone:   settings.company_phone   || '',
    email:   settings.company_email   || '',
    website: settings.company_website || '',
    tax_number: '',
  };

  return (
    <div className={embedded
      ? 'flex flex-col h-full print:block print:h-auto'
      : 'fixed inset-0 bg-slate-900/70 z-50 flex flex-col print:static print:inset-auto print:bg-transparent print:block print:h-auto'}>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0 print:hidden">
        {/* Left: number + status */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-mono text-sm font-semibold text-indigo-700 truncate">{quotation.number}</span>
          <StatusBadge status={quotation.status} />
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {quotation.has_invoice ? (
            <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded-lg font-semibold">
              <Check size={11} /> Invoiced
            </span>
          ) : (
            <button onClick={convertToInvoice} disabled={converting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg transition-colors font-semibold whitespace-nowrap">
              <Receipt size={12} /> {converting ? 'Converting…' : 'Convert to Invoice'}
            </button>
          )}
          <button onClick={onEdit}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold">
            <Pencil size={12} /> Edit
          </button>
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <TemplatePicker
            type="quotation"
            selected={activeTemplate}
            templates={templates}
            onSelect={setActiveTemplate}
          />
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <button title="Print" onClick={() => {
              const t = [quotation?.number, quotation?.client_name, quotation?.subject].filter(Boolean).join(' – ');
              printDoc(printRef, t || 'Quotation');
            }}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <Printer size={14} />
          </button>
          <button title={downloading ? 'Generating…' : 'Download PDF'} onClick={handleDownload} disabled={downloading}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50">
            {downloading
              ? <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin block" />
              : <Download size={14} />
            }
          </button>
          {!embedded && (
            <>
              <div className="w-px h-4 bg-slate-200 mx-0.5" />
              <button onClick={onClose} title="Close"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Scrollable document area ── */}
      <div className="flex-1 overflow-y-auto bg-slate-100 py-6 px-3 print:p-0 print:bg-white print:overflow-visible print:flex-none">
        {(() => {
          // Parse active template config
          const tplCfg = (() => { try { return typeof activeTemplate?.config === 'string' ? JSON.parse(activeTemplate.config) : (activeTemplate?.config || {}); } catch { return {}; } })();
          const tplLayout = activeTemplate?.layout || 'classic';
          const tplColor  = tplCfg.primaryColor || '#4f46e5';
          return (
        <div ref={printRef}
          className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl print:shadow-none print:rounded-none print:max-w-none overflow-hidden relative"
          data-layout={tplLayout}
          style={{ '--tp': tplColor }}
        >
          {/* Watermark */}
          {tplCfg.showWatermark && tplCfg.watermarkText && (
            <div className="doc-watermark"><span>{tplCfg.watermarkText}</span></div>
          )}
          {/* Elegant accent bar (top) */}
          <div className="doc-accent-bar hidden" />

          {/* ── Logo  |  QUOTATION title ── */}
          <div className="doc-header-band px-7 pt-7 pb-5">
            <div className="flex items-start justify-between gap-6 mb-7">
              {/* Logo only — clean */}
              <div>
                {co.logo
                  ? <img src={co.logo} alt="logo"
                      className="w-auto object-contain"
                      style={{ height: `${co.logo_size || 40}px` }} />
                  : co.name
                    ? <p className="text-xl font-black text-slate-900 tracking-tight uppercase">{co.name}</p>
                    : null
                }
              </div>
              {/* Title block */}
              <div className="text-right flex-shrink-0">
                <p className="doc-title text-2xl font-black text-slate-900 tracking-tight uppercase">Quotation</p>
                <p className="font-mono font-semibold text-slate-500 text-sm mt-1">{quotation.number}</p>
              </div>
            </div>

            {/* ── Bill To (left)  |  From / Our Company (right) ── plain, no backgrounds */}
            <div className="grid grid-cols-2 gap-8">
              {/* Client */}
              <div className="doc-info-left">
                <p className="text-2xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Bill To</p>
                {quotation.client_name
                  ? <p className="font-bold text-slate-900 text-sm leading-tight">{quotation.client_name}</p>
                  : <p className="text-slate-400 italic text-xs">No client selected</p>
                }
                {(quotation.client_address || quotation.client_city || quotation.client_country) && (
                  <p className="text-xs text-slate-600 mt-1 leading-snug">
                    {[quotation.client_address, quotation.client_city, quotation.client_country].filter(Boolean).join(', ')}
                  </p>
                )}
                {quotation.client_phone && (
                  <p className="text-xs text-slate-600 mt-0.5">{quotation.client_phone}</p>
                )}
                {quotation.client_email && (
                  <p className="text-xs text-slate-600 mt-0.5">{quotation.client_email}</p>
                )}
              </div>

              {/* Our company */}
              <div className="doc-info-right text-right">
                <p className="text-2xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">From</p>
                {co.name && <p className="font-bold text-slate-900 text-sm leading-tight">{co.name}</p>}
                {(co.address || co.city || co.country) && (
                  <p className="text-xs text-slate-600 mt-1 leading-snug">
                    {[co.address, co.city, co.country].filter(Boolean).join(', ')}
                  </p>
                )}
                {co.phone && (
                  <p className="text-xs text-slate-600 mt-0.5">{co.phone}</p>
                )}
                {co.email && (
                  <p className="text-xs text-slate-600 mt-0.5">{co.email}</p>
                )}
                {co.website && (
                  <p className="text-xs text-slate-600 mt-0.5">{co.website}</p>
                )}
                {co.tax_number && (
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">TRN/VAT: {co.tax_number}</p>
                )}
              </div>
            </div>

          </div>

          {/* Subject + Dates — plain row, no background */}
          <div className="px-7 py-2.5 border-t border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap">
            {quotation.subject && (
              <p className="text-xs font-semibold text-slate-700 flex-1 min-w-0 truncate">{quotation.subject}</p>
            )}
            <p className="text-xs text-slate-500 flex-shrink-0 ml-auto whitespace-nowrap">
              <span className="font-semibold text-slate-700">Date:</span> {fmt(quotation.created_at)}
              {quotation.valid_until && (
                <> &nbsp;·&nbsp; <span className="font-semibold text-slate-700">Valid Until:</span> {fmt(quotation.valid_until)}</>
              )}
            </p>
          </div>

          {/* Line items table */}
          <div className="px-7 py-4">
            <table className="doc-table w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left pb-2 pt-1 text-2xs font-bold text-slate-500 uppercase tracking-wider w-7">#</th>
                  <th className="text-left pb-2 pt-1 text-2xs font-bold text-slate-500 uppercase tracking-wider">Product / Description</th>
                  <th className="text-center pb-2 pt-1 text-2xs font-bold text-slate-500 uppercase tracking-wider w-16">Qty</th>
                  <th className="text-right pb-2 pt-1 text-2xs font-bold text-slate-500 uppercase tracking-wider w-28">Unit Price</th>
                  <th className="text-right pb-2 pt-1 text-2xs font-bold text-slate-500 uppercase tracking-wider w-28">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length > 0 ? items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 text-slate-400 text-xs align-top">{i + 1}</td>
                    <td className="py-2 pr-4">
                      <p className="font-semibold text-slate-800">{item.name || '—'}</p>
                      {item.description && (
                        <p className="text-slate-500 mt-0.5 whitespace-pre-line leading-relaxed text-xs">{item.description}</p>
                      )}
                    </td>
                    <td className="py-2 text-center text-slate-700 tabular-nums font-medium align-top">{parseFloat(item.quantity) || 0}</td>
                    <td className="py-2 text-right text-slate-700 tabular-nums align-top">{sym}{(parseFloat(item.unit_price) || 0).toFixed(2)}</td>
                    <td className="py-2 text-right font-semibold text-slate-900 tabular-nums align-top">{sym}{(parseFloat(item.total) || 0).toFixed(2)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400 italic text-xs">No line items</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals — plain rows, no background */}
          <div className="px-7 pb-5">
            <div className="flex justify-end">
              <div className="doc-total-box min-w-[240px]">
                <div className="flex justify-between py-1.5 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium text-slate-700">{fmtMoney(subtotal, sym)}</span>
                </div>
                {disc > 0 && (
                  <div className="flex justify-between py-1.5 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">Discount</span>
                    <span className="font-semibold text-rose-600">− {fmtMoney(disc, sym)}</span>
                  </div>
                )}
                {parseFloat(quotation.tax_rate) > 0 && (
                  <div className="flex justify-between py-1.5 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">Tax ({quotation.tax_rate}%)</span>
                    <span className="font-medium text-slate-700">+ {fmtMoney(taxAmt, sym)}</span>
                  </div>
                )}
                {ship > 0 && (
                  <div className="flex justify-between py-1.5 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">Shipping</span>
                    <span className="font-medium text-slate-700">+ {fmtMoney(ship, sym)}</span>
                  </div>
                )}
                <div className="border-t-2 border-slate-300 mt-1 py-2 flex justify-between items-center">
                  <span className="font-bold text-slate-900 text-sm">Total</span>
                  <span className="font-bold text-slate-900 text-base tabular-nums">{fmtMoney(total, sym)}</span>
                </div>
                <p className="text-2xs text-slate-400 text-right mt-1">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'} · Qty: <span className="font-semibold text-slate-600">{totalQty.toLocaleString()}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Notes / Bank Details / Terms */}
          {(quotation.customer_notes || ((quotation.bank_details || co.bank_details) && tplCfg.showBankDetails !== false) || (quotation.terms_conditions && tplCfg.showTerms !== false)) && (
            <div className="border-t border-slate-100 px-5 py-3 space-y-3">
              {quotation.customer_notes && (
                <div>
                  <p className="text-2xs font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                    <MessageSquare size={10} /> Notes
                  </p>
                  <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{quotation.customer_notes}</p>
                </div>
              )}
              {(quotation.bank_details || co.bank_details) && tplCfg.showBankDetails !== false && (
                <div>
                  <p className="text-2xs font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                    <Landmark size={10} /> Bank Details
                  </p>
                  <p className="text-xs text-slate-600 whitespace-pre-line font-mono leading-relaxed border-l-2 border-slate-200 pl-3 py-1">
                    {quotation.bank_details || co.bank_details}
                  </p>
                </div>
              )}
              {quotation.terms_conditions && tplCfg.showTerms !== false && (
                <div>
                  <p className="text-2xs font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                    <FileCheck size={10} /> Terms & Conditions
                  </p>
                  <p className="text-xs text-slate-500 whitespace-pre-line leading-relaxed">{quotation.terms_conditions}</p>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-2 bg-slate-50/60 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">
              {tplCfg.footerText
                ? tplCfg.footerText
                : <>{co.name && <>{co.name} &nbsp;·&nbsp; </>}Thank you for your business</>
              }
            </p>
          </div>
          {/* Elegant accent bar (bottom) */}
          <div className="doc-accent-bar-bottom hidden" />
        </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Quotations() {
  const navigate = useNavigate();

  const [quotations,   setQuotations]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [delConfirm,   setDelConfirm]   = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [delError,     setDelError]     = useState('');
  const [viewId,       setViewId]       = useState(null);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (search)       params.search  = search;
      const { data } = await api.get('/quotations', { params });
      setQuotations(data);
    } catch {}
    finally { setLoading(false); }
  }, [filterStatus, search]);

  useEffect(() => { load(); }, [load]);

  // ── Duplicate ──────────────────────────────────────────────────────────────

  async function handleDuplicate(q) {
    try {
      const { data } = await api.post(`/quotations/${q.id}/duplicate`);
      navigate(`/quotations/${data.id}/edit`);
    } catch (e) {
      alert(e?.response?.data?.error ?? 'Failed to duplicate quotation.');
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!delConfirm) return;
    setDeleting(true); setDelError('');
    try {
      await api.delete(`/quotations/${delConfirm.id}`);
      setQuotations(prev => prev.filter(q => q.id !== delConfirm.id));
      setDelConfirm(null);
    } catch (e) {
      setDelError(e?.response?.data?.error ?? 'Failed to delete. Please try again.');
    } finally { setDeleting(false); }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  const total    = quotations.length;
  const draft    = quotations.filter(q => q.status === 'draft').length;
  const sent     = quotations.filter(q => q.status === 'sent').length;
  const accepted = quotations.filter(q => q.status === 'accepted').length;
  const pipeline = quotations
    .filter(q => ['draft', 'sent'].includes(q.status))
    .reduce((s, q) => s + (parseFloat(q.total) || 0), 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8.5rem)' }}>

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotations</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total} total · {draft} draft · {sent} sent · {accepted} accepted
          </p>
        </div>
        <button
          onClick={() => navigate('/quotations/new')}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm shadow-indigo-200 transition-colors">
          <Plus size={16} /> New Quotation
        </button>
      </div>

      {/* ── Two-panel split ── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">

        {/* LEFT: Quotation list */}
        <div className="w-full lg:w-80 flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 bg-white">

          {/* Search */}
          <div className="px-3 py-3 border-b border-slate-100">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-slate-50"
                placeholder="Search quotations…" />
            </div>
          </div>

          {/* Status filters */}
          <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap gap-1">
            {['', ...STATUSES].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                  filterStatus === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}>
                {s ? STATUS_CFG[s].label : 'All'} {!s ? `(${total})` : ''}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : quotations.length === 0 ? (
              <div className="py-16 text-center px-4">
                <FileText size={24} className="text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">{search || filterStatus ? 'No matches' : 'No quotations yet'}</p>
              </div>
            ) : (
              quotations.map(q => {
                const sym     = getSym(q.currency);
                const expired = q.valid_until && new Date(q.valid_until) < new Date() && q.status !== 'accepted';
                const isSelected = viewId === q.id;
                return (
                  <button key={q.id}
                    onClick={() => setViewId(isSelected ? null : q.id)}
                    className={`w-full text-left px-4 py-3.5 border-b border-slate-100 transition-colors flex flex-col gap-1 relative ${
                      isSelected
                        ? 'bg-indigo-50 border-l-[3px] border-l-indigo-600'
                        : 'hover:bg-slate-50/80 border-l-[3px] border-l-transparent'
                    }`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-indigo-700">{q.number}</span>
                      <StatusBadge status={expired ? 'expired' : q.status} />
                    </div>
                    {q.client_name && (
                      <p className="text-xs font-semibold text-slate-800 truncate">{q.client_name}</p>
                    )}
                    {q.subject && (
                      <p className="text-xs text-slate-400 truncate">{q.subject}</p>
                    )}
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-slate-400">{fmt(q.created_at)}</span>
                      <span className="text-xs font-bold text-slate-700">{fmtMoney(q.total, sym)}</span>
                    </div>
                    {/* Action buttons on hover */}
                    <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={e => e.stopPropagation()}>
                      <button onClick={() => navigate(`/quotations/${q.id}/edit`)} title="Edit"
                        className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                        <Pencil size={11} />
                      </button>
                      <button onClick={() => handleDuplicate(q)} title="Duplicate"
                        className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors">
                        <Copy size={11} />
                      </button>
                      <button onClick={() => setDelConfirm(q)} title="Delete"
                        className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: Quotation preview */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {viewId ? (
            <QuotationView
              embedded
              quotationId={viewId}
              onClose={() => setViewId(null)}
              onConverted={load}
              onEdit={() => { const id = viewId; setViewId(null); navigate(`/quotations/${id}/edit`); }}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                <FileText size={28} className="text-indigo-300" />
              </div>
              <p className="font-semibold text-slate-600">Select a quotation to preview</p>
              <p className="text-sm text-slate-400 mt-1">Click any quotation on the left to view its document</p>
              <button onClick={() => navigate('/quotations/new')}
                className="mt-5 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
                <Plus size={14} /> New Quotation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Delete confirm ── */}
      {delConfirm && (
        <ConfirmDelete
          quotation={delConfirm}
          loading={deleting}
          error={delError}
          onConfirm={handleDelete}
          onCancel={() => { setDelConfirm(null); setDelError(''); }}
        />
      )}
    </div>
  );
}
