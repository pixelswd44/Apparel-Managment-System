import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Save, Loader2, Check, Flame, AlertTriangle,
} from 'lucide-react';
import api from '../lib/api';

// ─── Shared primitives (inlined to keep this file self-contained) ────────────

const inputCls  = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all bg-white placeholder:text-slate-400';
const selectCls = `${inputCls} cursor-pointer`;

function Label({ text, required }) {
  return (
    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
      {text}{required && <span className="text-rose-400 ml-0.5">*</span>}
    </label>
  );
}
function Field({ label, required, children }) {
  return <div><Label text={label} required={required} />{children}</div>;
}

const CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'AED'];

// ─── Main Project Form Page ──────────────────────────────────────────────────

export default function ProjectForm() {
  const navigate = useNavigate();
  const { id }   = useParams();
  const isEdit   = Boolean(id);

  const [form, setForm] = useState({
    title:                '',
    client_id:            '',
    invoice_id:           '',
    currency:             'PKR',
    amount_received:      '',
    exchange_rate_actual: '',
    notes:                '',
    use_invoice:          false,
  });

  const [clients,  setClients]  = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Load clients + invoices (and project if editing) ───────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [cRes, iRes] = await Promise.all([
          api.get('/clients'),
          api.get('/invoices'),
        ]);
        if (cancelled) return;
        setClients(Array.isArray(cRes.data) ? cRes.data : []);
        setInvoices(Array.isArray(iRes.data) ? iRes.data : []);

        if (isEdit) {
          const pRes = await api.get(`/projects/${id}`);
          if (cancelled) return;
          const p = pRes.data;
          setForm({
            title:                p?.title                ?? '',
            client_id:            p?.client_id            ?? '',
            invoice_id:           p?.invoice_id           ?? '',
            currency:             p?.currency             ?? 'PKR',
            amount_received:      p?.amount_received      ?? '',
            exchange_rate_actual: p?.exchange_rate_actual ?? '',
            notes:                p?.notes                ?? '',
            use_invoice:          !!p?.invoice_id,
          });
        }
      } catch (e) {
        if (!cancelled) setError(isEdit ? 'Failed to load project.' : 'Failed to load clients or invoices.');
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [id, isEdit]);

  // Filter invoices by selected client
  const clientInvoices = invoices.filter(i =>
    !form.client_id || String(i.client_id) === String(form.client_id)
  );

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!form.title.trim()) { setError('Project title is required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        title:                form.title.trim(),
        client_id:            form.client_id || null,
        invoice_id:           form.use_invoice ? (form.invoice_id || null) : null,
        currency:             form.currency,
        amount_received:      form.use_invoice ? 0 : (parseFloat(form.amount_received) || 0),
        exchange_rate_actual: form.use_invoice ? 0 : (parseFloat(form.exchange_rate_actual) || 0),
        notes:                form.notes,
      };
      if (isEdit) {
        await api.put(`/projects/${id}`, payload);
      } else {
        await api.post('/projects', payload);
      }
      navigate('/projects');
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Failed to save. Check your connection.');
    } finally {
      setSaving(false);
    }
  }

  const handleCancel = () => navigate('/projects');

  // ── Page loading ───────────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Preparing form…</p>
      </div>
    );
  }

  return (
    <div>
      {/* ── Sticky top bar ── */}
      <div className="-mx-8 -mt-8 px-8 py-4 bg-white border-b border-slate-200 sticky top-0 z-30 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={handleCancel}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors flex-shrink-0 font-medium">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="w-px h-5 bg-slate-200 flex-shrink-0" />
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-orange-50 border border-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Flame size={15} className="text-orange-600" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-900 text-base truncate">
                {isEdit ? 'Edit Project' : 'New Production Project'}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {isEdit ? (form.title || `Project #${id}`) : 'Fill in the basic details to get started'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          {error && <p className="text-xs text-rose-600 max-w-[200px] truncate">{error}</p>}
          <button onClick={handleCancel}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors font-medium">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-all font-semibold shadow-sm shadow-indigo-200">
            {saving
              ? <><Loader2 size={13} className="animate-spin" />Saving…</>
              : <><Save size={13} />{isEdit ? 'Save Changes' : 'Create Project'}</>
            }
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mt-6 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertTriangle size={15} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Form body ── */}
      <div className="mt-6 max-w-3xl">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">

          <Field label="Project Title" required>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className={inputCls} placeholder="e.g. Spring Collection 2026 — XYZ Fashion" autoFocus />
          </Field>

          <Field label="Client">
            <select value={form.client_id} onChange={e => {
              const cid = e.target.value;
              const client = clients.find(c => String(c.id) === cid);
              set('client_id', cid);
              set('invoice_id', '');
              if (client?.currency) set('currency', client.currency);
            }} className={selectCls}>
              <option value="">— No Client —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.company && c.company !== c.name ? ` · ${c.company}` : ''}
                </option>
              ))}
            </select>
          </Field>

          {/* Payment source toggle */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment Source</p>
            <div className="flex gap-2">
              {[['false', 'Manual Entry'], ['true', 'Link Invoice']].map(([v, label]) => (
                <button key={v} type="button"
                  onClick={() => { set('use_invoice', v === 'true'); set('invoice_id', ''); set('amount_received', ''); }}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                    String(form.use_invoice) === v
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-indigo-50'
                  }`}>
                  {String(form.use_invoice) === v && <Check size={11} className="inline mr-1" />}{label}
                </button>
              ))}
            </div>

            {form.use_invoice ? (
              <Field label="Invoice">
                <select value={form.invoice_id} onChange={e => set('invoice_id', e.target.value)} className={selectCls}>
                  <option value="">— Select Invoice —</option>
                  {clientInvoices.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.number} — {i.currency} {(parseFloat(i.total) || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <div className="space-y-3">
                <Field label="Currency">
                  <select value={form.currency}
                    onChange={e => { set('currency', e.target.value); set('exchange_rate_actual', ''); }}
                    className={selectCls}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label={`Amount Received (${form.currency})`}>
                  <div className="relative">
                    {form.currency === 'PKR' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₨</span>}
                    <input type="number" min="0" value={form.amount_received}
                      onChange={e => set('amount_received', e.target.value)}
                      className={`${inputCls} ${form.currency === 'PKR' ? 'pl-7' : ''}`} placeholder="0" />
                  </div>
                </Field>
                {form.currency !== 'PKR' && (
                  <Field label={`Actual Exchange Rate (PKR per 1 ${form.currency})`}>
                    <input type="number" min="0" step="0.01" value={form.exchange_rate_actual}
                      onChange={e => set('exchange_rate_actual', e.target.value)}
                      className={inputCls} placeholder={`e.g. 285 per 1 ${form.currency}`} />
                    {form.exchange_rate_actual > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        You got ₨{parseFloat(form.exchange_rate_actual).toLocaleString()} per 1 {form.currency}
                      </p>
                    )}
                  </Field>
                )}
              </div>
            )}
          </div>

          <Field label="Notes">
            <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
              className={`${inputCls} resize-none`} placeholder="Any special instructions or notes…" />
          </Field>
        </div>

        {/* Bottom actions */}
        <div className="flex justify-between items-center gap-3 py-6 mt-2">
          <button onClick={handleCancel}
            className="flex items-center gap-2 px-4 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors font-medium">
            <ArrowLeft size={14} /> Back to Projects
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-all font-semibold shadow-sm shadow-indigo-200">
            {saving
              ? <><Loader2 size={13} className="animate-spin" />Saving…</>
              : <><Check size={14} />Create Project</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
