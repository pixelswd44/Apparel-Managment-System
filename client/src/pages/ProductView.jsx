import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import { ProductDrawer } from './Products';

// Full-page product view (/products/:id) — images, pricing, costs and order history.
export default function ProductView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [missing, setMissing] = useState(false);
  const [del, setDel] = useState(null); // null | { error? }

  const load = useCallback(async () => {
    try { const { data } = await api.get(`/products/${id}`); setProduct(data); setMissing(false); }
    catch { setMissing(true); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function remove() {
    try { await api.delete(`/products/${id}`); navigate('/products'); }
    catch (err) { setDel({ error: err?.response?.data?.error || 'Could not delete. The product may be in use.' }); }
  }

  async function duplicate(p) {
    try { const { data } = await api.post(`/products/${p.id}/duplicate`); navigate(`/products/${data.id}`); }
    catch (e) { alert(e?.response?.data?.error ?? 'Failed to duplicate product.'); }
  }

  if (missing) return (
    <div className="py-24 text-center">
      <p className="text-slate-500 font-medium">Product not found</p>
      <button onClick={() => navigate('/products')} className="mt-3 text-sm text-indigo-600 hover:underline">Back to products</button>
    </div>
  );
  if (!product) return <div className="py-24 text-center"><div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" /></div>;

  return (
    <div className="pb-10">
      <button onClick={() => navigate('/products')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-3">
        <ArrowLeft size={15} /> Products
      </button>

      {del && (
        <div className={`flex items-center gap-3 px-4 py-3 mb-3 border rounded-xl text-sm ${del.error ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
          <AlertTriangle size={15} className="flex-shrink-0" />
          <span className="flex-1 font-medium">{del.error || <>Delete <strong>{product.name}</strong>? This cannot be undone.</>}</span>
          <button onClick={() => setDel(null)} className="px-3 py-1.5 text-xs border border-current/30 rounded-lg">{del.error ? 'Close' : 'Cancel'}</button>
          {!del.error && <button onClick={remove} className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium">Delete</button>}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col" style={{ minHeight: '70vh' }}>
        <ProductDrawer
          product={product}
          embedded
          onClose={() => navigate('/products')}
          onEdit={p => navigate(`/products/${p.id}/edit`)}
          onDelete={() => setDel({})}
          onDuplicate={duplicate}
          onApply={load}
        />
      </div>
    </div>
  );
}
