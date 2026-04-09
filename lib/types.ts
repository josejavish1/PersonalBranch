export interface ArticleMetrics {
  novedad: number;
  relevancia_estrategica: number;
  impacto_ejecutivo: number;
  aplicabilidad_enterprise: number;
  potencial_editorial: number;
}

export interface Article {
  id: string;
  title: string;
  source_name: string;
  source_url: string;
  article_url: string;
  metrics: ArticleMetrics;
  total_score: number;
  cto_insight: string;
  key_insight: string;
  status: 'pending' | 'saved' | 'discarded';
  published_at: string;
  created_at: string;
}

export interface Source {
  id: string;
  name: string;
  category: 'tier1' | 'tier2';
  url: string;
  is_active: boolean;
  created_at: string;
}

export const METRIC_LABELS: Record<keyof ArticleMetrics, string> = {
  novedad: 'Novedad',
  relevancia_estrategica: 'Relevancia Estratégica',
  impacto_ejecutivo: 'Impacto Ejecutivo',
  aplicabilidad_enterprise: 'Aplicabilidad Enterprise',
  potencial_editorial: 'Potencial Editorial',
};
