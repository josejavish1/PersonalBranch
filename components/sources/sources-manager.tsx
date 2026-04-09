'use client';

import { useState } from 'react';
import { Plus, Trash2, Globe, CircleCheck as CheckCircle2, Circle as XCircle, Loader as Loader2 } from 'lucide-react';
import { Source } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface SourcesManagerProps {
  initialSources: Source[];
}

interface NewSourceForm {
  name: string;
  category: 'tier1' | 'tier2';
  url: string;
}

const CATEGORY_LABELS: Record<string, { label: string; className: string }> = {
  tier1: {
    label: 'Tier 1',
    className: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  tier2: {
    label: 'Tier 2',
    className: 'bg-secondary text-muted-foreground border-border/60',
  },
};

export function SourcesManager({ initialSources }: SourcesManagerProps) {
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<NewSourceForm>({
    name: '',
    category: 'tier1',
    url: '',
  });
  const [error, setError] = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim() || !form.url.trim()) {
      setError('El nombre y la URL son obligatorios.');
      return;
    }

    try {
      new URL(form.url);
    } catch {
      setError('La URL no tiene un formato válido.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error: dbError } = await supabase
        .from('sources')
        .insert({ name: form.name.trim(), category: form.category, url: form.url.trim() })
        .select()
        .single();

      if (dbError) throw dbError;
      setSources((prev) => [data as Source, ...prev]);
      setForm({ name: '', category: 'tier1', url: '' });
      setShowForm(false);
    } catch {
      setError('Error al guardar la fuente. Inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await supabase.from('sources').delete().eq('id', id);
      setSources((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (source: Source) => {
    const updated = { ...source, is_active: !source.is_active };
    setSources((prev) => prev.map((s) => (s.id === source.id ? updated : s)));
    await supabase.from('sources').update({ is_active: updated.is_active }).eq('id', source.id);
  };

  const tier1 = sources.filter((s) => s.category === 'tier1');
  const tier2 = sources.filter((s) => s.category === 'tier2');

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight mb-1.5">Mis Fuentes</h1>
          <p className="text-sm text-muted-foreground">
            {sources.length} fuente{sources.length !== 1 ? 's' : ''} registrada{sources.length !== 1 ? 's' : ''} &middot;{' '}
            {sources.filter((s) => s.is_active).length} activa{sources.filter((s) => s.is_active).length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(''); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all text-sm font-medium shadow-sm shadow-primary/20"
        >
          <Plus className="w-4 h-4" />
          Añadir fuente
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-5 rounded-xl border border-primary/20 bg-primary/5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Nueva fuente RSS</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Nombre de la fuente
                </label>
                <input
                  type="text"
                  placeholder="Ej: The New Stack"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Categoría
                </label>
                <div className="flex gap-2">
                  {(['tier1', 'tier2'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setForm({ ...form, category: cat })}
                      className={cn(
                        'flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                        form.category === cat
                          ? CATEGORY_LABELS[cat].className
                          : 'bg-background border-border text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {CATEGORY_LABELS[cat].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                URL del feed RSS
              </label>
              <input
                type="url"
                placeholder="https://example.com/feed/"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all"
              />
            </div>
            {error && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <XCircle className="w-3 h-3 flex-shrink-0" />
                {error}
              </p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all text-sm font-medium disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {isSubmitting ? 'Guardando...' : 'Guardar fuente'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setError(''); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Globe className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Sin fuentes todavía</p>
          <p className="text-xs text-muted-foreground">Añade tu primer feed RSS para comenzar.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {[
            { category: 'tier1', label: 'Tier 1 — Fuentes Primarias', items: tier1 },
            { category: 'tier2', label: 'Tier 2 — Fuentes Secundarias', items: tier2 },
          ].map(
            ({ label, items }) =>
              items.length > 0 && (
                <div key={label}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 px-1">
                    {label}
                  </p>
                  <div className="rounded-xl border border-border/60 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/60 bg-secondary/30">
                          <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Nombre
                          </th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            URL del Feed
                          </th>
                          <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Estado
                          </th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((source, idx) => (
                          <tr
                            key={source.id}
                            className={cn(
                              'transition-colors hover:bg-secondary/20',
                              idx !== items.length - 1 && 'border-b border-border/40'
                            )}
                          >
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                                </div>
                                <span className="text-sm font-medium text-foreground">{source.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-primary transition-colors font-mono truncate block max-w-xs"
                              >
                                {source.url}
                              </a>
                            </td>
                            <td className="px-4 py-3.5">
                              <button
                                onClick={() => handleToggleActive(source)}
                                className={cn(
                                  'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-all',
                                  source.is_active
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                    : 'bg-secondary text-muted-foreground border-border/60 hover:bg-secondary/80'
                                )}
                              >
                                {source.is_active ? (
                                  <CheckCircle2 className="w-3 h-3" />
                                ) : (
                                  <XCircle className="w-3 h-3" />
                                )}
                                {source.is_active ? 'Activa' : 'Inactiva'}
                              </button>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <button
                                onClick={() => handleDelete(source.id)}
                                disabled={deletingId === source.id}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-50"
                              >
                                {deletingId === source.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
          )}
        </div>
      )}
    </div>
  );
}
