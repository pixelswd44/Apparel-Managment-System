import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Check, User, Building2, MapPin, Truck, FileText,
  Upload, File, XCircle, Package, Clock, Loader2, AlertTriangle,
  MessageSquare, FileImage,
} from 'lucide-react';
import api, { imgUrl } from '../lib/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar' },   { code: 'AED', name: 'UAE Dirham' },
  { code: 'PKR', name: 'Pakistani Rupee' }, { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },   { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'CAD', name: 'Canadian Dollar' }, { code: 'AUD', name: 'Australian Dollar' },
];
const PAYMENT_TERMS = ['Due on Receipt', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];
const LEAD_SOURCES  = ['WhatsApp', 'Instagram', 'Facebook', 'Email', 'Website', 'Referral', 'Alibaba', 'Walk-in', 'Other'];

const EMPTY_CLIENT = {
  customer_type: 'business', name: '', company: '', display_name: '', name_primary: '',
  customer_number: '', email: '', phone: '', customer_language: 'English', currency: 'USD',
  products_origin: 'Pakistan', payment_terms: 'Net 30', customer_owner: '',
  address: '', city: '', zip: '', country: '',
  shipping_receiver_name: '', shipping_receiver_phone: '',
  shipping_address: '', shipping_city: '', shipping_zip: '', shipping_country: '',
  documents: '[]', notes: '', status: 'active', avatar: '',
  lead_source: '', deal_status: 'open',
};

// Right-hand card tabs
const SIDE_TABS = [
  { id: 'lead',    label: 'Lead & Files', icon: MessageSquare },
  { id: 'address', label: 'Address',      icon: MapPin },
  { id: 'terms',   label: 'Terms & Docs', icon: FileText },
];

const inputCls  = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-100 transition-all duration-150 bg-white placeholder:text-slate-400';
const selectCls = `${inputCls} cursor-pointer`;

const fmtSize = b => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function DocUploader({ docs, onChange, max = 3, label = 'file' }) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);
  const isImg = f => /\.(png|jpe?g|gif|webp|svg)$/i.test(f.filename || f.originalName || '');

  const handleFiles = async (e) => {
    const files = [...e.target.files];
    if (docs.length + files.length > max) { alert(`Maximum ${max} ${label}s allowed.`); return; }
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
          {isImg(doc)
            ? <img src={imgUrl(doc.url || doc.filename)} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-slate-200" />
            : <File size={16} className="text-indigo-500 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{doc.originalName}</p>
            <p className="text-xs text-slate-400">{fmtSize(doc.size)}</p>
          </div>
          <button type="button" onClick={() => remove(doc)} className="text-slate-400 hover:text-rose-500 transition-colors">
            <XCircle size={16} />
          </button>
        </div>
      ))}
      {docs.length < max && (
        <>
          <button type="button" onClick={() => inputRef.current?.click()}
            className="w-full border-2 border-dashed border-slate-200 rounded-xl px-4 py-4 flex items-center justify-center gap-2 text-sm text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all">
            <Upload size={16} />
            {uploading ? 'Uploading…' : `Upload ${label} (${docs.length}/${max}) · max 10 MB`}
          </button>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFiles} />
        </>
      )}
    </div>
  );
}

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
      <div
        onClick={() => inputRef.current?.click()}
        className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition-all flex-shrink-0 group relative"
      >
        {avatar ? (
          <img src={imgUrl(avatar)} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl font-bold text-slate-300 group-hover:text-indigo-300 transition-colors">
            {initials || <User size={24} className="text-slate-200" />}
          </span>
        )}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Upload size={16} className="text-white" />
        </div>
      </div>

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

// Card shell used for the bento layout
function Card({ icon: Icon, tone = 'indigo', title, sub, children, className = '' }) {
  const tones = {
    indigo: { bar: 'from-indigo-50/70 via-violet-50/40 to-white', chip: 'bg-indigo-100 text-indigo-600' },
    violet: { bar: 'from-violet-50/60 to-white',                  chip: 'bg-violet-100 text-violet-600' },
    slate:  { bar: 'from-slate-50 to-white',                      chip: 'bg-slate-100 text-slate-600' },
  }[tone];
  return (
    <div className={`bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden ${className}`}>
      <div className={`flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r ${tones.bar} border-b border-slate-100`}>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${tones.chip}`}><Icon size={13} /></div>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {sub && <span className="text-xs text-slate-400 ml-1">{sub}</span>}
      </div>
      <div className="px-6 py-6">{children}</div>
    </div>
  );
}

// ── Main Client Form Page ─────────────────────────────────────────────────────

export default function ClientForm() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const isEdit   = Boolean(id);

  const [form, setForm]     = useState(EMPTY_CLIENT);
  const [docs, setDocs]     = useState([]);
  const [techPacks, setTechPacks] = useState([]);
  const [finalDesigns, setFinalDesigns] = useState([]);
  const [firstMessage, setFirstMessage] = useState(''); // create-only: seeds the conversation log
  const [sideTab, setSideTab] = useState('lead');
  const [pageLoading, setPageLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    setPageLoading(true);
    api.get(`/clients/${id}`)
      .then(({ data }) => {
        if (cancelled) return;
        setForm({ ...EMPTY_CLIENT, ...data });
        try { setDocs(JSON.parse(data?.documents ?? '[]')); } catch { setDocs([]); }
        try { const tp = JSON.parse(data?.tech_packs ?? '[]'); setTechPacks(Array.isArray(tp) ? tp : []); } catch { setTechPacks([]); }
        try { const fd = JSON.parse(data?.final_designs ?? '[]'); setFinalDesigns(Array.isArray(fd) ? fd : []); } catch { setFinalDesigns([]); }
      })
      .catch(() => { if (!cancelled) setError('Failed to load customer.'); })
      .finally(() => { if (!cancelled) setPageLoading(false); });
    return () => { cancelled = true; };
  }, [id, isEdit]);

  const handleCancel = () => navigate('/clients');

  const handleSubmit = async () => {
    if (!form.name?.trim()) { setError('Full name is required.'); return; }
    setSaving(true); setError('');
    try {
      // Never send messages from the form — the detail page owns the conversation log
      // (server does partial updates, so omitting it leaves it untouched on edit).
      const { messages: _m, ...rest } = form;
      const body = {
        ...rest,
        documents: JSON.stringify(docs), tech_packs: JSON.stringify(techPacks), final_designs: JSON.stringify(finalDesigns),
        // Receiver defaults to the customer themself; billing mirrors shipping (single-address model)
        shipping_receiver_name:  (rest.shipping_receiver_name  || '').trim() || rest.name  || '',
        shipping_receiver_phone: (rest.shipping_receiver_phone || '').trim() || rest.phone || '',
        address: rest.shipping_address, city: rest.shipping_city, zip: rest.shipping_zip, country: rest.shipping_country,
      };
      if (isEdit) {
        await api.put(`/clients/${id}`, body);
        navigate('/clients');
      } else {
        if (firstMessage.trim()) {
          body.messages = JSON.stringify([{ id: Date.now(), text: firstMessage.trim(), at: new Date().toISOString(), source: form.lead_source || '' }]);
        }
        await api.post('/clients', body);
        navigate('/clients');
      }
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Failed to save. Check your connection.');
    } finally {
      setSaving(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading customer…</p>
      </div>
    );
  }

  const initials  = (form.display_name || form.name || '').split(' ').slice(0,2).map(w=>w[0]?.toUpperCase()??'').join('');
  const titleName = form.display_name || form.name;

  const saveBtn = (
    <button onClick={handleSubmit} disabled={saving}
      className="flex items-center gap-2 px-5 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-all font-semibold shadow-sm shadow-indigo-200">
      {saving
        ? <><Loader2 size={13} className="animate-spin" />Saving…</>
        : <><Save size={13} />{isEdit ? 'Update Customer' : 'Save Customer'}</>
      }
    </button>
  );

  return (
    <div>
      {/* ── Sticky top bar ── */}
      <div className="-mx-8 -mt-8 px-8 py-4 bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-30 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={handleCancel}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors flex-shrink-0 font-medium">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="w-px h-5 bg-slate-200 flex-shrink-0" />
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-indigo-200">
              <User size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-900 text-base truncate">
                {isEdit ? 'Edit Customer' : 'New Customer'}
              </h1>
              {titleName && <p className="text-xs text-slate-400 mt-0.5 truncate">{titleName}</p>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {error && <p className="text-xs text-rose-600 max-w-[200px] truncate">{error}</p>}
          <button onClick={handleCancel}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors font-medium">
            Cancel
          </button>
          {saveBtn}
        </div>
      </div>

      {error && (
        <div className="mt-6 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertTriangle size={15} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Bento: Customer (left, wide) | Lead & Files / Address / Terms (right, tabbed) ── */}
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-5 gap-5 items-start">

        {/* LEFT — identity & contact */}
        <div className="xl:col-span-3">
          <Card icon={User} tone="indigo" title="Customer" sub="identity & contact">
            <div className="space-y-5">
              <Field label="Profile Photo / Avatar">
                <AvatarUploader avatar={form.avatar || ''} initials={initials} onChange={v => set('avatar', v)} />
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
                  <select value={form.display_name} onChange={e => set('display_name', e.target.value)} className={selectCls}>
                    <option value="">— Select display name —</option>
                    {form.name?.trim() && <option value={form.name.trim()}>Full Name: {form.name.trim()}</option>}
                    {form.customer_type === 'business' && form.company?.trim() && (
                      <option value={form.company.trim()}>Company: {form.company.trim()}</option>
                    )}
                    {form.customer_type === 'business' && form.company?.trim() && form.name?.trim() && (
                      <option value={`${form.name.trim()} (${form.company.trim()})`}>Both: {form.name.trim()} ({form.company.trim()})</option>
                    )}
                  </select>
                </Field>
              </div>

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
                <Field label="Currency">
                  <select value={form.currency} onChange={e => set('currency', e.target.value)} className={selectCls}>
                    {CURRENCIES.map(({ code, name }) => <option key={code} value={code}>{code} — {name}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Notes">
                <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
                  className={`${inputCls} resize-none`} placeholder="Internal notes about this customer…" />
              </Field>
            </div>
          </Card>
        </div>

        {/* RIGHT — one card, three tabs */}
        <div className="xl:col-span-2 xl:sticky xl:top-24">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="flex gap-1.5 px-4 py-3 bg-white border-b border-slate-100 overflow-x-auto scrollbar-hide">
              {SIDE_TABS.map(({ id: tid, label, icon: Icon }) => (
                <button key={tid} type="button" onClick={() => setSideTab(tid)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-xl transition-all whitespace-nowrap ${
                    sideTab === tid ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100' : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
                  }`}>
                  <Icon size={14} />{label}
                </button>
              ))}
            </div>

            <div className="px-5 py-5">

              {/* ── Lead & Files ── */}
              {sideTab === 'lead' && (
                <div className="space-y-5">
                  <div className="rounded-2xl p-4 bg-white border border-slate-200 border-t-4 border-t-indigo-500">
                    <Field label="Where did this client come from?">
                      <div className="flex items-center gap-2 flex-wrap">
                        {LEAD_SOURCES.map(s => (
                          <button key={s} type="button" onClick={() => set('lead_source', form.lead_source === s ? '' : s)}
                            className={`text-sm px-3 py-1.5 rounded-xl border font-medium transition-colors ${
                              form.lead_source === s ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
                            }`}>{s}</button>
                        ))}
                      </div>
                    </Field>
                    <div className="mt-5">
                      <Field label="Deal status">
                        <div className="flex gap-2">
                          {[['open','Open','bg-amber-500 border-amber-500'],['closed_won','Won','bg-emerald-600 border-emerald-600'],['closed_lost','Lost','bg-rose-600 border-rose-600']].map(([k, l, on]) => (
                            <button key={k} type="button" onClick={() => set('deal_status', k)}
                              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                                form.deal_status === k ? `${on} text-white shadow-sm` : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                              }`}>{l}</button>
                          ))}
                        </div>
                      </Field>
                    </div>
                  </div>

                  {!isEdit ? (
                    <Field label="Their first message / requirement">
                      <textarea rows={4} value={firstMessage} onChange={e => setFirstMessage(e.target.value)}
                        className={`${inputCls} resize-none`}
                        placeholder="Paste what the client sent you — quantities, styles, deadline… This starts the conversation log." />
                    </Field>
                  ) : (
                    <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                      Conversation messages are managed on the client's detail page.
                    </p>
                  )}

                  <div className="rounded-2xl p-4 bg-white border border-slate-200 border-t-4 border-t-emerald-500">
                    <div className="flex items-center gap-2 mb-1">
                      <FileImage size={14} className="text-emerald-600" />
                      <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Final Designs</p>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">Only the <strong>approved</strong> artwork — this is what syncs into a project and prints on Cutting / Stitching / Press &amp; Pack.</p>
                    <DocUploader docs={finalDesigns} onChange={setFinalDesigns} max={20} label="final design" />
                  </div>

                  <div className="rounded-2xl p-4 bg-white border border-slate-200 border-t-4 border-t-indigo-500">
                    <div className="flex items-center gap-2 mb-1">
                      <FileImage size={14} className="text-indigo-600" />
                      <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Tech Packs</p>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">Design specs, size charts, reference artwork — kept on the client for reference, <strong>not</strong> auto-synced to projects.</p>
                    <DocUploader docs={techPacks} onChange={setTechPacks} max={10} label="tech pack" />
                  </div>
                </div>
              )}

              {/* ── Address (shipping only; billing = same, kept in sync on save) ── */}
              {sideTab === 'address' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-violet-100 rounded-lg flex items-center justify-center"><Truck size={13} className="text-violet-600" /></div>
                      <h3 className="text-sm font-semibold text-slate-700">Shipping Address</h3>
                    </div>
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, shipping_receiver_name: f.name, shipping_receiver_phone: f.phone }))}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
                      Use customer's name & phone
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Receiver's Name">
                      <input value={form.shipping_receiver_name} onChange={e => set('shipping_receiver_name', e.target.value)}
                        className={inputCls} placeholder={form.name || 'Who receives the delivery'} />
                    </Field>
                    <Field label="Receiver's Phone">
                      <input value={form.shipping_receiver_phone} onChange={e => set('shipping_receiver_phone', e.target.value)}
                        className={inputCls} placeholder={form.phone || '+92 300 1234567'} />
                    </Field>
                  </div>
                  <Field label="Street Address">
                    <input value={form.shipping_address} onChange={e => set('shipping_address', e.target.value)} className={inputCls} placeholder="Street / area" />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="City"><input value={form.shipping_city} onChange={e => set('shipping_city', e.target.value)} className={inputCls} placeholder="City" /></Field>
                    <Field label="Zip Code"><input value={form.shipping_zip} onChange={e => set('shipping_zip', e.target.value)} className={inputCls} placeholder="12345" /></Field>
                    <Field label="Country"><input value={form.shipping_country} onChange={e => set('shipping_country', e.target.value)} className={inputCls} placeholder="Country" /></Field>
                  </div>
                  <p className="text-xs text-slate-400">Blank receiver fields fall back to the customer's own name & phone. This address is also used for billing on documents.</p>
                </div>
              )}

              {/* ── Terms & Docs ── */}
              {sideTab === 'terms' && (
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
                      <input value={form.customer_owner} onChange={e => set('customer_owner', e.target.value)} className={`${inputCls} pl-9`} placeholder="Defaults to you (the logged-in user)" />
                    </div>
                  </Field>
                  <Field label="Documents">
                    <p className="text-xs text-slate-400 mb-2">Contracts, IDs, PO copies · up to 3 files, 10 MB each</p>
                    <DocUploader docs={docs} onChange={setDocs} />
                  </Field>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="flex justify-between items-center gap-3 py-6 mt-2">
        <button onClick={handleCancel}
          className="flex items-center gap-2 px-4 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors font-medium">
          <ArrowLeft size={14} /> Back to Clients
        </button>
        {saveBtn}
      </div>
    </div>
  );
}
