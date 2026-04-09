import { NextRequest, NextResponse } from 'next/server';
import {
  listFirestoreDocuments,
  updateFirestoreDocument,
} from '@/lib/firestore';
import { processRadarFeeds } from '@/lib/radar-feed-processor';

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
  fuentes?: Record<string, boolean>;
  sourceCount?: number;
  publishedAt?: string;
  fetchedAt?: string;
  scoreTotal?: number;
  scoreBreakdown?: Partial<ScoreBreakdown>;
  porQueImporta?: string;
  ideaFuerte?: string;
  pilar?: string;
  status?: ArticleStatus;
  dedupeKey?: string;
};

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

function buildRadarDedupeKey(data: RadarRecord) {
  return [data.url ?? data.titulo ?? 'untitled', data.publishedAt ?? 'no-date'].join('|');
}

export async function GET() {
  try {
    const [radarDocs, sourceIndex] = await Promise.all([
      listFirestoreDocuments('radar_diario'),
      getSourceIndex(),
    ]);

    const deduped = new Map<string, ReturnType<typeof toArticleResponse>>();

    for (const document of radarDocs) {
      const radar = document.data as RadarRecord;
      const source = radar.fuenteId ? sourceIndex.get(radar.fuenteId) : undefined;
      const article = toArticleResponse(document.id, radar, source);

      if (article.total_score < 15 || article.status === 'discarded') {
        continue;
      }

      const dedupeKey = buildRadarDedupeKey(radar);
      const existing = deduped.get(dedupeKey);
      if (!existing || article.created_at > existing.created_at) {
        deduped.set(dedupeKey, article);
      }
    }

    const articles = Array.from(deduped.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return NextResponse.json({ articles });
  } catch (error) {
    console.error('Radar GET error:', error);
    return NextResponse.json({ error: 'Failed to load radar' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const stats = await processRadarFeeds();
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    console.error('Radar POST error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status } = body as { id?: string; status?: ArticleStatus };

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
