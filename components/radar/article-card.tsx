'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Bookmark, X, Brain, Lightbulb } from 'lucide-react';
import { Article, ArticleMetrics, METRIC_LABELS } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ArticleCardProps {
  article: Article;
  onDiscard: (id: string) => void;
  onSave: (id: string) => void;
}

function ScoreBadge({ score }: { score: number }) {
  const isHigh = score >= 20;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold tracking-tight border',
        isHigh
          ? 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20'
          : 'bg-amber-500/12 text-amber-400 border-amber-500/20'
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', isHigh ? 'bg-emerald-400' : 'bg-amber-400')} />
      {score}/25
    </span>
  );
}

function MetricBar({ value, label }: { value: number; label: string }) {
  const colors = ['', 'bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-blue-400', 'bg-emerald-400'];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
        <span className="text-[11px] font-semibold text-foreground">{value}/5</span>
      </div>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-all',
              i <= value ? colors[value] : 'bg-secondary'
            )}
          />
        ))}
      </div>
    </div>
  );
}

function InsightBlock({
  icon: Icon,
  title,
  content,
  accent,
}: {
  icon: React.ElementType;
  title: string;
  content: string;
  accent: 'blue' | 'amber';
}) {
  return (
    <div
      className={cn(
        'rounded-lg p-4 border text-sm leading-relaxed',
        accent === 'blue'
          ? 'bg-blue-500/5 border-blue-500/15'
          : 'bg-amber-500/5 border-amber-500/15'
      )}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', accent === 'blue' ? 'text-blue-400' : 'text-amber-400')} />
        <span className={cn('text-[11px] font-semibold uppercase tracking-wider', accent === 'blue' ? 'text-blue-400' : 'text-amber-400')}>
          {title}
        </span>
      </div>
      <p className="text-muted-foreground leading-relaxed">{content}</p>
    </div>
  );
}

export function ArticleCard({ article, onDiscard, onSave }: ArticleCardProps) {
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(article.status === 'saved');

  const metrics = article.metrics as ArticleMetrics;
  const metricEntries = Object.entries(METRIC_LABELS) as [keyof ArticleMetrics, string][];

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'hace menos de 1h';
    if (h < 24) return `hace ${h}h`;
    return `hace ${Math.floor(h / 24)}d`;
  };

  const handleSave = () => {
    setIsSaved(true);
    onSave(article.id);
  };

  return (
    <div
      className={cn(
        'rounded-xl border bg-card transition-all duration-200 hover:border-border/80',
        'border-border/60'
      )}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[11px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">
                {article.source_name}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {timeAgo(article.published_at)}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
              {article.title}
            </h3>
          </div>
          <div className="flex-shrink-0">
            <ScoreBadge score={article.total_score} />
          </div>
        </div>

        <button
          onClick={() => setMetricsOpen(!metricsOpen)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors mb-4 group"
        >
          {metricsOpen ? (
            <ChevronUp className="w-3 h-3 group-hover:text-primary transition-colors" />
          ) : (
            <ChevronDown className="w-3 h-3 group-hover:text-primary transition-colors" />
          )}
          {metricsOpen ? 'Ocultar métricas' : 'Ver desglose de métricas'}
        </button>

        {metricsOpen && (
          <div className="grid grid-cols-1 gap-3 mb-4 p-4 rounded-lg bg-muted/40 border border-border/50">
            {metricEntries.map(([key, label]) => (
              <MetricBar key={key} value={metrics[key]} label={label} />
            ))}
          </div>
        )}

        <div className="space-y-3 mb-4">
          <InsightBlock
            icon={Brain}
            title="Por qué le importa a un CTO"
            content={article.cto_insight}
            accent="blue"
          />
          <InsightBlock
            icon={Lightbulb}
            title="Idea fuerte a extraer"
            content={article.key_insight}
            accent="amber"
          />
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <a
            href={article.article_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Ver artículo original
          </a>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDiscard(article.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-all"
            >
              <X className="w-3 h-3" />
              Descartar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaved}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all',
                isSaved
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 cursor-default'
                  : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 hover:border-primary/30'
              )}
            >
              <Bookmark className="w-3 h-3" />
              {isSaved ? 'Guardado' : 'Guardar Idea'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
