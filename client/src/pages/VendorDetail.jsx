import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Trash2, Star, Phone, Mail, MapPin,
  Banknote, FileText, User, AlertTriangle, CheckCircle2,
  AlertCircle, CreditCard, Layers, Scissors, Package, Truck,
  Store, ChevronDown, ChevronUp, X, Save, History, Check,
} from 'lucide-react';
import api from '../lib/api';

// ─── Constants ─────────────────────────────────────────────────────────────────
const VENDOR_TYPES = [
  { key: 'fabric',    label: 'Fabric / Material',  icon: Layers,   color: 'bg-violet-100 text-violet-700',  ring: 'ring-violet-300' },
  { key: 'process',   label: 'Process',             icon: Scissors, color: 'bg-blue-100 text-blue-700',      ring: 'ring-blue-300' },
  { key: 'packaging', label: 'Packaging / Labels',  icon: Package,  color: 'bg-amber-100 text-amber-700',    ring: 'ring-amber-300' },
  { key: 'freight',   label: 'Freight / Logistics', icon: Truck,    color: 'bg-emerald-100 text-emerald-700',ring: 'ring-emerald-300' },
];
const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'online'];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = d => {
  if (!d) return '—';
  const dt = new Date(String(d).replace(' ', 'T'));
  if (isNaN(dt.getTime())) return '—';
  return `${String(dt.getDate()).padStart(2,'0')} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};
const pkr = v => `₨${(parseFloat(v)||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}`;

function vendorTypeInfo(key) {
  return VENDOR_TYPES.find(t => t.key === key) ?? VENDOR_TYPES[1];
}

const inputCls  = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all bg-white placeholder:text-slate-400';
const selectCls = `${inputCls} cursor-pointer`;

// ─── Edit Modal ───────────────────────────────────────────────────────────────
const EMPTY_VENDOR = {
  name: '', type: 'process', contact_name: '', phone: '', email: '',
  address: '', city: '', country: '', bank_details: '', notes: '', rating: 0, status: 'active',
};

function Field({ label, required, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button"
          onClick={() => onChange && onChange(n === value ? 0 : n)}
          className="transition-transform hover:scale-110">
          <Star size={18} className={n <= value ? 'text-amber-400 fill-amber-400' : 'text-slate-300'} />
        </button>
      ))}
    </div>
  );
}

function EditModal({ vendor, onClose, onSaved }) {
  const [form, setForm] = useState({ ...EMPTY_VENDOR, ...vendor });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) { setError('Vendor name is required.'); return; }
    setSaving(true); setError('');
    try {
      const res = await api.put(`/vendors/${vendor.id}`, form);
      onSaved(res.data);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="font-bold text-slate-900">Edit Vendor</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
              <AlertTriangle size={14} className="flex-shrink-0" />{error}
            </div>
          )}

          <Field label="Vendor Type">
            <div className="grid grid-cols-2 gap-2">
              {VENDOR_TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button key={t.key} type="button" onClick={() => set('type', t.key)}
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      form.type === t.key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-slate-50'
                    }`}>
                    <Icon size={14} />{t.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Name" required className="col-span-2">
              <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} autoFocus />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => set('status', e.target.value)} className={selectCls}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact Person">
              <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} />
            </Field>
            <Field label="City">
              <input value={form.city} onChange={e => set('city', e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Bank Details">
            <textarea value={form.bank_details} onChange={e => set('bank_details', e.target.value)}
              rows={2} className={`${inputCls} resize-none`} />
          </Field>

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} className={`${inputCls} resize-none`} />
          </Field>

          <Field label="Rating">
            <StarRating value={form.rating} onChange={v => set('rating', v)} />
          </Field>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-medium transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</> : <><Save size={14} />Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Freight Project Row (groups all shipments under one project) ──────────────
function FreightProjectRow({ projectTitle, projectStatus, shipments }) {
  const [open, setOpen] = useState(false);
  const billed = shipments.reduce((s, sp) => s + Number(sp.amount     || 0), 0);
  const paid   = shipments.reduce((s, sp) => s + Number(sp.paid_amount || 0), 0);
  const bal    = billed - paid;
  const pct    = billed > 0 ? Math.min(100, Math.round((paid / billed) * 100)) : 0;

  // All individual payment records across this project's shipments
  const allPay = shipments.flatMap(sp =>
    (sp.payments || []).map(p => ({ ...p, carrier: sp.carrier }))
  ).sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at));

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-slate-900 truncate">{projectTitle}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0 ${
              projectStatus === 'completed' ? 'bg-emerald-100 text-emerald-700' :
              projectStatus === 'cancelled' ? 'bg-slate-100 text-slate-500' :
              'bg-blue-100 text-blue-700'
            }`}>{projectStatus}</span>
          </div>
          <p className="text-xs text-slate-400">{shipments.length} shipment{shipments.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="text-right flex-shrink-0">
          {billed > 0 ? (
            <>
              <p className="text-sm font-bold text-slate-900">{pkr(billed)}</p>
              <p className={`text-xs font-semibold ${bal > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                {bal > 0 ? `${pkr(bal)} due` : '✓ Settled'}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-400">No amount set</p>
          )}
        </div>
      </div>

      {billed > 0 && (
        <div className="px-5 pb-3">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>{pkr(paid)} paid</span><span>{pct}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
              style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Individual shipment breakdown */}
      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 space-y-2">
        {shipments.map(sp => (
          <div key={sp.id} className="flex items-center justify-between text-xs text-slate-500 gap-2">
            <span className="truncate">{sp.carrier || 'Shipment'}{sp.shipping_date ? ` · ${sp.shipping_date}` : ''}{sp.tracking_number ? ` · ${sp.tracking_number}` : ''}</span>
            <div className="text-right flex-shrink-0">
              <span className="font-medium text-slate-700">{pkr(sp.amount)}</span>
              {Number(sp.amount||0) - Number(sp.paid_amount||0) > 0
                ? <span className="text-rose-400 ml-1.5">({pkr(Number(sp.amount||0)-Number(sp.paid_amount||0))} due)</span>
                : <span className="text-emerald-500 ml-1.5">✓</span>
              }
            </div>
          </div>
        ))}
      </div>

      {allPay.length > 0 && (
        <>
          <button onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-2.5 border-t border-slate-100 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
            <span>{allPay.length} payment{allPay.length !== 1 ? 's' : ''} recorded</span>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {open && (
            <div className="border-t border-slate-100 divide-y divide-slate-50">
              {allPay.map(p => (
                <div key={p.id} className="flex items-center justify-between px-5 py-2.5">
                  <div>
                    <p className="text-sm text-slate-700 font-medium">{fmt(p.paid_at)}</p>
                    <p className="text-xs text-slate-400 capitalize">
                      {p.method?.replace('_',' ')}{p.carrier ? ` · ${p.carrier}` : ''}
                      {p.reference ? ` · ${p.reference}` : ''}{p.notes ? ` · ${p.notes}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600">{pkr(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Project Payment History Row ──────────────────────────────────────────────
function ProjectPaymentRow({ pv }) {
  const [open, setOpen] = useState(false);
  const billed = Number(pv.invoice_amount || 0);
  const paid   = Number(pv.total_paid     || 0);
  const bal    = billed - paid;
  const pct    = billed > 0 ? Math.min(100, Math.round((paid/billed)*100)) : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Project header */}
      <div className="flex items-center justify-between px-5 py-4 gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-slate-900 truncate">{pv.project_title}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0 ${
              pv.project_status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
              pv.project_status === 'cancelled' ? 'bg-slate-100 text-slate-500' :
              'bg-blue-100 text-blue-700'
            }`}>{pv.project_status}</span>
          </div>
          {pv.service_description && (
            <p className="text-xs text-slate-400 truncate">{pv.service_description}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          {billed > 0 ? (
            <>
              <p className="text-sm font-bold text-slate-900">{pkr(billed)}</p>
              <p className={`text-xs font-semibold ${bal > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                {bal > 0 ? `${pkr(bal)} due` : '✓ Settled'}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-400">No amount set</p>
          )}
        </div>
      </div>

      {/* Progress + payment toggle */}
      {billed > 0 && (
        <div className="px-5 pb-3">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>{pkr(paid)} paid</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
              style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Payment history toggle */}
      {pv.payments?.length > 0 && (
        <>
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-2.5 border-t border-slate-100 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
            <span>{pv.payments.length} payment{pv.payments.length !== 1 ? 's' : ''} recorded</span>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {open && (
            <div className="border-t border-slate-100 divide-y divide-slate-50">
              {pv.payments.map(p => (
                <div key={p.id} className="flex items-center justify-between px-5 py-2.5">
                  <div>
                    <p className="text-sm text-slate-700 font-medium">{fmt(p.paid_at)}</p>
                    <p className="text-xs text-slate-400 capitalize">
                      {p.method?.replace('_', ' ')}
                      {p.reference ? ` · ${p.reference}` : ''}
                      {p.notes ? ` · ${p.notes}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600">{pkr(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Edit Payment Modal ────────────────────────────────────────────────────────
function EditPaymentModal({ vendorId, payment, onClose, onSaved }) {
  const [form, setForm] = useState({
    amount:    String(payment.amount),
    method:    payment.method    || 'cash',
    reference: payment.reference || '',
    notes:     payment.notes     || '',
    paid_at:   payment.paid_at   ? payment.paid_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { setError('Amount must be greater than 0.'); return; }
    setSaving(true); setError('');
    try {
      const { data } = await api.put(`/vendors/${vendorId}/payments/${payment.id}`, form);
      onSaved(data);
      onClose();
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-900">Edit Payment</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs px-3 py-2 rounded-xl flex items-center gap-2">
              <AlertTriangle size={12} />{error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Amount (₨)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₨</span>
              <input type="number" min="0" value={form.amount} onChange={e => set('amount', e.target.value)}
                className={`${inputCls} pl-8`} autoFocus />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Method</label>
              <select value={form.method} onChange={e => set('method', e.target.value)} className={selectCls}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
              <input type="date" value={form.paid_at} onChange={e => set('paid_at', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Reference</label>
            <input value={form.reference} onChange={e => set('reference', e.target.value)} className={inputCls} placeholder="Cheque no., transaction ID…" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notes</label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)} className={inputCls} placeholder="Optional" />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-medium transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving
              ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
              : <><Check size={13} />Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Payment History ───────────────────────────────────────────────────────────
function PaymentHistory({ vendorId, data, onRefresh }) {
  const [editingPayment, setEditingPayment] = useState(null);
  const [deletingId,     setDeletingId]     = useState(null);
  const [confirmDel,     setConfirmDel]     = useState(null); // payment id to confirm

  // Use the pre-built flat list from the API (includes service_description, carrier, payment_type)
  const allPayments = data?.allPayments || [];

  async function handleDelete(paymentId) {
    setDeletingId(paymentId);
    try {
      await api.delete(`/vendors/${vendorId}/payments/${paymentId}`);
      setConfirmDel(null);
      await onRefresh();
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  }

  if (!allPayments.length) {
    return (
      <div className="bg-white border border-dashed border-slate-200 rounded-2xl px-5 py-8 flex flex-col items-center gap-2">
        <History size={24} className="text-slate-200" />
        <p className="text-sm text-slate-400 font-medium">No payments recorded yet</p>
      </div>
    );
  }

  const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <History size={14} className="text-indigo-600" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Payment History</p>
              <p className="text-xs text-slate-400">{allPayments.length} payment{allPayments.length !== 1 ? 's' : ''} · {pkr(totalPaid)} total</p>
            </div>
          </div>
        </div>

        {/* Payments list */}
        <div className="divide-y divide-slate-50">
          {allPayments.map(p => (
            <div key={p.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-2">
                {/* Left: date + amount + where adjusted */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-sm font-bold text-emerald-600">{pkr(p.amount)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      p.method === 'cash'          ? 'bg-emerald-100 text-emerald-700' :
                      p.method === 'bank_transfer' ? 'bg-blue-100 text-blue-700' :
                      p.method === 'cheque'        ? 'bg-violet-100 text-violet-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{p.method?.replace('_', ' ')}</span>
                    <span className="text-xs text-slate-400">{fmt(p.paid_at)}</span>
                  </div>
                  {/* Project */}
                  <p className="text-sm font-semibold text-slate-800 truncate">{p.project_title || '—'}</p>
                  {/* Where adjusted */}
                  <p className="text-xs text-indigo-600 truncate">
                    {p.payment_type === 'shipping'
                      ? `Shipping${p.shipping_carrier ? ` · ${p.shipping_carrier}` : ''}${p.tracking_number ? ` · ${p.tracking_number}` : ''}`
                      : p.service_description || 'Service'}
                  </p>
                  {(p.reference || p.notes) && (
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {[p.reference, p.notes].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                  {confirmDel === p.id ? (
                    <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                      <span className="text-xs text-rose-600 font-medium">Delete?</span>
                      <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id}
                        className="text-xs font-bold text-rose-600 hover:text-rose-800 px-1">
                        {deletingId === p.id ? '…' : 'Yes'}
                      </button>
                      <button onClick={() => setConfirmDel(null)} className="text-xs text-slate-400 px-1">No</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => setEditingPayment(p)}
                        className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Edit payment">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setConfirmDel(p.id)}
                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete payment">
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit modal */}
      {editingPayment && (
        <EditPaymentModal
          vendorId={vendorId}
          payment={editingPayment}
          onClose={() => setEditingPayment(null)}
          onSaved={() => { setEditingPayment(null); onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function VendorDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();

  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [delConf,  setDelConf]  = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Pay form
  const [payForm, setPayForm] = useState({
    amount: '', method: 'cash', reference: '', notes: '',
    paid_at: new Date().toISOString().slice(0, 10),
  });
  const [paying,  setPaying]  = useState(false);
  const [payErr,  setPayErr]  = useState('');
  const [payOk,   setPayOk]   = useState('');
  const setP = (k, v) => setPayForm(f => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/vendors/${id}`);
      setData(d);
    } catch { /* 404 etc */ }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/vendors/${id}`);
      navigate('/vendors');
    } catch { setDeleting(false); }
  }

  async function handlePay() {
    const amt = parseFloat(payForm.amount);
    if (!amt || amt <= 0) { setPayErr('Enter a valid amount.'); return; }

    const isFreightVendor = data?.type === 'freight' || data?.type === 'shipping';
    setPaying(true); setPayErr(''); setPayOk('');
    try {
      const endpoint = isFreightVendor ? `/vendors/${id}/shipping-payments` : `/vendors/${id}/payments`;
      const { data: res } = await api.post(endpoint, payForm);
      const count = res.applied?.length ?? 1;
      const total = res.applied ? res.applied.reduce((s, a) => s + a.amount, 0) : amt;
      setPayOk(`₨${total.toLocaleString()} recorded across ${count} shipment${count !== 1 ? 's' : ''}.`);
      setPayForm(f => ({ ...f, amount: '', reference: '', notes: '' }));
      await load();
    } catch (e) {
      setPayErr(e?.response?.data?.error ?? 'Payment failed.');
    } finally { setPaying(false); }
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <Store size={40} className="text-slate-300" />
        <p className="text-slate-500 font-medium">Vendor not found</p>
        <button onClick={() => navigate('/vendors')}
          className="flex items-center gap-2 text-sm text-indigo-600 hover:underline">
          <ArrowLeft size={14} /> Back to Vendors
        </button>
      </div>
    );
  }

  const typeInfo    = vendorTypeInfo(data.type);
  const TypeIcon    = typeInfo.icon;
  const isFreight   = data.type === 'freight' || data.type === 'shipping';

  // Group shippingProjects by project_id for freight display
  const freightByProject = (() => {
    if (!isFreight) return [];
    const map = new Map();
    for (const sp of (data.shippingProjects || [])) {
      const key = sp.project_id;
      if (!map.has(key)) map.set(key, { projectTitle: sp.project_title, projectStatus: sp.project_status, shipments: [] });
      map.get(key).shipments.push(sp);
    }
    return [...map.values()];
  })();

  // Compute totals — freight uses shippingProjects, others use projects
  const projectCount = isFreight
    ? freightByProject.length
    : (data.projects?.length ?? 0);
  const totalBilled = isFreight
    ? (data.shippingProjects || []).reduce((s, sp) => s + Number(sp.amount || 0), 0)
    : (data.projects || []).reduce((s, pv) => s + Number(pv.invoice_amount || 0), 0);
  const totalPaid = isFreight
    ? (data.shippingProjects || []).reduce((s, sp) => s + Number(sp.paid_amount || 0), 0)
    : (data.projects || []).reduce((s, pv) => s + Number(pv.total_paid || 0), 0);
  const outstanding = totalBilled - totalPaid;

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Breadcrumb / Back ── */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <button onClick={() => navigate('/vendors')}
          className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors font-medium">
          <ArrowLeft size={14} /> Vendors
        </button>
        <span>/</span>
        <span className="text-slate-800 font-semibold truncate">{data.name}</span>
      </div>

      {/* ── Hero Header ── */}
      <div className={`bg-white rounded-2xl shadow-sm overflow-hidden border ${outstanding > 0 ? 'border-rose-200' : 'border-slate-200'}`}>
        {/* Colour strip */}
        <div className={`h-1.5 w-full ${
          data.type === 'fabric'    ? 'bg-violet-400' :
          data.type === 'packaging' ? 'bg-amber-400' :
          data.type === 'freight'   ? 'bg-emerald-400' :
          'bg-blue-400'
        }`} />

        {/* Outstanding banner */}
        {outstanding > 0 ? (
          <div className="bg-rose-50 border-b border-rose-200 px-5 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle size={14} className="text-rose-500 flex-shrink-0" />
              <span className="text-xs font-bold text-rose-600 uppercase tracking-wider truncate">Outstanding</span>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-lg font-bold text-rose-600">{pkr(outstanding)}</span>
              <span className="text-xs text-rose-400 ml-1 hidden sm:inline">
                across {isFreight
                  ? freightByProject.filter(g => g.shipments.some(sp => Number(sp.amount||0) - Number(sp.paid_amount||0) > 0)).length
                  : (data.projects || []).filter(pv => (pv.invoice_amount - pv.total_paid) > 0).length
                } project(s)
              </span>
            </div>
          </div>
        ) : totalBilled > 0 ? (
          <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Fully Settled</span>
            </div>
            <span className="text-sm font-semibold text-emerald-600">{pkr(totalPaid)} paid in full</span>
          </div>
        ) : null}

        <div className="px-5 py-5 flex items-start gap-4">
          {/* Icon */}
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${typeInfo.color} ring-4 ring-white shadow-md`}>
            <TypeIcon size={24} />
          </div>

          {/* Info + Actions */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-xl font-bold text-slate-900 truncate">{data.name}</h1>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${
                    data.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>{data.status === 'active' ? 'Active' : 'Inactive'}</span>
                </div>
                <p className="text-sm text-slate-500">{typeInfo.label}</p>
                {data.rating > 0 && (
                  <div className="flex items-center gap-0.5 mt-1.5">
                    {[1,2,3,4,5].map(n => (
                      <Star key={n} size={13} className={n <= data.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
                    ))}
                  </div>
                )}
              </div>
              {/* Actions — icon-only on mobile, labelled on sm+ */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-indigo-300 transition-colors">
                  <Pencil size={14} /><span className="hidden sm:inline">Edit</span>
                </button>
                {!delConf ? (
                  <button onClick={() => setDelConf(true)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 text-slate-700 rounded-xl hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 transition-colors">
                    <Trash2 size={14} /><span className="hidden sm:inline">Delete</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                    <span className="text-xs text-rose-600 font-medium">Delete?</span>
                    <button onClick={handleDelete} disabled={deleting}
                      className="text-sm font-bold text-rose-600 hover:text-rose-800 px-1">
                      {deleting ? '…' : 'Yes'}
                    </button>
                    <button onClick={() => setDelConf(false)} className="text-xs text-slate-400 px-1">No</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Vendor Details — full width above cards ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <User size={14} className="text-slate-500" />
          </div>
          <h2 className="font-bold text-slate-900 text-sm">Vendor Details</h2>
        </div>
        <div className="p-5 space-y-4">
          {/* Contact tiles — up to 4 across */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.contact_name && (
              <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
                  <User size={13} className="text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">Contact Person</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{data.contact_name}</p>
                </div>
              </div>
            )}
            {data.phone && (
              <div className="flex items-center gap-3 bg-blue-50 rounded-xl p-3">
                <div className="w-8 h-8 bg-white border border-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Phone size={13} className="text-blue-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">Phone</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{data.phone}</p>
                </div>
              </div>
            )}
            {data.email && (
              <div className="flex items-center gap-3 bg-indigo-50 rounded-xl p-3">
                <div className="w-8 h-8 bg-white border border-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Mail size={13} className="text-indigo-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">Email</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{data.email}</p>
                </div>
              </div>
            )}
            {(data.city || data.country) && (
              <div className="flex items-center gap-3 bg-emerald-50 rounded-xl p-3">
                <div className="w-8 h-8 bg-white border border-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <MapPin size={13} className="text-emerald-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">Location</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{[data.city, data.country].filter(Boolean).join(', ')}</p>
                </div>
              </div>
            )}
            {!data.contact_name && !data.phone && !data.email && !data.city && (
              <p className="text-sm text-slate-400 italic col-span-4 py-1">No contact details added</p>
            )}
          </div>
          {/* Bank + Notes inline */}
          {(data.bank_details || data.notes) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.bank_details && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <div className="w-8 h-8 bg-white border border-amber-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Banknote size={13} className="text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Bank Details</p>
                    <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{data.bank_details}</p>
                  </div>
                </div>
              )}
              {data.notes && (
                <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{data.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Billed',   value: pkr(totalBilled), sub: `${projectCount} project${projectCount !== 1 ? 's' : ''}`, icon: FileText,     bg: 'bg-slate-100',    text: 'text-slate-700' },
          { label: 'Total Paid',     value: pkr(totalPaid),   sub: 'all time',              icon: CheckCircle2, bg: 'bg-emerald-50',   text: 'text-emerald-600' },
          { label: 'Outstanding',    value: pkr(outstanding), sub: outstanding > 0 ? 'remaining' : 'fully settled', icon: AlertCircle,
            bg: outstanding > 0 ? 'bg-rose-50' : 'bg-slate-100',
            text: outstanding > 0 ? 'text-rose-600' : 'text-slate-400' },
          { label: 'Payment Rate',   value: totalBilled > 0 ? `${Math.round((totalPaid/totalBilled)*100)}%` : '—', sub: 'of total billed', icon: CreditCard, bg: 'bg-indigo-50', text: 'text-indigo-600' },
        ].map(({ label, value, sub, icon: Icon, bg, text }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex items-center gap-3 shadow-sm">
            <div className={`${bg} ${text} p-2.5 rounded-xl flex-shrink-0`}><Icon size={16} /></div>
            <div className="min-w-0">
              <p className="text-base sm:text-xl font-bold text-slate-900 break-all leading-tight">{value}</p>
              <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
              <p className="text-xs text-slate-400 truncate">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Two-column body ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ── Left (2/3): Projects ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Projects */}
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
              <FileText size={16} className="text-slate-400" />
              Projects
              <span className="text-xs font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{projectCount}</span>
            </h2>
            {projectCount === 0 ? (
              <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-14 flex flex-col items-center gap-2">
                <FileText size={30} className="text-slate-200" />
                <p className="text-slate-400 text-sm">No projects linked to this vendor yet</p>
              </div>
            ) : isFreight ? (
              /* Freight: one card per project, groups all its shipments */
              <div className="space-y-3">
                {freightByProject.map(g => (
                  <FreightProjectRow
                    key={g.projectTitle}
                    projectTitle={g.projectTitle}
                    projectStatus={g.projectStatus}
                    shipments={g.shipments}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {data.projects.map(pv => <ProjectPaymentRow key={pv.id} pv={pv} />)}
              </div>
            )}
          </div>
        </div>

        {/* ── Right (1/3): Payment History + Record Payment ── */}
        <div className="space-y-4">

          {/* Payment form card */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/60">
              <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <CreditCard size={14} className="text-emerald-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">Record Payment</p>
                <p className="text-xs text-slate-400">Distributes oldest-first</p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">

              {/* Feedback */}
              {payOk && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-2.5 rounded-xl flex items-center gap-2">
                  <CheckCircle2 size={13} className="flex-shrink-0" /> {payOk}
                </div>
              )}
              {payErr && (
                <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs px-3 py-2.5 rounded-xl flex items-center gap-2">
                  <AlertCircle size={13} className="flex-shrink-0" /> {payErr}
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Amount (₨)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">₨</span>
                  <input type="number" min="0" value={payForm.amount}
                    onChange={e => { setP('amount', e.target.value); setPayOk(''); setPayErr(''); }}
                    className={`${inputCls} pl-8`} placeholder="0" />
                </div>
                {/* Quick-fill buttons — same for both freight and regular vendors */}
                {outstanding > 0 && (
                  <div className="flex flex-col gap-1.5 mt-2">
                    <button type="button" onClick={() => { setP('amount', String(outstanding)); setPayOk(''); setPayErr(''); }}
                      className="w-full text-xs px-3 py-2 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 font-semibold transition-colors text-left">
                      Pay Full Outstanding — {pkr(outstanding)}
                    </button>
                    {isFreight
                      ? freightByProject.filter(g => {
                          const due = g.shipments.reduce((s, sp) => s + Number(sp.amount||0) - Number(sp.paid_amount||0), 0);
                          return due > 0;
                        }).slice(0, 3).map(g => {
                          const due = g.shipments.reduce((s, sp) => s + Number(sp.amount||0) - Number(sp.paid_amount||0), 0);
                          return (
                            <button key={g.projectTitle} type="button"
                              onClick={() => { setP('amount', String(due)); setPayOk(''); setPayErr(''); }}
                              className="w-full text-xs px-3 py-2 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 font-medium transition-colors text-left truncate">
                              {g.projectTitle} — {pkr(due)}
                            </button>
                          );
                        })
                      : data.projects?.filter(pv => (pv.invoice_amount - pv.total_paid) > 0).slice(0, 3).map(pv => {
                          const due = pv.invoice_amount - pv.total_paid;
                          return (
                            <button key={pv.id} type="button"
                              onClick={() => { setP('amount', String(due)); setPayOk(''); setPayErr(''); }}
                              className="w-full text-xs px-3 py-2 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 font-medium transition-colors text-left truncate">
                              {pv.project_title} — {pkr(due)}
                            </button>
                          );
                        })
                    }
                  </div>
                )}
              </div>

              {/* Method + Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Method</label>
                <select value={payForm.method} onChange={e => setP('method', e.target.value)} className={selectCls}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                <input type="date" value={payForm.paid_at} onChange={e => setP('paid_at', e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Reference / Cheque No.</label>
                <input value={payForm.reference} onChange={e => setP('reference', e.target.value)} className={inputCls} placeholder="Optional" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notes</label>
                <input value={payForm.notes} onChange={e => setP('notes', e.target.value)} className={inputCls} placeholder="Optional" />
              </div>

              <button onClick={handlePay} disabled={paying || !payForm.amount}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors shadow-sm mt-1">
                {paying
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing…</>
                  : <><CreditCard size={15} /> Record Payment</>
                }
              </button>
            </div>
          </div>

          {/* Payment History */}
          <PaymentHistory vendorId={id} data={data} onRefresh={load} />

        </div>
      </div>

      {/* ── Edit Modal ── */}
      {showEdit && (
        <EditModal
          vendor={data}
          onClose={() => setShowEdit(false)}
          onSaved={updated => {
            setData(prev => ({ ...prev, ...updated }));
            setShowEdit(false);
          }}
        />
      )}
    </div>
  );
}
