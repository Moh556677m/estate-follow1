import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, CheckSquare, Square, Building2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import { listTasks, createTask, updateTask, deleteTask } from '@/lib/ownerFeaturesClient';
import { notify } from '@/lib/notify';
import { formatDate } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

// Task #17 — Task Center. A real to-do list backed by the new owner_tasks
// collection (create is server-gated by task17-hooks.pb.js's requireFeature
// check, so a raw API call can't bypass the same rule this panel enforces).
export default function TaskCenterPanel({ properties = [] } = {}) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [priority, setPriority] = useState('normal');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('open');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setTasks(await listTasks(user.id));
    } catch {
      /* keep last-known list on transient failure */
    } finally {
      setLoading(false);
    }
  }, [user]);

  const available = isAvailable('task_center');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  useRealtimeRefresh(load, ['owner_tasks'], { enabled: available });

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'مركز المهام' : 'Task Center'}
        reason={features.task_center?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  const addTask = async (e) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await createTask({
        owner: user.id,
        title: title.trim(),
        due_date: dueDate || null,
        property: propertyId || null,
        priority,
        status: 'todo',
      });
      setTitle('');
      setDueDate('');
      setPropertyId('');
      setPriority('normal');
      load();
    } catch (err) {
      notify.error(isAr ? 'تعذر الإضافة' : 'Could not add task', String(err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (task) => {
    const next = task.status === 'done' ? 'todo' : 'done';
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    try {
      await updateTask(task.id, { status: next });
    } catch {
      load();
    }
  };

  const remove = async (task) => {
    setTasks((ts) => ts.filter((t) => t.id !== task.id));
    try {
      await deleteTask(task.id);
    } catch {
      load();
    }
  };

  const visible = tasks.filter((t) => (filter === 'all' ? true : filter === 'done' ? t.status === 'done' : t.status !== 'done'));
  const propById = Object.fromEntries(properties.map((p) => [p.id, p]));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{isAr ? 'مركز المهام' : 'Task Center'}</h2>
        <p className="text-sm text-muted-foreground">{isAr ? 'قائمة مهام حقيقية متعلقة بالعقارات.' : 'A real to-do list for property-related tasks.'}</p>
      </div>

      <form onSubmit={addTask} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isAr ? 'مهمة جديدة...' : 'New task...'}
          className="min-h-[40px] flex-1 min-w-[160px] rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm"
        />
        {properties.length > 0 && (
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm">
            <option value="">{isAr ? 'بدون عقار' : 'No property'}</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.building} / {p.unit_number}</option>)}
          </select>
        )}
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm">
          <option value="low">{isAr ? 'منخفضة' : 'Low'}</option>
          <option value="normal">{isAr ? 'عادية' : 'Normal'}</option>
          <option value="high">{isAr ? 'عالية' : 'High'}</option>
        </select>
        <Button type="submit" disabled={saving || !title.trim()} className="min-h-[40px] gap-1">
          <Plus size={15} />{isAr ? 'إضافة' : 'Add'}
        </Button>
      </form>

      <div className="flex gap-2">
        {['open', 'done', 'all'].map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1.5 text-xs font-medium min-h-[32px] ${filter === f ? 'bg-primary text-primary-foreground border-primary' : 'bg-card'}`}>
            {f === 'open' ? (isAr ? 'مفتوحة' : 'Open') : f === 'done' ? (isAr ? 'منجزة' : 'Done') : (isAr ? 'الكل' : 'All')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={18} /></div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">{isAr ? 'لا توجد مهام.' : 'No tasks.'}</div>
      ) : (
        <div className="space-y-2">
          {visible.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
              <button type="button" onClick={() => toggleDone(t)} className="shrink-0 text-primary">
                {t.status === 'done' ? <CheckSquare size={18} /> : <Square size={18} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${t.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  {t.due_date && <span>{formatDate(t.due_date, lang)}</span>}
                  {t.property && propById[t.property] && <span className="flex items-center gap-1"><Building2 size={11} />{propById[t.property].building}</span>}
                  {t.priority === 'high' && <span className="text-red-600">{isAr ? 'عالية' : 'High'}</span>}
                </p>
              </div>
              <button type="button" onClick={() => remove(t)} className="shrink-0 text-muted-foreground hover:text-red-600">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
