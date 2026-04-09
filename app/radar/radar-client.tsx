'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, RadioTower, Filter, Loader as Loader2, Circle as XCircle } from 'lucide-react';
import { Article } from '@/lib/types';
import { ArticleCard } from '@/components/radar/article-card';

interface RadarClientProps {
  initialArticles: Article[];
}

export function RadarClient({ initialArticles }: RadarClientProps) {
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [isLoading, setIsLoading] = useState(initialArticles.length === 0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'saved'>('pending');
  const [error, setError] = useState('');

  const loadArticles = async () => {
    try {
      setError('');
      const response = await fetch('/api/radar', { cache: 'no-store' });
      const payload = (await response.json()) as { articles?: Article[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo cargar el radar.');
      }

      setArticles(payload.articles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el radar.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadArticles();
  }, []);

  const updateArticleStatus = async (id: string, status: 'saved' | 'discarded') => {
    const previousArticles = articles;

    if (status === 'discarded') {
      setArticles((prev) => prev.filter((article) => article.id !== id));
    } else {
      setArticles((prev) => prev.map((article) => (article.id === id ? { ...article, status } : article)));
    }

    try {
      const response = await fetch('/api/radar', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, status }),
      });

      const payload = (await response.json()) as { article?: Article; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo actualizar la señal.');
      }

      if (status === 'saved' && payload.article) {
        setArticles((prev) => prev.map((article) => (article.id === id ? payload.article as Article : article)));
      }
    } catch (err) {
      setArticles(previousArticles);
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la señal.');
    }
  };

  const handleDiscard = async (id: string) => {
    await updateArticleStatus(id, 'discarded');
  };

  const handleSave = async (id: string) => {
    await updateArticleStatus(id, 'saved');
  };

  const handleProcess = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch('/api/radar', { method: 'POST' });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'No se pudieron procesar los feeds.');
      }

      await loadArticles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron procesar los feeds.');
    } finally {
      setIsProcessing(false);
    }
  };

  const filtered = articles.filter((article) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'pending') return article.status === 'pending';
    if (filterStatus === 'saved') return article.status === 'saved';
    return true;
  });

  const pendingCount = articles.filter((article) => article.status === 'pending').length;
  const savedCount = articles.filter((article) => article.status === 'saved').length;

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

      {error && (
        <p className="mb-4 text-xs text-destructive flex items-center gap-1.5">
          <XCircle className="w-3 h-3 flex-shrink-0" />
          {error}
        </p>
      )}

      <div className="flex items-center gap-1 mb-6 p-1 rounded-lg bg-secondary/50 border border-border/60 w-fit">
        {([
          { key: 'pending', label: 'Pendientes', count: pendingCount },
          { key: 'saved', label: 'Guardados', count: savedCount },
          { key: 'all', label: 'Todos', count: articles.length },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${{filterStatus === key ? 'bg-card text-foreground shadow-sm border border-border/60' : 'text-muted-foreground hover:text-foreground'}}`}
          >
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${{filterStatus === key ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'}}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Cargando radar...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Filter className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Sin señales en esta vista</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {filterStatus === 'pending' ? 'Procesa los feeds para generar nuevas señales o revisa los guardados.' : 'No hay artículos en esta categoría todavía.'}
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
