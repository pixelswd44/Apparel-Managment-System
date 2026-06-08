import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store, Plus, Search, X, Trash2, Pencil, Phone, Mail,
  MapPin, Star, Banknote, Truck, Package, Scissors, Layers,
  CheckCircle2, AlertCircle, FileText, User, AlertTriangle,
  ChevronRight, Check, Save, CreditCard, ChevronDown,
} from 'lucide-react';
import api from '../lib/api';
import Drawer from '../components/Drawer';

// ─── Constants ─────────────────────────────────────────────────────────────────

const VENDOR_TYPES = [
  { key: 'fabric',    label: 'Fabric / Material', icon: Layers,   color: 'bg-violet-100 text-violet-700' },
  { key: 'process',   label: 'Process',            icon: Scissors, color: 'bg-blue-100 text-blue-700' },
  { key: 'packaging', label: 'Packaging / Labels', icon: Package,  color: 'bg-amber-100 text-amber-700' },
  { key: 'freight',   label: 'Freight / Logistics',icon: Truck,    color: 'bg-emerald-100 text-emerald-700' },
];

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'online'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Shared form primitives ───────────────────────────────────────────────────

const inputCls  = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-150 bg-white placeholder:text-slate-400';
const selectCls = `${inputCls} cursor-pointer`;

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

// ─── Star Rating ──────────────────────────────────────────────────────────────

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

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, text, sub }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200 rounded-2xl">
      <Icon size={36} className="text-slate-200 mb-3" />
      <p className="text-slate-600 font-medium">{text}</p>
      {sub && <p className="text-slate-400 text-sm mt-1">{sub}</p>}
    </div>
  );
}

// ─── Vendor Modal (create / edit) ────────────────────────────────────────────

const EMPTY_VENDOR = {
  name: '', type: 'process', contact_name: '', phone: '', email: '',
  address: '', city: '', country: '', bank_details: '', notes: '', rating: 0, status: 'active',
};

function VendorModal({ vendor, onClose, onSaved }) {
  const [form, setForm]   = useState(vendor ? { ...vendor } : { ...EMPTY_VENDOR });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) { setError('Vendor name is required.'); return; }
    setSaving(true); setError('');
    try {
      const res = vendor
        ? await api.put(`/vendors/${vendor.id}`, form)
        : await api.post('/vendors', form);
      onSaved(res.data);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  return (
    <Drawer
      open={true}
      onClose={onClose}
      title={vendor ? 'Edit Vendor' : 'Add Vendor'}
      subtitle={vendor ? 'Update vendor details' : 'Fill in vendor information to get started'}
      width="max-w-xl"
      footer={
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-medium transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : (vendor ? 'Save Changes' : 'Add Vendor')}
          </button>
        </div>
      }
    >
      <div className="px-6 py-5 space-y-5">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
            <AlertTriangle size={14} className="flex-shrink-0" />{error}
          </div>
        )}

        {/* Type selector */}
        <Field label="Vendor Type">
          <div className="grid grid-cols-2 gap-2 mt-0.5">
            {VENDOR_TYPES.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.key} type="button" onClick={() => set('type', t.key)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    form.type === t.key
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-slate-50'
                  }`}>
                  <Icon size={14} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Name + Status */}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Vendor / Company Name" required className="col-span-2">
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className={inputCls} placeholder="e.g. Ali Fabric House" autoFocus />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={e => set('status', e.target.value)} className={selectCls}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact Person">
            <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)}
              className={inputCls} placeholder="Contact name" />
          </Field>
          <Field label="Phone">
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
              className={inputCls} placeholder="+92 300 0000000" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input value={form.email} onChange={e => set('email', e.target.value)}
              className={inputCls} placeholder="vendor@email.com" />
          </Field>
          <Field label="City">
            <input value={form.city} onChange={e => set('city', e.target.value)}
              className={inputCls} placeholder="Lahore, Karachi…" />
          </Field>
        </div>

        {/* Bank details */}
        <Field label="Bank Details">
          <textarea value={form.bank_details} onChange={e => set('bank_details', e.target.value)} rows={2}
            className={`${inputCls} resize-none`}
            placeholder="Bank name, account number, IBAN…" />
        </Field>

        {/* Notes */}
        <Field label="Notes">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
            className={`${inputCls} resize-none`}
            placeholder="Any additional notes…" />
        </Field>

        {/* Rating */}
        <Field label="Rating">
          <StarRating value={form.rating} onChange={v => set('rating', v)} />
        </Field>
      </div>
    </Drawer>
  );
}

// ─── Vendor Drawer ────────────────────────────────────────────────────────────

function VendorDrawer({ vendorId, onClose, onEdit, onDeleted }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [delConf, setDelConf] = useState(false);
  const [deleting,setDeleting]= useState(false);
  const [tab,     setTab]     = useState('Overview'); // 'Overview' | 'Projects' | 'Pay'

  // Payment form state
  const [payForm,  setPayForm]  = useState({ amount: '', method: 'cash', reference: '', notes: '', paid_at: new Date().toISOString().slice(0,10) });
  const [paying,   setPaying]   = useState(false);
  const [payErr,   setPayErr]   = useState('');
  const [payOk,    setPayOk]    = useState('');
  const setP = (k, v) => setPayForm(f => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/vendors/${vendorId}`);
      setData(d);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [vendorId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/vendors/${vendorId}`);
      onDeleted(vendorId);
      onClose();
    } catch { setDeleting(false); }
  }

  async function handlePay() {
    const amt = parseFloat(payForm.amount);
    if (!amt || amt <= 0) { setPayErr('Enter a valid amount.'); return; }
    setPaying(true); setPayErr(''); setPayOk('');
    try {
      const { data: res } = await api.post(`/vendors/${vendorId}/payments`, payForm);
      const total = res.applied.reduce((s, a) => s + a.amount, 0);
      setPayOk(`₨${total.toLocaleString()} recorded across ${res.applied.length} project(s).`);
      setPayForm(f => ({ ...f, amount: '', reference: '', notes: '' }));
      await load(); // refresh totals
    } catch (e) {
      setPayErr(e?.response?.data?.error ?? 'Payment failed.');
    } finally { setPaying(false); }
  }

  if (!data && !loading) return null;

  const typeInfo   = data ? vendorTypeInfo(data.type) : VENDOR_TYPES[1];
  const TypeIcon   = typeInfo.icon;
  const totalBilled = Number(data?.total_billed ?? 0);
  const totalPaid   = Number(data?.total_paid   ?? 0);
  const outstanding = totalBilled - totalPaid;

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-[520px] bg-white border-l border-slate-200 shadow-2xl flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-start gap-4">
                {/* Type icon */}
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${typeInfo.color}`}>
                  <TypeIcon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-slate-900 text-base leading-tight truncate">{data.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-slate-500">{typeInfo.label}</span>
                    {data.status === 'active'
                      ? <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">Active</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">Inactive</span>}
                  </div>
                  {data.rating > 0 && (
                    <div className="flex items-center gap-0.5 mt-1">
                      {[1,2,3,4,5].map(n => (
                        <Star key={n} size={12} className={n <= data.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => onEdit(data)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                    <Pencil size={15} />
                  </button>
                  {!delConf ? (
                    <button onClick={() => setDelConf(true)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
                      <Trash2 size={15} />
                    </button>
                  ) : (
                    <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1.5">
                      <span className="text-xs text-rose-600 font-medium">Delete?</span>
                      <button onClick={handleDelete} disabled={deleting}
                        className="text-xs font-bold text-rose-600 hover:text-rose-800 px-1">
                        {deleting ? '…' : 'Yes'}
                      </button>
                      <button onClick={() => setDelConf(false)}
                        className="text-xs text-slate-400 px-1">No</button>
                    </div>
                  )}
                  <button onClick={onClose}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
                    <X size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Financials */}
            <div className="grid grid-cols-3 gap-3 px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Billed</p>
                <p className="text-base font-bold text-slate-900">{pkr(totalBilled)}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Paid</p>
                <p className="text-base font-bold text-emerald-700">{pkr(totalPaid)}</p>
              </div>
              <div className={`rounded-xl p-3 border ${
                outstanding > 0 ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-200'
              }`}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Outstanding</p>
                <p className={`text-base font-bold ${outstanding > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                  {pkr(outstanding)}
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mx-6 mt-4 flex-shrink-0">
              {['Overview','Projects','Pay'].map(t => (
                <button key={t} onClick={() => { setTab(t); setPayOk(''); setPayErr(''); }}
                  className={`flex-1 py-1.5 text-sm rounded-lg font-medium transition-all duration-150 flex items-center justify-center gap-1.5 ${
                    tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  {t === 'Pay' && <CreditCard size={13} />}{t}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

              {tab === 'Overview' && (
                <>
                  {/* Contact info */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Contact</p>
                    {data.contact_name && (
                      <div className="flex items-center gap-2.5 text-sm text-slate-700">
                        <User size={14} className="text-slate-400 flex-shrink-0" />
                        {data.contact_name}
                      </div>
                    )}
                    {data.phone && (
                      <div className="flex items-center gap-2.5 text-sm text-slate-700">
                        <Phone size={14} className="text-slate-400 flex-shrink-0" />
                        {data.phone}
                      </div>
                    )}
                    {data.email && (
                      <div className="flex items-center gap-2.5 text-sm text-slate-700">
                        <Mail size={14} className="text-slate-400 flex-shrink-0" />
                        {data.email}
                      </div>
                    )}
                    {data.city && (
                      <div className="flex items-center gap-2.5 text-sm text-slate-700">
                        <MapPin size={14} className="text-slate-400 flex-shrink-0" />
                        {[data.city, data.country].filter(Boolean).join(', ')}
                      </div>
                    )}
                    {!data.contact_name && !data.phone && !data.email && !data.city && (
                      <p className="text-sm text-slate-400 italic">No contact details added</p>
                    )}
                  </div>

                  {/* Bank */}
                  {data.bank_details && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Bank Details</p>
                      <div className="flex items-start gap-2.5">
                        <Banknote size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{data.bank_details}</p>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {data.notes && (
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Notes</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{data.notes}</p>
                    </div>
                  )}
                </>
              )}

              {tab === 'Projects' && (
                <>
                  {!data.projects?.length ? (
                    <div className="text-center py-12 bg-white border border-dashed border-slate-200 rounded-2xl">
                      <FileText size={28} className="text-slate-200 mx-auto mb-2" />
                      <p className="text-slate-400 text-sm">No projects yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {data.projects.map(pv => {
                        const billed = Number(pv.invoice_amount || 0);
                        const paid   = Number(pv.total_paid     || 0);
                        const bal    = billed - paid;
                        const pct    = billed > 0 ? Math.min(100, Math.round((paid/billed)*100)) : 0;
                        return (
                          <div key={pv.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-semibold text-slate-900 text-sm">{pv.project_title}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                                pv.project_status === 'completed'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}>{pv.project_status}</span>
                            </div>
                            {pv.service_description && (
                              <p className="text-xs text-slate-500 mb-2">{pv.service_description}</p>
                            )}
                            {billed > 0 && (
                              <>
                                <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                                  <span>Billed: <span className="font-semibold text-slate-800">{pkr(billed)}</span></span>
                                  <span className="text-emerald-600 font-semibold">Paid: {pkr(paid)}</span>
                                  {bal > 0 && <span className="text-rose-500 font-semibold">Due: {pkr(bal)}</span>}
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                  <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                                </div>
                              </>
                            )}
                            {/* Payment history */}
                            {pv.payments?.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                                <p className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">Payments</p>
                                {pv.payments.map(p => (
                                  <div key={p.id} className="flex items-center justify-between text-xs text-slate-500">
                                    <span>{fmt(p.paid_at)} · <span className="capitalize">{p.method?.replace('_',' ')}</span>
                                      {p.reference ? ` · ${p.reference}` : ''}
                                    </span>
                                    <span className="text-emerald-600 font-semibold">{pkr(p.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {tab === 'Pay' && (
                <div className="space-y-4">

                  {/* Outstanding per project */}
                  {data.projects?.some(pv => (pv.invoice_amount - pv.total_paid) > 0) ? (
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-4 pt-3 pb-2">Outstanding per Project</p>
                      <div className="divide-y divide-slate-100">
                        {data.projects.filter(pv => (pv.invoice_amount - pv.total_paid) > 0).map(pv => {
                          const due = pv.invoice_amount - pv.total_paid;
                          return (
                            <div key={pv.id} className="flex items-center justify-between px-4 py-2.5">
                              <div>
                                <p className="text-sm font-medium text-slate-800">{pv.project_title}</p>
                                {pv.service_description && <p className="text-xs text-slate-400">{pv.service_description}</p>}
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-rose-500">{pkr(due)} due</p>
                                <p className="text-xs text-slate-400">{pkr(pv.total_paid)} of {pkr(pv.invoice_amount)} paid</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="px-4 py-2.5 bg-rose-50 border-t border-rose-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-700">Total Outstanding</span>
                        <span className="text-sm font-bold text-rose-600">{pkr(outstanding)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                      <p className="text-sm text-emerald-700 font-medium">All projects are fully paid.</p>
                    </div>
                  )}

                  {/* Payment form */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Record Payment</p>
                    <p className="text-xs text-slate-400">Amount auto-distributes across outstanding projects (oldest first). You can pay partial or combined amounts.</p>

                    {payOk && (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2.5 rounded-xl flex items-center gap-2">
                        <CheckCircle2 size={14} className="flex-shrink-0" /> {payOk}
                      </div>
                    )}
                    {payErr && (
                      <div className="bg-rose-50 border border-rose-200 text-rose-600 text-sm px-3 py-2.5 rounded-xl flex items-center gap-2">
                        <AlertCircle size={14} className="flex-shrink-0" /> {payErr}
                      </div>
                    )}

                    {/* Amount */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Amount (₨)</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₨</span>
                        <input type="number" min="0" value={payForm.amount} onChange={e => setP('amount', e.target.value)}
                          className={`${inputCls} pl-8`} placeholder="0" autoFocus />
                      </div>
                      {/* Quick-fill buttons */}
                      {outstanding > 0 && (
                        <div className="flex gap-2 mt-2">
                          <button type="button" onClick={() => setP('amount', String(outstanding))}
                            className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 font-semibold transition-colors">
                            Pay Full ({pkr(outstanding)})
                          </button>
                          {data.projects?.filter(pv => (pv.invoice_amount - pv.total_paid) > 0).slice(0, 1).map(pv => {
                            const due = pv.invoice_amount - pv.total_paid;
                            return (
                              <button key={pv.id} type="button" onClick={() => setP('amount', String(due))}
                                className="text-xs px-3 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 font-medium transition-colors truncate max-w-[160px]">
                                Pay {pv.project_title} ({pkr(due)})
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Method</label>
                        <select value={payForm.method} onChange={e => setP('method', e.target.value)} className={selectCls}>
                          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace('_',' ')}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                        <input type="date" value={payForm.paid_at} onChange={e => setP('paid_at', e.target.value)} className={inputCls} />
                      </div>
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
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
                      {paying
                        ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing…</>
                        : <><CreditCard size={15} />Record Payment</>
                      }
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Vendor Card ──────────────────────────────────────────────────────────────

function VendorCard({ vendor, onClick }) {
  const typeInfo = vendorTypeInfo(vendor.type);
  const TypeIcon = typeInfo.icon;
  const billed   = Number(vendor.total_billed ?? 0);
  const paid     = Number(vendor.total_paid   ?? 0);
  const bal      = billed - paid;
  const pct      = billed > 0 ? Math.min(100, Math.round((paid/billed)*100)) : 0;

  return (
    <div onClick={onClick}
      className={`bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-150 cursor-pointer group overflow-hidden border ${
        bal > 0 ? 'border-rose-200 hover:border-rose-300' : 'border-slate-200 hover:border-indigo-200'
      }`}>

      {/* Outstanding banner — only when there's a balance */}
      {bal > 0 && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">Outstanding</span>
          <span className="text-base font-bold text-rose-600">{pkr(bal)}</span>
        </div>
      )}
      {bal === 0 && billed > 0 && (
        <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Fully Settled</span>
          <span className="text-xs font-semibold text-emerald-500">✓ {pkr(paid)} paid</span>
        </div>
      )}

      <div className="p-5">
        {/* Name + type + status */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${typeInfo.color}`}>
              <TypeIcon size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900 group-hover:text-indigo-700 transition-colors truncate">{vendor.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{typeInfo.label}</p>
            </div>
          </div>
          {vendor.status === 'active'
            ? <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 flex-shrink-0">Active</span>
            : <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500 flex-shrink-0">Inactive</span>}
        </div>

        {/* Contact */}
        {vendor.phone && (
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-2.5">
            <Phone size={12} className="text-slate-400" />
            {vendor.phone}
          </div>
        )}

        {/* Rating */}
        {vendor.rating > 0 && (
          <div className="flex items-center gap-0.5 mb-3">
            {[1,2,3,4,5].map(n => (
              <Star key={n} size={13} className={n <= vendor.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
            ))}
          </div>
        )}

        {/* Financial */}
        <div className="border-t border-slate-100 pt-3 mt-2">
          {billed > 0 ? (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Billed</span>
                <span className="font-semibold text-slate-700">{pkr(billed)}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                  style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-emerald-600 font-semibold">{pkr(paid)} paid</span>
                <span className="text-slate-400">{vendor.project_count || 0} project{vendor.project_count !== 1 ? 's' : ''}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              No invoices yet · {vendor.project_count || 0} project{vendor.project_count !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function Vendors() {
  const navigate = useNavigate();
  const [vendors,    setVendors]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showModal,  setShowModal]  = useState(false);
  const [editVendor, setEditVendor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/vendors');
      setVendors(data);
    } catch { setVendors([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSaved(v) {
    setVendors(prev => {
      const idx = prev.findIndex(x => x.id === v.id);
      return idx >= 0 ? prev.map(x => x.id === v.id ? { ...x, ...v } : x) : [v, ...prev];
    });
  }

  function handleDeleted(id) {
    setVendors(prev => prev.filter(v => v.id !== id));
  }

  const filtered = vendors.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      v.name.toLowerCase().includes(q) ||
      (v.contact_name || '').toLowerCase().includes(q) ||
      (v.city         || '').toLowerCase().includes(q);
    const matchType = typeFilter === 'all' || v.type === typeFilter;
    return matchSearch && matchType;
  });

  // ── Stats ──
  const totalBilled   = vendors.reduce((s, v) => s + Number(v.total_billed ?? 0), 0);
  const totalPaid     = vendors.reduce((s, v) => s + Number(v.total_paid   ?? 0), 0);
  const outstanding   = totalBilled - totalPaid;
  const activeCount   = vendors.filter(v => v.status === 'active').length;

  return (
    <div>
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vendors</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage suppliers and track payments per project</p>
        </div>
        <button
          onClick={() => { setEditVendor(null); setShowModal(true); }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
          <Plus size={16} /> Add Vendor
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Vendors',  value: vendors.length, sub: `${activeCount} active`,       icon: Store,        color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Total Billed',   value: pkr(totalBilled), sub: 'across all projects',       icon: FileText,     color: 'text-slate-700',  bg: 'bg-slate-100' },
          { label: 'Total Paid',     value: pkr(totalPaid),   sub: 'all time',                  icon: CheckCircle2, color: 'text-emerald-600',bg: 'bg-emerald-50' },
          { label: 'Outstanding',    value: pkr(outstanding), sub: 'remaining balance',          icon: AlertCircle,
            color: outstanding > 0 ? 'text-rose-600' : 'text-slate-400',
            bg:    outstanding > 0 ? 'bg-rose-50'    : 'bg-slate-100' },
        ].map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className={`${bg} ${color} p-2.5 rounded-xl flex-shrink-0`}><Icon size={18} /></div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-slate-900 truncate">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-2xs text-slate-400">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search vendors, contacts, cities…"
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white" />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          <button onClick={() => setTypeFilter('all')}
            className={`px-3.5 py-1.5 text-sm rounded-lg font-medium whitespace-nowrap transition-all ${
              typeFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>All</button>
          {VENDOR_TYPES.map(t => (
            <button key={t.key} onClick={() => setTypeFilter(t.key)}
              className={`px-3.5 py-1.5 text-sm rounded-lg font-medium whitespace-nowrap transition-all ${
                typeFilter === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading vendors…</p>
        </div>
      ) : !filtered.length ? (
        <EmptyState
          icon={Store}
          text={search || typeFilter !== 'all' ? 'No vendors match your filters' : 'No vendors yet'}
          sub={search || typeFilter !== 'all' ? 'Try adjusting your search or filter' : 'Click "Add Vendor" to add your first supplier'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(v => (
            <VendorCard key={v.id} vendor={v}
              onClick={() => navigate(`/vendors/${v.id}`)} />
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <VendorModal
          vendor={editVendor}
          onClose={() => { setShowModal(false); setEditVendor(null); }}
          onSaved={v => { handleSaved(v); load(); }}
        />
      )}
    </div>
  );
}
