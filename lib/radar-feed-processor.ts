import crypto from 'node:crypto';
import {
  listFirestoreDocuments,
  setFirestoreDocument,
  updateFirestoreDocument,
  deleteFirestoreDocument,
} from '@/lib/firestore';

type Fuente = {
  nombre?: string;
  urlFeed?: string;
  activa?: boolean;
  tier?: string;
  peso?: number;
};

type ParsedFeedItem = {
  guid: string | null;
  link: string | null;
  title: string;
  description: string;
  publishedAt: string | null;
};

type ProcessStats = {
  feedsProcessed: number;
  feedsFailed: number;
  rawItemsSeen: number;
  rawItemsInserted: number;
  rawItemsUpdated: number;
  storiesCreated: number;
  storiesUpdated: number;
  skippedInvalid: number;
};

type ExistingRadarRecord = {
  titulo?: string;
  url?: string;
  fuenteId?: string;
  fuentes?: Record<string, boolean>;
  sourceCount?: number;
  publishedAt?: string;
  fetchedAt?: string;
  scoreTotal?: number;
  scoreBreakdown?: Record<string, number>;
  porQueImporta?: string;
  ideaFuerte?: string;
  pilar?: string;
  status?: 'pending' | 'saved' | 'discarded';
  dedupeKey?: string;
  updatedAt?: string;
};

const FUENTES_COLLECTION = 'fuentes';
const FEED_ITEMS_COLLECTION = 'feed_items';
const RADAR_COLLECTION = 'radar_diario';

function sha1(value: string) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function stripCdata(value: string) {
  return value.replace(/^<!\[CDATA\[|\]\]>$/g, '');
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ');
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function normalizeWhitespace(value: string) {
  return decodeEntities(stripHtml(stripCdata(value))).replace(/\s+/g, ' ').trim();
}

function normalizeTitle(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function toIsoDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getTagValue(block: string, tagNames: string[]) {
  for (const tagName of tagNames) {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
    const match = block.match(regex);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }

  return '';
}

function getAtomLink(block: string, feedUrl: string) {
  const match =
    block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i) ||
    block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i);

  if (!match?.[1]) return null;

  try {
    return new URL(match[1], feedUrl).toString();
  } catch {
    return null;
  }
}

function getRssLink(block: string, feedUrl: string) {
  const link = getTagValue(block, ['link']);
  if (!link) return null;

  try {
    return new URL(link, feedUrl).toString();
  } catch {
    return null;
  }
}

function parseFeedXml(xml: string, feedUrl: string): ParsedFeedItem[] {
  const itemMatches = Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi));
  if (itemMatches.length > 0) {
    return itemMatches.map((match) => {
      const block = match[1];
      return {
        guid: getTagValue(block, ['guid', 'id']) || null,
        link: getRssLink(block, feedUrl),
        title: getTagValue(block, ['title']),
        description: getTagValue(block, ['description', 'content:encoded']),
        publishedAt: toIsoDate(getTagValue(block, ['pubDate', 'dc:date', 'published'])),
      };
    });
  }

  const entryMatches = Array.from(xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi));
  return entryMatches.map((match) => {
    const block = match[1];
    return {
      guid: getTagValue(block, ['id']) || null,
      link: getAtomLink(block, feedUrl),
      title: getTagValue(block, ['title']),
      description: getTagValue(block, ['summary', 'content']),
      publishedAt: toIsoDate(getTagValue(block, ['published', 'updated'])),
    };
  });
}

function scoreFeedItem(item: ParsedFeedItem) {
  const title = item.title.toLowerCase();
  const description = item.description.toLowerCase();
  const text = `${title} ${description}`;

  const scoreBreakdown = {
    novedad: text.includes('release') || text.includes('launch') ? 4 : 3,
    relevancia_estrategica: text.includes('platform') || text.includes('architecture') ? 4 : 3,
    impacto_ejecutivo: text.includes('cost') || text.includes('risk') || text.includes('security') ? 4 : 3,
    aplicabilidad_enterprise: text.includes('enterprise') || text.includes('kubernetes') || text.includes('cloud') ? 4 : 3,
    potencial_editorial: item.title.length > 30 ? 3 : 2,
  };

  const scoreTotal = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
  const isFinOps = text.includes('finops') || text.includes('cost');
  const isSecurity = text.includes('zero trust') || text.includes('security');

  const pilar = isFinOps
    ? 'Hybrid Cloud y Public Cloud con criterio'
    : isSecurity
      ? 'Resiliencia, observabilidad y AIOps'
      : 'Diseño y modernización de infraestructuras enterprise y private cloud';

  return {
    scoreBreakdown,
    scoreTotal,
    porQueImporta: isFinOps
      ? 'La eficiencia económica y la atribución de coste siguen siendo palancas ejecutivas para decidir arquitectura, ownership y operating model.'
      : isSecurity
        ? 'Las decisiones de seguridad y aislamiento afectan directamente a resiliencia, riesgo operativo y gobierno técnico.'
        : 'La señal apunta a decisiones de arquitectura con impacto en transformación, coste y operabilidad.',
    ideaFuerte: isFinOps
      ? 'Relacionar coste marginal con decisiones de plataforma mejora gobierno y priorización.'
      : isSecurity
        ? 'Identity-based security as policy-as-code convierten control y velocidad en compatibles.'
        : 'Las decisiones de plataforma ganan valor cuando se traducen en simplicidad operativa y resiliencia.',
    pilar,
  };
}

function buildStoryId(title: string, canonicalUrl: string | null, publishedAt: string) {
  return sha1(canonicalUrl || `${normalizeTitle(title)}|${publishedAt}`);
}

async function processSingleSource(
  sourceId: string,
  source: Fuente,
  existingFeedItemIds: Set<string>,
  existingStoriesById: Map<string, ExistingRadarRecord>,
  storiesToWrite: Map<string, ExistingRadarRecord>,
  stats: ProcessStats
) {
  const response = await fetch(source.urlFeed!, {
    headers: {
      'user-agent': 'Executive-AI-Radar/0.1 (+https://firebase.google.com)',
      accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`feed-fetch-${response.status}`);
  }

  const xml = await response.text();
  const parsedItems = parseFeedXml(xml, source.urlFeed!).slice(0, 20);
  const now = new Date().toISOString();

  for (const item of parsedItems) {
    stats.rawItemsSeen += 1;

    const title = normalizeWhitespace(item.title);
    const canonicalUrl = item.link;
    const publishedAt = item.publishedAt ?? now;

    if (!title || !canonicalUrl) {
      stats.skippedInvalid += 1;
      continue;
    }

    const externalId = item.guid || canonicalUrl || `${normalizeTitle(title)}|${publishedAt}`;
    const feedItemId = sha1(`${sourceId}|${externalId}`);
    const storyId = buildStoryId(title, canonicalUrl, publishedAt);
    const contentHash = sha1(`${title}|${item.description}|${publishedAt}`);

    await setFirestoreDocument(FEED_ITEMS_COLLECTION, feedItemId, {
      fuenteId: sourceId,
      feedUrl: source.urlFeed ?? null,
      externalId,
      guid: item.guid,
      itemLink: canonicalUrl,
      canonicalUrl,
      titleRaw: title,
      titleNormalized: normalizeTitle(title),
      publishedAt,
      fetchedAt: now,
      contentSnippet: item.description,
      contentHash,
      processingStatus: 'processed',
    });

    if (existingFeedItemIds.has(feedItemId)) {
      stats.rawItemsUpdated += 1;
    } else {
      existingFeedItemIds.add(feedItemId);
      stats.rawItemsInserted += 1;
    }

    const scored = scoreFeedItem(item);
    if (scored.scoreTotal < 15) {
      continue;
    }

    const current = storiesToWrite.get(storyId) ?? existingStoriesById.get(storyId);
    const mergedSources = {
      ...((current?.fuentes ?? {}) as Record<string, boolean>),
      [sourceId]: true,
    };

    const storyDoc: ExistingRadarRecord = {
      titulo: current?.titulo ?? title,
      url: current?.url ?? canonicalUrl,
      fuenteId: current?.fuenteId ?? sourceId,
      fuentes: mergedSources,
      sourceCount: Object.keys(mergedSources).length,
      publishedAt: current?.publishedAt ?? publishedAt,
      fetchedAt: now,
      scoreTotal: Math.max(Number(current?.scoreTotal ?? 0), scored.scoreTotal),
      scoreBreakdown: scored.scoreBreakdown,
      porQueImporta: scored.porQueImporta,
      ideaFuerte: scored.ideaFuerte,
      pilar: scored.pilar,
      status: current?.status ?? 'pending',
      dedupeKey: storyId,
      updatedAt: now,
    };

    storiesToWrite.set(storyId, storyDoc);
  }

  await updateFirestoreDocument(FUENTES_COLLECTION, sourceId, {
    lastFetchedAt: now,
    lastSuccessAt: now,
    lastRunStatus: 'ok',
    updatedAt: now,
  });

  stats.feedsProcessed += 1;
}

export async function processRadarFeeds() {
  const stats: ProcessStats = {
    feedsProcessed: 0,
    feedsFailed: 0,
    rawItemsSeen: 0,
    rawItemsInserted: 0,
    rawItemsUpdated: 0,
    storiesCreated: 0,
    storiesUpdated: 0,
    skippedInvalid: 0,
  };

  const [sourcesSnapshot, existingFeedItems, existingRadarDocs] = await Promise.all([
    listFirestoreDocuments(FUENTES_COLLECTION),
    listFirestoreDocuments(FEED_ITEMS_COLLECTION),
    listFirestoreDocuments(RADAR_COLLECTION),
  ]);

  const existingFeedItemIds = new Set(existingFeedItems.map((doc) => doc.id));
  const existingStoriesById = new Map(
    existingRadarDocs.map((doc) => [doc.id, doc.data as ExistingRadarRecord])
  );
  const storiesToWrite = new Map<string, ExistingRadarRecord>();
  const activeSources = sourcesSnapshot.filter((doc) => (doc.data as Fuente).activa === true);

  for (const doc of activeSources) {
    const sourceId = doc.id;
    const source = doc.data as Fuente;

    if (!source.urlFeed) {
      stats.feedsFailed += 1;
      await updateFirestoreDocument(FUENTES_COLLECTION, sourceId, {
        lastRunStatus: 'error:no-feed-url',
        updatedAt: new Date().toISOString(),
      });
      continue;
    }

    try {
      await processSingleSource(sourceId, source, existingFeedItemIds, existingStoriesById, storiesToWrite, stats);
    } catch (error) {
      stats.feedsFailed += 1;
      await updateFirestoreDocument(FUENTES_COLLECTION, sourceId, {
        lastRunStatus: `error:${error instanceof Error ? error.message : 'unknown'}`,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  await Promise.all(
    Array.from(storiesToWrite.entries()).map(async ([storyId, storyDoc]) => {
      if (existingStoriesById.has(storyId)) {
        stats.storiesUpdated += 1;
      } else {
        stats.storiesCreated += 1;
      }

      await setFirestoreDocument(RADAR_COLLECTION, storyId, storyDoc);
    })
  );

  const nextStoryIds = new Set(storiesToWrite.keys());
  for (const existingDoc of existingRadarDocs) {
    if (!nextStoryIds.has(existingDoc.id)) {
      await deleteFirestoreDocument(RADAR_COLLECTION, existingDoc.id);
    }
  }

  return stats;
}
