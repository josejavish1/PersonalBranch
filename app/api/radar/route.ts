import { NextRequest, NextResponse } from 'next/server';
import {
  createFirestoreDocument,
  listFirestoreDocuments,
  updateFirestoreDocument,
} from '@/lib/firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ArticleStatus = 'pending' | 'saved' | 'discarded';

type ScoreBreakdown = {
  novedad: number;
  relevancia_estrategica: number;
  impacto_ejecutivo: number;
  aplicabilidad_enterprise: number;
  potencial_editorial: number;
};

type SourceRecord = {
  nombre?: string;
  urlFeed?: string;
  activa?: boolean;
};

type RadarRecord = {
  titulo?: string;
  url?: string;
  fuenteId?: string;
  publishedAt?: string;
  fetchedAt?: string;
  scoreTotal?: number;
  scoreBreakdown?: Partial<ScoreBreakdown>;
  porQueImporta?: string;
  ideaFuerte?: string;
  pilar?: string;
  status?: ArticleStatus;
  updatedAt?: string;
};

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

function simulateRssParse(sourceUrl: string): RssItem[] {
  return [
    {
      title: 'FinOps 2.0: Real-Time Cloud Cost Attribution at Scale',
      link: `${sourceUrl}/finops-2-cost-attribution`,
      description:
        'Strategies for attributing cloud spend to individual features using eBPF-level telemetry and Kubernetes labels.',
      pubDate: new Date(Date.now() - 3 * 3600000).toISOString(),
    },
    {
      title: 'Zero Trust Architecture in Multi-Tenant Kubernetes: Lessons from Production',
      link: `${sourceUrl}/zero-trust-k8s-production`,
      description:
        'Battle-tested patterns for implementing zero trust between workloads in shared cluster environments.',
      pubDate: new Date(Date.now() - 6 * 3600000).toISOString(),
    },
  ];
}

function simulateScore(item: RssItem) {
  const scoreBreakdown: ScoreBreakdown = {
    novedad: Math.floor(Math.random() * 2) + 3,
    relevancia_estrategica: Math.floor(Math.random() * 2) + 3,
    impacto_ejecutivo: Math.floor(Math.random() * 2) + 3,
    aplicabilidad_enterprise: Math.floor(Math.random() * 2) + 3,
    potencial_editorial: Math.floor(Math.random() * 2) + 2,
  };

  const scoreTotal = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
  const isFinOps = item.title.toLowerCase().includes('finops');

  return {
    titulo: item.title,
    url: item.link,
    publishedAt: item.pubDate,
    fetchedAt: new Date().toISOString(),
    scoreTotal,
    scoreBreakdown,
    porQueImporta: isFinOps
      ? 'La atribución de costes en tiempo real convierte FinOps en una palanca de decisión ejecutiva y no solo en revisión financiera a posteriori.'
      : 'El aislamiento lateral entre workloads es un problema estratégico de riesgo, resiliencia y gobierno en estates complejos.',
    ideaFuerte: isFinOps
      ? 'Instrumentar por workload y feature permite ligar coste marginal a decisiones de producto y plataforma.'
      : 'Identity-based security, policy-as-code y observabilidad de malla forman una base operable para Zero Trust en Kubernetes.',
    pilar: isFinOps ? 'Hybrid Cloud y Public Cloud con criterio' : 'Resiliencia, observabilidad y AIOps',
    status: 'pending' as ArticleStatus,
  };
}

function toArticleResponse(id: string, data: RadarRecord, source?: SourceRecord) {
  const metrics: ScoreBreakdown = {
    novedad: Number(data.scoreBreakdown?.novedad ?? 0),
    relevancia_estrategica: Number(data.scoreBreakdown?.relevancia_estrategica ?? 0),
    impacto_ejecutivo: Number(data.scoreBreakdown?.impacto_ejecutivo ?? 0),
    aplicabilidad_enterprise: Number(data.scoreBreakdown?.aplicabilidad_enterprise ?? 0),
    potencial_editorial: Number(data.scoreBreakdown?.potencial_editorial ?? 0),
  };

  return {
    id,
    title: data.titulo ?? 'Sin título',
    source_name: source?.nombre ?? 'Fuente desconocida',
    source_url: source?.urlFeed ?? '',
    article_url: data.url ?? '',
    metrics,
    total_score: Number(data.scoreTotal ?? 0),
    cto_insight: data.porQueImporta ?? '',
    key_insight: data.ideaFuerte ?? '',
    status: (data.status ?? 'pending') as ArticleStatus,
    published_at: data.publishedAt ?? new Date(0).toISOString(),
    created_at: data.fetchedAt ?? new Date(0).toISOString(),
  };
}

async function getSourceIndex() {
  const sourceDocs = await listFirestoreDocuments('fuentes');
  return new Map(sourceDocs.map((document) => [document.id, document.data as SourceRecord]));
}

export async function GET() {
  try {
    const [radarDocs, sourceIndex] = await Promise.all([
      listFirestoreDocuments('radar_diario'),
      getSourceIndex(),
    ]);

    const articles = radarDocs
      .map((document) => {
        const radar = document.data as RadarRecord;
        const source = radar.fuenteId ? sourceIndex.get(radar.fuenteId) : undefined;
        return toArticleResponse(document.id, radar, source);
      })
      .filter((article) => article.total_score >= 15 && article.status !== 'discarded')
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    return NextResponse.json({ articles });
  } catch (error) {
    console.error('Radar GET error:', error);
    return NextResponse.json({ error: 'Failed to load radar' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const sourceDocs = await listFirestoreDocuments('fuentes');
    const activeSources = sourceDocs.filter((document) => (document.data as SourceRecord).activa === true);

    if (activeSources.length === 0) {
      return NextResponse.json({ message: 'No active sources found', processed: 0 });
    }

    const results = [] as RadarRecord[];

    for (const source of activeSources) {
      const sourceData = source.data as SourceRecord;
      const items = simulateRssParse(sourceData.urlFeed ?? 'https://example.com/feed');

      for (const item of items) {
        const scored = simulateScore(item);
        if (scored.scoreTotal >= 15) {
          const document = {
            ...scored,
            fuenteId: source.id,
          };

          results.push(document);
          await createFirestoreDocument('radar_diario', document);
        }
      }
    }

    return NextResponse.json({
      message: `Processed ${activeSources.length} sources, inserted ${results.length} signals`,
      processed: results.length,
    });
  } catch (error) {
    console.error('Radar POST error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status } = body as {
      id?: string;
      status?: ArticleStatus;
    };

    if (!id || !status || !['pending', 'saved', 'discarded'].includes(status)) {
      return NextResponse.json({ error: 'id and a valid status are required' }, { status: 400 });
    }

    const [updated, sourceIndex] = await Promise.all([
      updateFirestoreDocument('radar_diario', id, {
        status,
        updatedAt: new Date().toISOString(),
      }),
      getSourceIndex(),
    ]);

    const radar = updated.data as RadarRecord;
    const source = radar.fuenteId ? sourceIndex.get(radar.fuenteId) : undefined;
    const article = toArticleResponse(updated.id, radar, source);

    return NextResponse.json({ article });
  } catch (error) {
    console.error('Radar PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update radar item' }, { status: 500 });
  }
}
