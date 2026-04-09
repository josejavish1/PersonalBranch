import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

interface GeminiScoreResult {
  title: string;
  source_name: string;
  source_url: string;
  article_url: string;
  metrics: {
    novedad: number;
    relevancia_estrategica: number;
    impacto_ejecutivo: number;
    aplicabilidad_enterprise: number;
    potencial_editorial: number;
  };
  total_score: number;
  cto_insight: string;
  key_insight: string;
  published_at: string;
}

function simulateRssParse(sourceUrl: string, sourceName: string): RssItem[] {
  const mockItems: Record<string, RssItem[]> = {
    default: [
      {
        title: `FinOps 2.0: Real-Time Cloud Cost Attribution at Scale`,
        link: `${sourceUrl}/finops-2-cost-attribution`,
        description: 'Strategies for attributing cloud spend to individual features using eBPF-level telemetry and Kubernetes labels.',
        pubDate: new Date(Date.now() - 3 * 3600000).toISOString(),
      },
      {
        title: `Zero Trust Architecture in Multi-Tenant Kubernetes: Lessons from Production`,
        link: `${sourceUrl}/zero-trust-k8s-production`,
        description: 'Battle-tested patterns for implementing zero trust between workloads in shared cluster environments.',
        pubDate: new Date(Date.now() - 6 * 3600000).toISOString(),
      },
    ],
  };
  return mockItems.default;
}

function simulateGeminiScore(item: RssItem, sourceName: string, sourceUrl: string): GeminiScoreResult {
  const scores = {
    novedad: Math.floor(Math.random() * 2) + 3,
    relevancia_estrategica: Math.floor(Math.random() * 2) + 3,
    impacto_ejecutivo: Math.floor(Math.random() * 2) + 3,
    aplicabilidad_enterprise: Math.floor(Math.random() * 2) + 3,
    potencial_editorial: Math.floor(Math.random() * 2) + 2,
  };
  const total = Object.values(scores).reduce((a, b) => a + b, 0);

  const insights: Record<string, { cto: string; key: string }> = {
    finops: {
      cto: 'La atribución de costes en tiempo real por feature o equipo transforma el FinOps de una disciplina reactiva (revisar facturas mensuales) a una palanca de decisión proactiva. Un CTO puede empoderar a los product managers con visibilidad del coste marginal de cada feature, creando incentivos correctos para optimización sin necesidad de mandatos top-down.',
      key: 'Instrumentar el plano de datos con eBPF para capturar métricas de red y CPU por workload, etiquetado automáticamente con labels de Kubernetes, permite una granularidad de atribución de costes imposible con métricas de cloud provider estándar. El ROI típico de esta inversión se recupera en el primer trimestre de operación.',
    },
    zerotrust: {
      cto: 'En entornos multi-tenant, la superficie de ataque lateral entre workloads es el vector más subestimado. Un CTO debe entender que Zero Trust en Kubernetes no es solo una política de red: es un modelo de confianza que afecta al diseño de APIs internas, gestión de secretos y estrategia de observabilidad. Los fallos en este área son los que generan los post-mortems más costosos en términos de reputación.',
      key: 'La combinación de mTLS con SPIFFE/SPIRE para identidad de workload, políticas de red Cilium basadas en identidad (no IPs), y OPA/Gatekeeper para admission control proporciona defensa en profundidad sin sacrificar la velocidad de despliegue. Implementar en "audit mode" durante 30 días antes de enforcement reduce los falsos positivos en un 85%.',
    },
  };

  const insightKey = item.title.toLowerCase().includes('finops') ? 'finops' : 'zerotrust';

  return {
    title: item.title,
    source_name: sourceName,
    source_url: sourceUrl,
    article_url: item.link,
    metrics: scores,
    total_score: total,
    cto_insight: insights[insightKey].cto,
    key_insight: insights[insightKey].key,
    published_at: item.pubDate,
  };
}

export async function POST() {
  try {
    const { data: sources } = await supabase
      .from('sources')
      .select('*')
      .eq('is_active', true);

    if (!sources || sources.length === 0) {
      return NextResponse.json({ message: 'No active sources found', processed: 0 });
    }

    const results: GeminiScoreResult[] = [];

    for (const source of sources) {
      const items = simulateRssParse(source.url, source.name);
      for (const item of items) {
        const scored = simulateGeminiScore(item, source.name, source.url);
        if (scored.total_score >= 15) {
          results.push(scored);
        }
      }
    }

    if (results.length > 0) {
      await supabase.from('articles').insert(
        results.map((r) => ({
          title: r.title,
          source_name: r.source_name,
          source_url: r.source_url,
          article_url: r.article_url,
          metrics: r.metrics,
          total_score: r.total_score,
          cto_insight: r.cto_insight,
          key_insight: r.key_insight,
          status: 'pending',
          published_at: r.published_at,
        }))
      );
    }

    return NextResponse.json({
      message: `Processed ${sources.length} sources, inserted ${results.length} articles`,
      processed: results.length,
    });
  } catch (error) {
    console.error('Radar processing error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

export async function GET() {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .gte('total_score', 15)
    .neq('status', 'discarded')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ articles: data });
}
