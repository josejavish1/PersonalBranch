'use client';

import { useState } from 'react';
import { RefreshCw, RadioTower, Filter } from 'lucide-react';
import { Article } from '@/lib/types';
import { ArticleCard } from '@/components/radar/article-card';
import { supabase } from '@/lib/supabase';

interface RadarClientProps {
  initialArticles: Article[];
}

export function RadarClient({ initialArticles }: RadarClientProps) {
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'saved'>('pending');

  const handleDiscard = async (id: string) => {
    setArticles((prev) => prev.filter((a) => a.id !== id));
    await supabase.from('articles').update({ status: 'discarded' }).eq('id', id);
  };

  const handleSave = async (id: string) => {
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'saved' } : a)));
    await supabase.from('articles').update({ status: 'saved' }).eq('id', id);
  };

  const handleProcess = async () => {
    setIsProcessing(true);
    try {
      await fetch('/api/radar', { method: 'POST' });
      const { data } = await supabase
        .from('articles')
        .select('*')
        .gte('total_score', 15)
        .neq('status', 'discarded')
        .order('created_at', { ascending: false });
      if (data) setArticles(data as Article[]);
    } finally {
      setIsProcessing(false);
    }
  };

  const filtered = articles.filter((a) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'pending') return a.status === 'pending';
    if (filterStatus === 'saved') return a.status === 'saved';
    return true;
  });

  const pendingCount = articles.filter((a) => a.status === 'pending').length;
  const savedCount = articles.filter((a) => a.status === 'saved').length;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <RadioTower className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground tracking-tight">Radar Diario</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {articles.length} señal{articles.length !== 1 ? 'es' : ''} con score ≥15/25
          </p>
        </div>
        <button
          onClick={handleProcess}
          disabled={isProcessing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
          {isProcessing ? 'Procesando...' : 'Procesar feeds'}
        </button>
      </div>

      <div className="flex items-center gap-1 mb-6 p-1 rounded-lg bg-secondary/50 border border-border/60 w-fit">
        {([
          { key: 'pending', label: 'Pendientes', count: pendingCount },
          { key: 'saved', label: 'Guardados', count: savedCount },
          { key: 'all', label: 'Todos', count: articles.length },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              filterStatus === key
                ? 'bg-card text-foreground shadow-sm border border-border/60'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                filterStatus === key ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'
              }`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Filter className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Sin señales en esta vista</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {filterStatus === 'pending'
              ? 'Procesa los feeds RSS para generar nuevas señales o revisa los guardados.'
              : 'No hay artículos en esta categoría todavía.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              onDiscard={handleDiscard}
              onSave={handleSave}
            />
          ))}
        </div>
      )}
    </div>
  );
}
