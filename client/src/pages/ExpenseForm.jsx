import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import api from '../lib/api';
import { ExpenseModal } from './Expenses';

// Full-page Add / Edit expense form (/expenses/new, /expenses/:id/edit).
// ?project=ID pre-selects a project and returns to it after saving.
export default function ExpenseForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const { state } = useLocation();
  const project = params.get('project') || '';
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [expense, setExpense] = useState(state?.expense || null);
  const [ready, setReady] = useState(!id || !!state?.expense);

  useEffect(() => {
    api.get('/expenses/categories').then(r => setCategories(r.data)).catch(() => {});
    api.get('/projects').then(r => setProjects(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    if (id && !state?.expense) {
      api.get('/expenses').then(r => { setExpense(r.data.find(e => String(e.id) === id) || null); setReady(true); }).catch(() => setReady(true));
    }
  }, [id]);

  const back = () => navigate(project ? `/projects?open=${project}` : '/expenses');
  if (!ready) return <div className="py-24 text-center"><div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" /></div>;
  return (
    <ExpenseModal page expense={expense} categories={categories} projects={projects}
      defaultProjectId={project} onClose={() => navigate(-1)} onSave={back} />
  );
}
