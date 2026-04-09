import crypto from 'node:crypto';
import {
  deleteFirestoreDocument,
  listFirestoreDocuments,
  setFirestoreDocument,
  updateFirestoreDocument,
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
  const itemMatches = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
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

  const entryMatches = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)];
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

async function processSingleSource(
  sourceId: string,
  source: Fuente,
  existingFeedItemIds: Set<string>,
  existingStoryIds: Set<string>,
  existingRadarDocsBySource: Map<string, string[]>,
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
  const newStoryIdsForSource = new Set<string>();

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
    const storyId = sha1(`${sourceId}|${canonicalUrl}`);
    const contentHash = sha1(`${title}|${item.description}|${publishedAt}`);

    const feedItemDoc = {
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
    };

    await setFirestoreDocument(FEED_ITEMS_COLLECTION, feedItemId, feedItemDoc);

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

    const radarDoc = {
      titulo: title,
      url: canonicalUrl,
      fuenteId: sourceId,
      publishedAt,
      fetchedAt: now,
      scoreTotal: scored.scoreTotal,
      scoreBreakdown: scored.scoreBreakdown,
      porQueImporta: scored.porQueImporta,
      ideaFuerte: scored.ideaFuerte,
      pilar: scored.pilar,
      status: 'pending',
      dedupeKey: storyId,
      updatedAt: now,
    };

    await setFirestoreDocument(RADAR_COLLECTION, storyId, radarDoc);
    newStoryIdsForSource.add(storyId);

    if (existingStoryIds.has(storyId)) {
      stats.storiesUpdated += 1;
    } else {
      existingStoryIds.add(storyId);
      stats.storiesCreated += 1;
    }
  }

  const existingDocsForSource = existingRadarDocsBySource.get(sourceId) ?? [];
  for (const docId of existingDocsForSource) {
    if (!newStoryIdsForSource.has(docId)) {
      await deleteFirestoreDocument(RADAR_COLLECTION, docId);
    }
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
  const existingStoryIds = new Set(existingRadarDocs.map((doc) => doc.id));
  const existingRadarDocsBySource = new Map<string, string[]>();

  for (const doc of existingRadarDocs) {
    const sourceId = typeof doc.data.fuenteId === 'string' ? (doc.data.fuenteId as string) : null;
    if (!sourceId) continue;
    const current = existingRadarDocsBySource.get(sourceId) ?? [];
    current.push(doc.id);
    existingRadarDocsBySource.set(sourceId, current);
  }

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
      await processSingleSource(
        sourceId,
        source,
        existingFeedItemIds,
        existingStoryIds,
        existingRadarDocsBySource,
        stats
      );
    } catch (error) {
      stats.feedsFailed += 1;
      await updateFirestoreDocument(FUENTES_COLLECTION, sourceId, {
        lastRunStatus: `error:${error instanceof Error ? error.message : 'unknown'}`,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return stats;
}
