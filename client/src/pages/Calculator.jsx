import { useState, useEffect, useMemo } from 'react';
import {
  Calculator as CalcIcon, ChevronDown, ChevronUp, Save, Trash2,
  Package, RefreshCw, Check, X, FileText, AlertTriangle,
} from 'lucide-react';

// COST_FIELDS loaded from API (Settings → Cost Breakdown Items)

const PROFIT_PRESETS = [25, 30, 40, 50, 60, 80, 100];

const CURRENCIES = [
  { code: 'PKR', symbol: '₨', rate: 1 },
  { code: 'USD', symbol: '$', rate: 0.00358 },
];

function emptyCosts(fields) {
  return Object.fromEntries(fields.map(f => [f.key, '']));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(pkr, currency) {
  const cur = CURRENCIES.find(c => c.code === currency) ?? CURRENCIES[0];
  const val = pkr * cur.rate;
  return `${cur.symbol}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parsePKR(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

// ── Shared primitives (module-level to prevent remounting) ────────────────────

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-100 transition-all duration-150 bg-white placeholder:text-slate-400';
const selectCls = `${inputCls} cursor-pointer appearance-none`;

function Label({ children, required }) {
  return (
    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
      {children}{required && <span className="text-rose-400 ml-0.5">*</span>}
    </label>
  );
}

function SectionCard({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {Icon && <Icon size={15} className="text-indigo-500 flex-shrink-0" />}
      <h3 className="text-sm font-semibold text-slate-700">{children}</h3>
    </div>
  );
}

function ToggleSectionTitle({ children, expanded, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2 mb-4 group"
    >
      <h3 className="text-sm font-semibold text-slate-700 flex-1 text-left">{children}</h3>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border transition-colors ${
        expanded
          ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
          : 'bg-slate-100 text-slate-400 border-slate-200'
      }`}>
        {expanded ? 'On' : 'Off'}
      </span>
      {expanded
        ? <ChevronUp size={14} className="text-slate-400" />
        : <ChevronDown size={14} className="text-slate-400" />}
    </button>
  );
}

function SaveTemplateModal({ onSave, onClose, initialName }) {
  const [name, setName] = useState(initialName || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name.trim());
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-overlay">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-modal">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Save as Template</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="mb-4">
          <Label>Template Name</Label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="e.g. Summer T-Shirt 2026"
            className={inputCls}
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors font-medium"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Calculator ───────────────────────────────────────────────────────────

export default function Calculator() {
  const [products, setProducts]         = useState([]);
  const [templates, setTemplates]       = useState([]);
  const [costFields, setCostFields]     = useState([]);
  const [loading, setLoading]           = useState(true);

  // Form state
  const [templateId, setTemplateId]     = useState('');
  const [productId, setProductId]       = useState('');
  const [totalPieces, setTotalPieces]   = useState('');
  const [profitMargin, setProfitMargin] = useState('');
  const [costs, setCosts]               = useState({});
  const [notes, setNotes]               = useState('');
  const [currency, setCurrency]         = useState('PKR');

  // UI state
  const [showNotes, setShowNotes]   = useState(false);
  const [saveModal, setSaveModal]   = useState(false);
  const [saved, setSaved]           = useState(false);
  const [delTarget, setDelTarget]   = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/products').then(r => r.json()),
      fetch('/api/calculator-templates').then(r => r.json()),
      fetch('/api/cost-breakdown-items').then(r => r.json()),
    ]).then(([p, t, c]) => {
      setProducts(Array.isArray(p) ? p : []);
      setTemplates(Array.isArray(t) ? t : []);
      const fields = Array.isArray(c) ? c.filter(f => f.enabled) : [];
      setCostFields(fields);
      setCosts(emptyCosts(fields));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // ── Calculations ──────────────────────────────────────────────────────────

  const costPerPiece = useMemo(
    () => costFields.reduce((sum, f) => sum + parsePKR(costs[f.key]), 0),
    [costs, costFields],
  );

  const profitPct      = parsePKR(profitMargin);
  const profitPerPiece = costPerPiece > 0 && profitPct > 0 ? costPerPiece * (profitPct / 100) : 0;
  const sellingPrice   = costPerPiece + profitPerPiece;
  const pieces         = parsePKR(totalPieces);
  const totalCost      = costPerPiece * pieces;
  const totalProfit    = profitPerPiece * pieces;
  const totalRevenue   = sellingPrice * pieces;

  // ── Template ops ──────────────────────────────────────────────────────────

  function loadTemplate(id) {
    const t = templates.find(t => t.id === parseInt(id));
    if (!t) return;
    setTemplateId(String(t.id));
    setProductId(t.product_id ? String(t.product_id) : '');
    setTotalPieces(t.total_pieces ? String(t.total_pieces) : '');
    setProfitMargin(t.profit_margin ? String(t.profit_margin) : '');
    try { setCosts({ ...emptyCosts(costFields), ...JSON.parse(t.costs || '{}') }); } catch { setCosts(emptyCosts(costFields)); }
    setNotes(t.notes || '');
    setCurrency(t.currency || 'PKR');
    setShowNotes(!!t.notes);
  }

  function resetAll() {
    setTemplateId('');
    setProductId('');
    setTotalPieces('');
    setProfitMargin('');
    setCosts(emptyCosts(costFields));
    setNotes('');
    setCurrency('PKR');
    setShowNotes(false);
    setDelTarget(null);
  }

  async function handleSaveTemplate(name) {
    const body = {
      name,
      product_id: productId || null,
      total_pieces: totalPieces,
      profit_margin: profitMargin,
      costs: JSON.stringify(costs),
      size_breakdown: '{}',
      notes,
      currency,
    };

    let savedRow;
    if (templateId) {
      const r = await fetch(`/api/calculator-templates/${templateId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      savedRow = await r.json();
      setTemplates(prev => prev.map(t => t.id === savedRow.id ? savedRow : t));
    } else {
      const r = await fetch('/api/calculator-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      savedRow = await r.json();
      setTemplates(prev => [savedRow, ...prev]);
      setTemplateId(String(savedRow.id));
    }
    setSaveModal(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDeleteTemplate(id) {
    await fetch(`/api/calculator-templates/${id}`, { method: 'DELETE' });
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (templateId === String(id)) resetAll();
    setDelTarget(null);
  }

  const selectedProduct = products.find(p => p.id === parseInt(productId));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex gap-6 p-6 items-start animate-page">

      {/* ── Left: Calculator form ── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Rate Calculator</h1>
            <p className="text-slate-500 text-sm mt-0.5">Apparel manufacturing cost estimator</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetAll}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw size={14} /> Reset
            </button>
            <button
              onClick={() => setSaveModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors font-medium"
            >
              {saved ? <><Check size={14} /> Saved!</> : <><Save size={14} /> Save as Template</>}
            </button>
          </div>
        </div>

        {/* ── Basic Information ── */}
        <SectionCard>
          <SectionTitle icon={FileText}>Basic Information</SectionTitle>
          <div className="grid grid-cols-2 gap-4">

            {/* Template selector */}
            <div className="col-span-2">
              <Label>Select Template</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select
                    value={templateId}
                    onChange={e => e.target.value ? loadTemplate(e.target.value) : resetAll()}
                    className={selectCls}
                  >
                    <option value="">— New Calculation —</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                {templateId && (
                  delTarget === 'template' ? (
                    <div className="flex items-center gap-1 shrink-0 bg-rose-50 border border-rose-200 rounded-xl px-3">
                      <AlertTriangle size={13} className="text-rose-500" />
                      <span className="text-xs text-rose-600">Delete?</span>
                      <button onClick={() => handleDeleteTemplate(parseInt(templateId))} className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-1.5 py-1 transition-colors">Yes</button>
                      <button onClick={() => setDelTarget(null)} className="text-xs text-slate-500 hover:text-slate-700 px-1.5 py-1 transition-colors">No</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDelTarget('template')}
                      className="p-2.5 text-slate-400 hover:text-rose-500 border border-slate-200 hover:border-rose-200 hover:bg-rose-50 rounded-xl transition-all shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Product */}
            <div className="col-span-2">
              <Label>Product</Label>
              <div className="relative">
                <select
                  value={productId}
                  onChange={e => setProductId(e.target.value)}
                  className={selectCls}
                >
                  <option value="">— Select a product —</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.article_number ? ` · ${p.article_number}` : ''}{p.sku ? ` · SKU: ${p.sku}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              {selectedProduct && (
                <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                  <Package size={11} />
                  <span>Stock: {selectedProduct.stock_quantity} {selectedProduct.unit}</span>
                  {selectedProduct.category_name && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-2xs font-medium"
                      style={{ background: `${selectedProduct.category_color}22`, color: selectedProduct.category_color }}
                    >
                      {selectedProduct.category_name}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Total Pieces */}
            <div>
              <Label>Total Pieces</Label>
              <input
                type="number" min="0" step="any"
                value={totalPieces}
                onChange={e => setTotalPieces(e.target.value)}
                placeholder="e.g. 500"
                className={inputCls}
              />
            </div>

            {/* Profit Margin */}
            <div>
              <Label>Profit Margin (%)</Label>
              <input
                type="number" min="0" step="any"
                value={profitMargin}
                onChange={e => setProfitMargin(e.target.value)}
                placeholder="e.g. 50"
                className={`${inputCls} mb-2`}
              />
              <div className="flex flex-wrap gap-1.5">
                {PROFIT_PRESETS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProfitMargin(String(p))}
                    className={`text-xs px-2.5 py-0.5 rounded-full border font-medium transition-all ${
                      profitMargin === String(p)
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50'
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>

            {/* Profit Per Piece (read-only) */}
            <div className="col-span-2">
              <Label>Profit Per Piece (PKR)</Label>
              <div className={`${inputCls} flex items-center justify-between pointer-events-none`}>
                {profitPerPiece > 0 ? (
                  <span className="text-emerald-600 font-semibold">
                    ₨{profitPerPiece.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                ) : (
                  <span className="text-slate-400 text-xs italic">Enter costs below to enable</span>
                )}
                {profitPct > 0 && costPerPiece > 0 && (
                  <span className="text-xs text-slate-400">{profitPct}% of ₨{costPerPiece.toFixed(2)}</span>
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── Cost Breakdown ── */}
        <SectionCard>
          <SectionTitle icon={CalcIcon}>Cost Breakdown — Per Piece (PKR)</SectionTitle>
          {costFields.length === 0 && (
            <p className="text-sm text-slate-400 italic mb-3">No cost items enabled. Go to Settings → Cost Breakdown Items to configure.</p>
          )}
          <div className="grid grid-cols-3 gap-3">
            {costFields.map(f => (
              <div key={f.key}>
                <Label>{f.label}</Label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">₨</span>
                  <input
                    type="number" min="0" step="any"
                    value={costs[f.key] ?? ''}
                    onChange={e => setCosts(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="0"
                    className={`${inputCls} pl-7`}
                  />
                </div>
              </div>
            ))}
          </div>
          {costPerPiece > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total per piece</span>
              <span className="text-sm font-bold text-slate-900">
                ₨{costPerPiece.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </SectionCard>

        {/* ── Production Notes ── */}
        <SectionCard>
          <ToggleSectionTitle expanded={showNotes} onToggle={() => setShowNotes(v => !v)}>
            Production Notes
          </ToggleSectionTitle>
          {showNotes ? (
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Add any production notes, special instructions, or remarks…"
              className={`${inputCls} resize-none`}
            />
          ) : (
            <p className="text-sm text-slate-400 italic">Toggle on to add production notes.</p>
          )}
        </SectionCard>
      </div>

      {/* ── Right: Cost Summary sidebar ── */}
      <div className="w-72 flex-shrink-0 sticky top-6 space-y-3">

        {/* Summary card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Cost Summary</h3>

          {/* Currency switcher */}
          <div className="flex gap-1 mb-5 p-1 bg-slate-100 rounded-xl">
            {CURRENCIES.map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => setCurrency(c.code)}
                className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all ${
                  currency === c.code
                    ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {c.code}
              </button>
            ))}
          </div>

          {costPerPiece === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <CalcIcon size={22} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-400">Enter cost fields to see the summary</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* Per piece */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Per Piece</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Cost</span>
                    <span className="text-slate-800 font-medium">{fmtCurrency(costPerPiece, currency)}</span>
                  </div>
                  {profitPerPiece > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Profit ({profitPct}%)</span>
                      <span className="text-emerald-600 font-medium">+ {fmtCurrency(profitPerPiece, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
                    <span className="text-slate-700 font-semibold">Selling Price</span>
                    <span className="text-indigo-600 font-bold">{fmtCurrency(sellingPrice, currency)}</span>
                  </div>
                </div>
              </div>

              {/* Totals */}
              {pieces > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Total · {pieces.toLocaleString()} pcs
                  </p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Cost</span>
                      <span className="text-slate-800 font-medium">{fmtCurrency(totalCost, currency)}</span>
                    </div>
                    {totalProfit > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Profit</span>
                        <span className="text-emerald-600 font-medium">+ {fmtCurrency(totalProfit, currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
                      <span className="text-slate-700 font-semibold">Total Revenue</span>
                      <span className="text-indigo-600 font-bold">{fmtCurrency(totalRevenue, currency)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Itemized breakdown */}
              {costFields.some(f => parsePKR(costs[f.key]) > 0) && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Breakdown</p>
                  <div className="space-y-1.5">
                    {costFields.filter(f => parsePKR(costs[f.key]) > 0).map(f => (
                      <div key={f.key} className="flex justify-between text-xs">
                        <span className="text-slate-400">{f.label}</span>
                        <span className="text-slate-600 font-medium">{fmtCurrency(parsePKR(costs[f.key]), currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save button */}
        <button
          type="button"
          onClick={() => setSaveModal(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl transition-colors font-medium"
        >
          <Save size={14} />
          {templateId ? 'Update Template' : 'Save as Template'}
        </button>

        {/* Saved templates list */}
        {templates.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Saved Templates</p>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {templates.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => loadTemplate(t.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-2 ${
                    templateId === String(t.id)
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <FileText size={11} className="flex-shrink-0 opacity-60" />
                  <span className="flex-1 truncate font-medium">{t.name}</span>
                  {t.product_name && (
                    <span className="text-slate-400 text-2xs truncate max-w-[4rem]">{t.product_name}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Save Modal */}
      {saveModal && (
        <SaveTemplateModal
          onSave={handleSaveTemplate}
          onClose={() => setSaveModal(false)}
          initialName={templates.find(t => t.id === parseInt(templateId))?.name ?? ''}
        />
      )}
    </div>
  );
}
