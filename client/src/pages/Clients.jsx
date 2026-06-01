import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Pencil, Trash2, X, Mail, Phone,
  MapPin, Building2, FileText, ChevronRight,
  AlertTriangle, Check, Truck, Upload, File, XCircle,
  User, CreditCard, Clock, DollarSign, Package,
  ChevronDown, Receipt, Users,
} from 'lucide-react';
import api from '../lib/api';
import Drawer from '../components/Drawer';

// ── Helpers ───────────────────────────────────────────────────────────────────

function Badge({ status }) {
  const map = {
    active:   'bg-emerald-100 text-emerald-700',
    inactive: 'bg-slate-100 text-slate-500',
    lead:     'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${map[status] ?? map.inactive}`}>
      {status}
    </span>
  );
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = d => {
  if (!d) return '—';
  const dt = new Date(String(d).replace(' ', 'T'));
  if (isNaN(dt.getTime())) return '—';
  return `${String(dt.getDate()).padStart(2,'0')} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};
const fmtMoney = (v, sym = '$') =>
  `${sym}${(parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtSize = b => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

const CURRENCIES    = [
  { code: 'USD', name: 'US Dollar' },   { code: 'AED', name: 'UAE Dirham' },
  { code: 'PKR', name: 'Pakistani Rupee' }, { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },   { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'CAD', name: 'Canadian Dollar' }, { code: 'AUD', name: 'Australian Dollar' },
];
const LANGUAGES     = ['English', 'Arabic', 'Urdu', 'French', 'German', 'Spanish'];
const PAYMENT_TERMS = ['Due on Receipt', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];

const STATUS_COLORS = {
  draft: 'bg-slate-100 text-slate-600', sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-600',
  expired: 'bg-amber-100 text-amber-700', unpaid: 'bg-rose-100 text-rose-700',
  partial: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700', cancelled: 'bg-slate-100 text-slate-500',
};

const EMPTY = {
  customer_type: 'business', name: '', company: '', display_name: '', name_primary: '',
  customer_number: '', email: '', phone: '', customer_language: 'English', currency: 'USD',
  products_origin: 'Pakistan', payment_terms: 'Net 30', customer_owner: '',
  address: '', city: '', zip: '', country: '',
  shipping_receiver_name: '', shipping_receiver_phone: '',
  shipping_address: '', shipping_city: '', shipping_zip: '', shipping_country: '',
  documents: '[]', notes: '', status: 'active', avatar: '',
};

const inputCls  = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-100 transition-all duration-150 bg-white placeholder:text-slate-400';
const selectCls = `${inputCls} cursor-pointer`;

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Document Uploader ─────────────────────────────────────────────────────────

function DocUploader({ docs, onChange }) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (e) => {
    const files = [...e.target.files];
    if (docs.length + files.length > 3) { alert('Maximum 3 documents allowed.'); return; }
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await api.post('/uploads', fd);
        return data;
      }));
      onChange([...docs, ...uploaded]);
    } finally { setUploading(false); e.target.value = ''; }
  };

  const remove = async (doc) => {
    await api.delete(`/uploads/${doc.filename}`).catch(() => {});
    onChange(docs.filter(d => d.filename !== doc.filename));
  };

  return (
    <div className="space-y-2">
      {docs.map(doc => (
        <div key={doc.filename} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
          <File size={16} className="text-indigo-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{doc.originalName}</p>
            <p className="text-xs text-slate-400">{fmtSize(doc.size)}</p>
          </div>
          <button type="button" onClick={() => remove(doc)} className="text-slate-400 hover:text-rose-500 transition-colors">
            <XCircle size={16} />
          </button>
        </div>
      ))}
      {docs.length < 3 && (
        <>
          <button type="button" onClick={() => inputRef.current?.click()}
            className="w-full border-2 border-dashed border-slate-200 rounded-xl px-4 py-4 flex items-center justify-center gap-2 text-sm text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all">
            <Upload size={16} />
            {uploading ? 'Uploading…' : `Upload file (${docs.length}/3) · max 10 MB`}
          </button>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFiles} />
        </>
      )}
    </div>
  );
}

// ── Avatar Uploader ───────────────────────────────────────────────────────────

function AvatarUploader({ avatar, initials, onChange }) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/uploads', fd);
      if (data.url) onChange(data.url);
    } finally { setUploading(false); e.target.value = ''; }
  };

  return (
    <div className="flex items-center gap-4">
      {/* Avatar preview */}
      <div
        onClick={() => inputRef.current?.click()}
        className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition-all flex-shrink-0 group relative"
      >
        {avatar ? (
          <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl font-bold text-slate-300 group-hover:text-indigo-300 transition-colors">
            {initials || <User size={24} className="text-slate-200" />}
          </span>
        )}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Upload size={16} className="text-white" />
        </div>
      </div>

      {/* Upload controls */}
      <div className="space-y-1.5">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 hover:border-indigo-300 transition-colors font-medium disabled:opacity-50">
          <Upload size={12} /> {uploading ? 'Uploading…' : 'Upload Photo'}
        </button>
        {avatar && (
          <button type="button" onClick={() => onChange('')}
            className="text-xs text-rose-500 hover:text-rose-700 block transition-colors">
            Remove photo
          </button>
        )}
        <p className="text-2xs text-slate-400">JPG, PNG, WEBP · max 10 MB</p>
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ── Client Modal (Create / Edit) ──────────────────────────────────────────────

const MODAL_TABS = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'address',  label: 'Address',  icon: MapPin },
  { id: 'more',     label: 'More',     icon: FileText },
];

function ClientModal({ client, onClose, onSave }) {
  const [form, setForm]     = useState(client ?? EMPTY);
  const [tab, setTab]       = useState('overview');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [docs, setDocs]     = useState(() => {
    try { return JSON.parse(client?.documents ?? '[]'); } catch { return []; }
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name?.trim()) { setTab('overview'); setError('Full name is required.'); return; }
    setSaving(true); setError('');
    try {
      await onSave({ ...form, documents: JSON.stringify(docs) });
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Failed to save. Check your connection.');
    } finally { setSaving(false); }
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      title={client ? 'Edit Customer' : 'New Customer'}
      subtitle={client ? `ID #${client.id}` : 'Fill in the details below'}
      width="max-w-2xl"
      footer={
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {MODAL_TABS.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => setTab(id)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${tab === id ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors">Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={saving}
              className="px-6 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors font-medium shadow-sm">
              {saving ? 'Saving…' : client ? 'Update Customer' : 'Save Customer'}
            </button>
          </div>
        </div>
      }
    >
      {/* Sticky tab nav */}
      <div className="sticky top-0 z-10 flex border-b border-slate-200 px-6 bg-white gap-1">
        {MODAL_TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
              tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-6 mt-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      <div className="px-6 py-5">
          {tab === 'overview' && (
            <div className="space-y-5">
              {/* Avatar */}
              <Field label="Profile Photo / Avatar">
                <AvatarUploader
                  avatar={form.avatar || ''}
                  initials={(form.display_name || form.name || '').split(' ').slice(0,2).map(w=>w[0]?.toUpperCase()??'').join('')}
                  onChange={v => set('avatar', v)}
                />
              </Field>

              <Field label="Customer Type">
                <div className="flex gap-2">
                  {['business', 'individual'].map(t => (
                    <button key={t} type="button" onClick={() => set('customer_type', t)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all capitalize ${
                        form.customer_type === t ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'
                      }`}>
                      {t === 'business' ? <Building2 size={15} /> : <User size={15} />}{t}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {form.customer_type === 'business' && (
                  <Field label="Company Name">
                    <input value={form.company} onChange={e => set('company', e.target.value)} className={inputCls} placeholder="e.g. Fitman Fitness Ltd." />
                  </Field>
                )}
                <Field label="Full Name" required>
                  <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Primary contact name" />
                </Field>
                <Field label="Display Name">
                  <input value={form.display_name} onChange={e => set('display_name', e.target.value)} className={inputCls} placeholder="Name shown on invoices" />
                </Field>
              </div>
              <Field label="In Primary Language">
                <input value={form.name_primary} onChange={e => set('name_primary', e.target.value)} className={inputCls} placeholder="Full name in English" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Email Address">
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="email@example.com" />
                </Field>
                <Field label="Customer Number">
                  <input value={form.customer_number} onChange={e => set('customer_number', e.target.value)} className={inputCls} placeholder="Auto-generated if blank" />
                </Field>
                <Field label="Phone">
                  <input value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls} placeholder="+92 300 1234567" />
                </Field>
                <Field label="Customer Language">
                  <select value={form.customer_language} onChange={e => set('customer_language', e.target.value)} className={selectCls}>
                    {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Currency">
                  <select value={form.currency} onChange={e => set('currency', e.target.value)} className={selectCls}>
                    {CURRENCIES.map(({ code, name }) => <option key={code} value={code}>{code} — {name}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <div className="flex gap-2">
                    {['active', 'inactive', 'lead'].map(s => (
                      <button key={s} type="button" onClick={() => set('status', s)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all capitalize ${
                          form.status === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'
                        }`}>
                        {form.status === s && <Check size={11} className="inline mr-1" />}{s}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            </div>
          )}

          {tab === 'address' && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center"><MapPin size={13} className="text-indigo-600" /></div>
                  <h3 className="text-sm font-semibold text-slate-700">Billing Address</h3>
                </div>
                <div className="space-y-3">
                  <Field label="Street Address">
                    <input value={form.address} onChange={e => set('address', e.target.value)} className={inputCls} placeholder="Street / Area" />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="City"><input value={form.city} onChange={e => set('city', e.target.value)} className={inputCls} placeholder="City" /></Field>
                    <Field label="Zip Code"><input value={form.zip} onChange={e => set('zip', e.target.value)} className={inputCls} placeholder="12345" /></Field>
                    <Field label="Country"><input value={form.country} onChange={e => set('country', e.target.value)} className={inputCls} placeholder="Country" /></Field>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-violet-100 rounded-lg flex items-center justify-center"><Truck size={13} className="text-violet-600" /></div>
                    <h3 className="text-sm font-semibold text-slate-700">Shipping Address</h3>
                  </div>
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, shipping_address: f.address, shipping_city: f.city, shipping_zip: f.zip, shipping_country: f.country }))}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
                    Same as billing ↑
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Receiver's Name"><input value={form.shipping_receiver_name} onChange={e => set('shipping_receiver_name', e.target.value)} className={inputCls} placeholder="Who receives the delivery" /></Field>
                    <Field label="Receiver's Phone"><input value={form.shipping_receiver_phone} onChange={e => set('shipping_receiver_phone', e.target.value)} className={inputCls} placeholder="+92 300 1234567" /></Field>
                  </div>
                  <Field label="Street Address"><input value={form.shipping_address} onChange={e => set('shipping_address', e.target.value)} className={inputCls} placeholder="Shipping street / area" /></Field>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="City"><input value={form.shipping_city} onChange={e => set('shipping_city', e.target.value)} className={inputCls} placeholder="City" /></Field>
                    <Field label="Zip Code"><input value={form.shipping_zip} onChange={e => set('shipping_zip', e.target.value)} className={inputCls} placeholder="12345" /></Field>
                    <Field label="Country"><input value={form.shipping_country} onChange={e => set('shipping_country', e.target.value)} className={inputCls} placeholder="Country" /></Field>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'more' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Products Origin">
                  <div className="relative">
                    <Package size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={form.products_origin} onChange={e => set('products_origin', e.target.value)} className={`${inputCls} pl-9`} placeholder="e.g. Pakistan" />
                  </div>
                </Field>
                <Field label="Payment Terms">
                  <div className="relative">
                    <Clock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} className={`${selectCls} pl-9`}>
                      {PAYMENT_TERMS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </Field>
              </div>
              <Field label="Customer Owner">
                <div className="relative">
                  <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={form.customer_owner} onChange={e => set('customer_owner', e.target.value)} className={`${inputCls} pl-9`} placeholder="Assign a team member" />
                </div>
              </Field>
              <Field label="Documents">
                <p className="text-xs text-slate-400 mb-2">Upload up to 3 files · 10 MB each</p>
                <DocUploader docs={docs} onChange={setDocs} />
              </Field>
              <Field label="Notes">
                <textarea rows={4} value={form.notes} onChange={e => set('notes', e.target.value)}
                  className={`${inputCls} resize-none`} placeholder="Internal notes about this customer…" />
              </Field>
            </div>
          )}
      </div>
    </Drawer>
  );
}

// ── New Transaction Dropdown ──────────────────────────────────────────────────

function NewTransactionButton({ client }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 bg-indigo-600 text-white px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
        <Plus size={14} /> New Transaction
        <ChevronDown size={13} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden animate-modal">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">
              For {client.display_name || client.name}
            </p>
          </div>
          {[
            { label: 'New Quotation', icon: FileText, path: '/quotations/new' },
            { label: 'New Invoice',   icon: Receipt,  path: '/invoices/new'   },
          ].map(({ label, icon: Icon, path }) => (
            <button key={path} onClick={() => { setOpen(false); navigate(path, { state: { client } }); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left">
              <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon size={14} className="text-slate-500" />
              </div>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Client List Item ──────────────────────────────────────────────────────────

function ClientListItem({ client, isSelected, onClick }) {
  const label = client.display_name || client.name || '?';
  const initials = label.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-slate-100 transition-colors flex items-center gap-3 relative
        ${isSelected
          ? 'bg-indigo-50 border-l-[3px] border-l-indigo-600'
          : 'hover:bg-slate-50/80 border-l-[3px] border-l-transparent'
        }`}
    >
      <div className={`w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden
        ${!client.avatar ? (isSelected ? 'bg-indigo-600' : 'bg-slate-100') : ''}`}>
        {client.avatar
          ? <img src={client.avatar} alt={label} className="w-full h-full object-cover" />
          : <span className={`w-full h-full flex items-center justify-center text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-600'}`}>{initials || '?'}</span>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
          {label}
        </p>
        {client.company && client.company !== label && (
          <p className="text-xs text-slate-400 truncate mt-0.5">{client.company}</p>
        )}
        {client.customer_number && (
          <p className="text-xs text-slate-300 mt-0.5">#{client.customer_number}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <Badge status={client.status} />
        {(client.city || client.country) && (
          <p className="text-2xs text-slate-300 truncate max-w-[80px]">
            {[client.city, client.country].filter(Boolean).join(', ')}
          </p>
        )}
      </div>
    </button>
  );
}

// ── Client Detail Panel (right side) ─────────────────────────────────────────

const DETAIL_TABS = ['Overview', 'Transactions', 'Statement'];

function ClientDetailPanel({ client, stats, statsLoading, onEdit, onDelete }) {
  const [tab, setTab] = useState('Overview');

  // Reset to Overview when client changes
  useEffect(() => { setTab('Overview'); }, [client?.id]);

  if (!client) return null;

  const docs     = (() => { try { return JSON.parse(client.documents ?? '[]'); } catch { return []; } })();
  const billing  = [client.address, client.city, client.zip, client.country].filter(Boolean).join(', ') || null;
  const shipping = [client.shipping_address, client.shipping_city, client.shipping_zip, client.shipping_country].filter(Boolean).join(', ') || null;
  const receiver = [client.shipping_receiver_name, client.shipping_receiver_phone].filter(Boolean).join(' · ') || null;
  const sym      = client.currency || 'USD';

  return (
    <div className="h-full flex flex-col">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden bg-indigo-100">
            {client.avatar
              ? <img src={client.avatar} alt={client.display_name || client.name} className="w-full h-full object-cover" />
              : <span className="w-full h-full flex items-center justify-center text-sm font-bold text-indigo-700">
                  {(client.display_name || client.name || '?').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
                </span>
            }
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900 text-base leading-tight truncate">{client.display_name || client.name}</h2>
              <Badge status={client.status} />
            </div>
            {client.company && <p className="text-slate-400 text-xs truncate">{client.company}</p>}
            {client.customer_number && <p className="text-slate-300 text-xs">#{client.customer_number}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <NewTransactionButton client={client} />
          <button onClick={() => onEdit(client)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium transition-colors">
            <Pencil size={13} /> Edit
          </button>
          <button onClick={() => onDelete(client)}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-slate-200 px-6 flex-shrink-0 bg-white gap-1">
        {DETAIL_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-all duration-150 ${
              tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto bg-slate-50/40">

        {/* ── Overview ── */}
        {tab === 'Overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 divide-x-0 lg:divide-x divide-slate-100 min-h-full">

            {/* Left */}
            <div className="lg:col-span-3 px-6 py-5 space-y-6">

              {/* Contact */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Contact</h3>
                <div className="space-y-2">
                  {client.phone && (
                    <div className="flex items-center gap-2.5 text-sm text-slate-700">
                      <Phone size={13} className="text-slate-400 flex-shrink-0" />
                      {client.phone}
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center gap-2.5 text-sm text-slate-700">
                      <Mail size={13} className="text-slate-400 flex-shrink-0" />
                      <a href={`mailto:${client.email}`} className="text-indigo-600 hover:underline">{client.email}</a>
                    </div>
                  )}
                  {!client.phone && !client.email && (
                    <p className="text-slate-400 text-sm italic">No contact info</p>
                  )}
                </div>
              </div>

              {/* Address */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Address</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1">
                      <MapPin size={11} className="text-indigo-400" /> Billing
                    </p>
                    <p className="text-sm text-slate-700">{billing ?? <span className="text-slate-400 italic">No billing address</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1">
                      <Truck size={11} className="text-violet-400" /> Shipping
                    </p>
                    {receiver && <p className="text-xs text-indigo-600 font-medium mb-0.5">{receiver}</p>}
                    <p className="text-sm text-slate-700">{shipping ?? <span className="text-slate-400 italic">No shipping address</span>}</p>
                  </div>
                </div>
              </div>

              {/* Other Details */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Details</h3>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                  {[
                    { label: 'Customer Type',    value: client.customer_type },
                    { label: 'Customer #',       value: client.customer_number },
                    { label: 'Currency',         value: client.currency },
                    { label: 'Products Origin',  value: client.products_origin },
                    { label: 'Payment Terms',    value: client.payment_terms },
                    { label: 'Owner',            value: client.customer_owner },
                    { label: 'Language',         value: client.customer_language },
                    { label: 'Added',            value: fmt(client.created_at) },
                  ].filter(({ value }) => value).map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className="text-sm text-slate-800 font-medium capitalize">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {client.notes && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes</h3>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {client.notes}
                  </div>
                </div>
              )}

              {/* Documents */}
              {docs.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Documents</h3>
                  <div className="space-y-2">
                    {docs.map(doc => (
                      <a key={doc.filename} href={doc.url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-3 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl px-3 py-2.5 transition-colors group">
                        <File size={14} className="text-indigo-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 group-hover:text-indigo-700 truncate">{doc.originalName}</p>
                          <p className="text-xs text-slate-400">{fmtSize(doc.size)}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Financials */}
            <div className="lg:col-span-2 px-5 py-5 space-y-5 bg-white">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Payment Due Period</p>
                <p className="text-sm font-semibold text-slate-800">{client.payment_terms || 'Due on Receipt'}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Receivables</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100">
                      <th className="text-left pb-2 font-semibold">Currency</th>
                      <th className="text-right pb-2 font-semibold">Outstanding</th>
                      <th className="text-right pb-2 font-semibold">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-slate-700">
                      <td className="py-2">{sym}</td>
                      <td className="py-2 text-right font-medium text-rose-600">
                        {statsLoading ? '…' : fmtMoney(stats?.stats?.outstanding ?? 0)}
                      </td>
                      <td className="py-2 text-right font-medium text-emerald-700">
                        {statsLoading ? '…' : fmtMoney(stats?.stats?.total_revenue ?? 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {!statsLoading && (stats?.stats?.pipeline_value ?? 0) > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-indigo-600 font-semibold">Pipeline (Quotations)</p>
                    <span className="text-2xs font-mono text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full">
                      {stats.stats.currency || sym}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-indigo-700 mt-0.5">
                    {sym} {fmtMoney(stats.stats.pipeline_value)}
                  </p>
                  {stats.quotations?.some(q => (q.currency || sym) !== sym) && (
                    <p className="text-2xs text-indigo-500/70 mt-1">
                      Includes quotes in other currencies, converted via your exchange rates.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Quotations', value: statsLoading ? '…' : (stats?.stats?.quotations_count ?? 0) },
                  { label: 'Invoices',   value: statsLoading ? '…' : (stats?.stats?.invoices_count  ?? 0) },
                  { label: 'Payments',   value: statsLoading ? '…' : (stats?.stats?.payments_count  ?? 0) },
                  { label: 'Revenue',    value: statsLoading ? '…' : fmtMoney(stats?.stats?.total_revenue ?? 0) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-sm font-bold text-slate-800 truncate">{value}</p>
                    <p className="text-xs text-slate-400">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Transactions ── */}
        {tab === 'Transactions' && (
          <div className="p-6">
            {statsLoading ? (
              <div className="py-12 text-center">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Loading transactions…</p>
              </div>
            ) : (
              <TransactionTimeline stats={stats} sym={sym} />
            )}
          </div>
        )}

        {/* ── Statement ── */}
        {tab === 'Statement' && (
          <div className="p-6">
            {statsLoading ? (
              <div className="py-12 text-center">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Generating statement…</p>
              </div>
            ) : (
              <StatementView client={client} stats={stats} sym={sym} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Transaction Timeline ──────────────────────────────────────────────────────

function TransactionTimeline({ stats, sym }) {
  if (!stats) return <EmptyIllustration text="No transactions yet" sub="Invoices, quotations and payments will appear here." />;

  const events = [
    ...(stats.quotations || []).map(q => ({
      type: 'quotation', date: q.created_at, id: q.id,
      number: q.number, status: q.status, amount: q.total, currency: q.currency,
      label: 'Quotation created',
    })),
    ...(stats.invoices || []).map(i => ({
      type: 'invoice', date: i.created_at, id: i.id,
      number: i.number, status: i.status, amount: i.total, amountPaid: i.amount_paid,
      currency: i.currency, dueDate: i.due_date, label: 'Invoice created',
    })),
    ...(stats.payments || []).map(p => ({
      type: 'payment', date: p.paid_at || p.created_at, id: p.id,
      number: p.invoice_number, method: p.method, reference: p.reference,
      amount: p.amount, currency: p.currency, label: 'Payment received',
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (events.length === 0) return <EmptyIllustration text="No transactions yet" sub="Invoices, quotations and payments will appear here." />;

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />
      <div className="space-y-3">
        {events.map(ev => {
          const isP = ev.type === 'payment';
          const isI = ev.type === 'invoice';
          return (
            <div key={`${ev.type}-${ev.id}`} className="flex gap-4 items-start relative">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 border-white shadow-sm
                ${isP ? 'bg-emerald-100' : isI ? 'bg-indigo-100' : 'bg-violet-100'}`}>
                {isP && <DollarSign size={12} className="text-emerald-600" />}
                {isI && <Receipt    size={12} className="text-indigo-600" />}
                {!isP && !isI && <FileText size={12} className="text-violet-600" />}
              </div>
              <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-slate-800 text-xs">{ev.label}</span>
                      {ev.number && <span className="font-mono text-xs text-slate-400 bg-slate-100 px-1 py-0.5 rounded">{ev.number}</span>}
                      {ev.status && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[ev.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {ev.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{fmt(ev.date)}</p>
                    {isP && ev.method && (
                      <p className="text-xs text-slate-500 mt-0.5">via <span className="capitalize font-medium">{ev.method}</span>
                        {ev.reference && <> · <span className="font-mono">{ev.reference}</span></>}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-bold text-xs tabular-nums ${isP ? 'text-emerald-700' : 'text-slate-800'}`}>
                      {isP ? '+' : ''}{ev.currency || sym} {fmtMoney(ev.amount).replace(/^./, '')}
                    </p>
                    {isI && parseFloat(ev.amountPaid) > 0 && parseFloat(ev.amountPaid) < parseFloat(ev.amount) && (
                      <p className="text-xs text-slate-400 mt-0.5">Paid: {fmtMoney(ev.amountPaid)}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Statement View ────────────────────────────────────────────────────────────

function StatementView({ client, stats, sym }) {
  if (!stats || (stats.invoices.length === 0 && stats.payments.length === 0)) {
    return <EmptyIllustration text="No statement available" sub="A statement will be generated once invoices exist for this client." />;
  }
  const totalPaid = stats.payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
          <p className="text-xs text-slate-400 mb-1">Total Invoiced</p>
          <p className="font-bold text-slate-800">{sym} {fmtMoney(stats.stats.total_revenue).replace(/^./, '')}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center shadow-sm">
          <p className="text-xs text-slate-400 mb-1">Total Paid</p>
          <p className="font-bold text-emerald-700">{sym} {fmtMoney(totalPaid).replace(/^./, '')}</p>
        </div>
        <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-center shadow-sm">
          <p className="text-xs text-slate-400 mb-1">Outstanding</p>
          <p className="font-bold text-rose-600">{sym} {fmtMoney(stats.stats.outstanding).replace(/^./, '')}</p>
        </div>
      </div>

      {stats.invoices.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Invoices</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-400">Invoice #</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-400">Date</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-400">Status</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-400">Amount</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-400">Paid</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-400">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-indigo-600 font-semibold">{inv.number}</td>
                  <td className="px-4 py-2.5 text-slate-600">{fmt(inv.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[inv.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{fmtMoney(inv.total)}</td>
                  <td className="px-4 py-2.5 text-right text-emerald-700 font-semibold">{fmtMoney(inv.amount_paid || 0)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-rose-600">
                    {fmtMoney(Math.max(0, (parseFloat(inv.total) || 0) - (parseFloat(inv.amount_paid) || 0)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {stats.payments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payments Received</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-400">Date</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-400">Invoice</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-400">Method</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-400">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.payments.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-600">{fmt(p.paid_at)}</td>
                  <td className="px-4 py-2.5 font-mono text-indigo-600">{p.invoice_number || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 capitalize">{p.method || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{fmtMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Empty Illustration ────────────────────────────────────────────────────────

function EmptyIllustration({ text, sub }) {
  return (
    <div className="py-16 text-center">
      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <FileText size={20} className="text-slate-300" />
      </div>
      <p className="text-slate-500 font-medium">{text}</p>
      {sub && <p className="text-slate-400 text-sm mt-1">{sub}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const FILTERS = ['All', 'Active', 'Inactive', 'Lead'];

export default function Clients() {
  const [clients,      setClients]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filter,       setFilter]       = useState('All');
  const [selected,     setSelected]     = useState(null);
  const [stats,        setStats]        = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [modal,        setModal]        = useState(null);   // null | 'new' | client
  const [delTarget,    setDelTarget]    = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [delError,     setDelError]     = useState('');

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/clients'); setClients(data); }
    catch { setClients([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Load stats whenever selected client changes
  useEffect(() => {
    if (!selected) { setStats(null); return; }
    setStats(null);
    setStatsLoading(true);
    api.get(`/clients/${selected.id}/stats`)
      .then(r => setStats(r.data))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [selected?.id]);

  const handleSave = async (form) => {
    let saved;
    if (modal?.id) {
      const { data } = await api.put(`/clients/${modal.id}`, form);
      saved = data;
    } else {
      const { data } = await api.post('/clients', form);
      saved = data;
    }
    await load();
    // Keep the selected client up-to-date after edit
    if (modal?.id && selected?.id === modal.id) setSelected(saved);
  };

  const handleDelete = async () => {
    setDeleting(true); setDelError('');
    try {
      await api.delete(`/clients/${delTarget.id}`);
      if (selected?.id === delTarget.id) setSelected(null);
      setDelTarget(null);
      await load();
    } catch (e) {
      setDelError(e?.response?.data?.error ?? 'Failed to delete client.');
    } finally { setDeleting(false); }
  };

  const filtered = clients.filter(c => {
    const matchStatus = filter === 'All' || c.status === filter.toLowerCase();
    const matchSearch = !search || [c.name, c.company, c.display_name, c.email, c.phone, c.city, c.customer_number]
      .some(f => f?.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  });

  const stats_counts = {
    total:    clients.length,
    active:   clients.filter(c => c.status === 'active').length,
    inactive: clients.filter(c => c.status === 'inactive').length,
    lead:     clients.filter(c => c.status === 'lead').length,
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8.5rem)' }}>

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {stats_counts.active} active · {stats_counts.lead} leads · {stats_counts.total} total
          </p>
        </div>
        <button onClick={() => setModal('new')}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
          <Plus size={16} /> New Customer
        </button>
      </div>

      {/* ── Split Pane ── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">

        {/* LEFT: Client List */}
        <div className="w-full lg:w-72 flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200">

          {/* Search & Filter */}
          <div className="p-3 border-b border-slate-100 space-y-2 flex-shrink-0 bg-white">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search clients…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all bg-white"
              />
            </div>
            <div className="flex gap-1">
              {FILTERS.map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-1 py-1 text-xs rounded-lg font-medium transition-all ${
                    filter === f ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}>
                  {f}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 px-0.5">
              {filtered.length} of {clients.length} customer{clients.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-slate-400 text-xs">Loading…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center px-4">
                <Users size={24} className="text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-xs">
                  {search || filter !== 'All' ? 'No matches' : 'No clients yet'}
                </p>
              </div>
            ) : (
              filtered.map(c => (
                <ClientListItem
                  key={c.id}
                  client={c}
                  isSelected={selected?.id === c.id}
                  onClick={() => setSelected(c)}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Detail Panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Inline delete confirmation */}
          {delTarget && (
            <div className="flex items-center gap-3 px-5 py-3 bg-rose-50 border-b border-rose-200 text-sm flex-shrink-0">
              <AlertTriangle size={15} className="text-rose-500 flex-shrink-0" />
              <span className="flex-1 text-rose-700 font-medium">
                Delete <strong>{delTarget.display_name || delTarget.name}</strong>? This cannot be undone.
              </span>
              {delError && <span className="text-rose-600 text-xs mr-2">{delError}</span>}
              <button onClick={() => { setDelTarget(null); setDelError(''); }}
                className="px-3 py-1.5 text-xs border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-100 font-medium">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          )}
          {selected ? (
            <ClientDetailPanel
              client={selected}
              stats={stats}
              statsLoading={statsLoading}
              onEdit={c => setModal(c)}
              onDelete={c => setDelTarget(c)}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50/40">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users size={28} className="text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">Select a client</p>
              <p className="text-slate-400 text-sm mt-1">Click any client in the list to view their details</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Drawer ── */}
      {modal !== null && (
        <ClientModal
          client={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
