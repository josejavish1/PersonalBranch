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
  sourceType?: 'rss' | 'web';
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

type RadarScore = {
  scoreBreakdown: Record<string, number>;
  scoreTotal: number;
  porQueImporta: string;
  ideaFuerte: string;
  pilar: string;
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
    if (match?.[1]) return normalizeWhitespace(match[1]);
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

function truncateWords(value: string, count: number) {
  const words = normalizeWhitespace(value).split(' ').filter(Boolean);
  return words.slice(0, count).join(' ');
}

function lowerFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function detectThemes(text: string) {
  const themes: string[] = [];
  const checks: Array<[string, string[]]> = [
    ['finops', ['finops', 'cost', 'spend', 'billing', 'chargeback', 'showback']],
    ['security', ['zero trust', 'security', 'identity', 'policy', 'compliance', 'isolation']],
    ['platform', ['platform engineering', 'platform', 'developer platform', 'idp', 'golden path']],
    ['resilience', ['resilience', 'observability', 'sre', 'incident', 'reliability', 'aiops']],
    ['cloud', ['hybrid cloud', 'public cloud', 'multicloud', 'cloud', 'aws', 'azure', 'gcp']],
    ['kubernetes', ['kubernetes', 'container', 'cluster', 'k8s']],
    ['modernization', ['private cloud', 'vmware', 'openstack', 'virtualization', 'modernization', 'infrastructure']],
    ['sovereignty', ['sovereignty', 'sovereign', 'data residency', 'eu cloud']],
  ];

  checks.forEach(([theme, keywords]) => {
    if (keywords.some((keyword) => text.includes(keyword))) themes.push(theme);
  });
  return themes;
}

function scoreFeedItemRuleBased(item: ParsedFeedItem): RadarScore {
  const title = item.title.toLowerCase();
  const description = item.description.toLowerCase();
  const text = `${title} ${description}`;
  const themes = detectThemes(text);
  const hook = truncateWords(item.title, 10) || 'esta señal';
  const context = truncateWords(item.description, 16);

  const scoreBreakdown = {
    novedad: text.includes('release') || text.includes('launch') || text.includes('preview') ? 4 : 3,
    relevancia_estrategica: themes.includes('platform') || themes.includes('cloud') || themes.includes('modernization') ? 4 : 3,
    impacto_ejecutivo: themes.includes('finops') || themes.includes('security') || themes.includes('resilience') ? 4 : 3,
    aplicabilidad_enterprise: themes.includes('kubernetes') || themes.includes('cloud') || themes.includes('modernization') ? 4 : 3,
    potencial_editorial: item.title.length > 30 || context.length > 50 ? 3 : 2,
  };

  const scoreTotal = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
  const pilar = themes.includes('platform')
    ? 'Platform Engineering e Internal Developer Platforms'
    : themes.includes('resilience') || themes.includes('security')
      ? 'Resiliencia, observabilidad y AIOps'
      : themes.includes('finops') || themes.includes('cloud') || themes.includes('sovereignty')
        ? 'Hybrid Cloud y Public Cloud con criterio'
        : 'Diseño y modernización de infraestructuras enterprise y private cloud';

  let porQueImporta = `“${hook}” señala decisiones de arquitectura con impacto en transformación, coste y operabilidad.`;
  let ideaFuerte = context
    ? `La lectura útil es conectar ${lowerFirst(context)} con una decisión concreta de plataforma y operating model.`
    : 'La señal se puede traducir en una conversación ejecutiva sobre operabilidad, coste y resiliencia.';

  if (themes.includes('finops')) {
    porQueImporta = `“${hook}” toca una palanca ejecutiva de coste cloud, accountability y priorización de capacidad.`;
    ideaFuerte = context
      ? `La oportunidad está en convertir ${lowerFirst(context)} en una disciplina operable de FinOps y gobierno.`
      : 'Coste marginal, ownership y decisiones de plataforma deben quedar conectados en el operating model.';
  } else if (themes.includes('security')) {
    porQueImporta = `“${hook}” afecta riesgo operativo, gobierno técnico y velocidad de cambio en estates complejos.`;
    ideaFuerte = context
      ? `La idea fuerte es pasar de controles aislados a seguridad operable basada en identidad, política y observabilidad: ${lowerFirst(context)}.`
      : 'Seguridad, policy-as-code y operabilidad deben diseñarse como una sola conversación ejecutiva.';
  } else if (themes.includes('platform')) {
    porQueImporta = `“${hook}” impacta directamente en productividad interna, estandarización y escalabilidad de la plataforma.`;
    ideaFuerte = context
      ? `La lectura ejecutiva es usar ${lowerFirst(context)} para reducir fricción, excepciones y dependencia de conocimiento tribal.`
      : 'Una plataforma útil no es más tooling: es menos fricción para equipos y más gobierno para la organización.';
  }

  return { scoreBreakdown, scoreTotal, porQueImporta, ideaFuerte, pilar };
}

function extractLinks(html: string, baseUrl: string) {
  const origin = new URL(baseUrl).origin;
  const matches = Array.from(html.matchAll(/href=["']([^"'#]+)["']/gi));
  const urls = new Set<string>();

  matches.forEach((match) => {
    try {
      const url = new URL(match[1], baseUrl);
      const normalized = url.toString();
      const pathname = url.pathname.toLowerCase();
      const looksLikeArticle =
        pathname.includes('/blog/') ||
        pathname.includes('/post/') ||
        pathname.includes('/news/') ||
        /\/(20\d{2})\//.test(pathname) ||
        pathname.split('/').filter(Boolean).length >= 2;

      const noisy =
        pathname.endsWith('.jpg') ||
        pathname.endsWith('.png') ||
        pathname.endsWith('.svg') ||
        pathname.endsWith('.pdf') ||
        pathname.includes('/tag/') ||
        pathname.includes('/category/') ||
        pathname === '/' ||
        normalized.includes('#') ||
        normalized.includes('mailto:');

      if (normalized.startsWith(origin) && looksLikeArticle && !noisy && normalized.length < 220) {
        urls.add(normalized);
      }
    } catch {}
  });

  return Array.from(urls).slice(0, 20);
}

function titleFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const slug = pathname.split('/').filter(Boolean).slice(-1)[0] || pathname;
    return normalizeWhitespace(slug.replace(/[-_]/g, ' '));
  } catch {
    return url;
  }
}

function extractArticleTitle(html: string) {
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return normalizeWhitespace(ogTitle || titleTag || '');
}

function extractArticleDescription(html: string) {
  const metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const ogDescription = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1];
  return normalizeWhitespace(metaDescription || ogDescription || '');
}

function extractArticleText(html: string) {
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const candidate = articleMatch?.[1] || mainMatch?.[1] || bodyMatch?.[1] || html;
  const withoutNoise = candidate
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' ');
  return truncateWords(normalizeWhitespace(withoutNoise), 1800);
}

async function fetchArticle(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Executive-AI-Radar/0.1 (+https://firebase.google.com)',
        accept: 'text/html,application/xhtml+xml, application/xml;q=0.9,*/*;q=0.8',
      },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const html = await response.text();
    return {
      title: extractArticleTitle(html) || titleFromUrl(url),
      description: extractArticleDescription(html),
      text: extractArticleText(html),
    };
  } catch {
    return null;
  }
}

async function scoreFeedItem(item: ParsedFeedItem, _articleUrl: string): Promise<RadarScore> {
  return scoreFeedItemRuleBased(item);
}

function buildStoryId(title: string, canonicalUrl: string | null, publishedAt: string) {
  return sha1(canonicalUrl || `${normalizeTitle(title)}|${publishedAt}`);
}

async function writeStory(
  sourceId: string,
  source: Fuente,
  item: ParsedFeedItem,
  existingFeedItemIds: Set<string>,
  existingStoriesById: Map<string, ExistingRadarRecord>,
  storiesToWrite: Map<string, ExistingRadarRecord>,
  stats: ProcessStats,
  sourceType: 'rss' | 'web'
) {
  stats.rawItemsSeen += 1;
  const now = new Date().toISOString();
  const title = normalizeWhitespace(item.title);
  const canonicalUrl = item.link;
  const publishedAt = item.publishedAt ?? now;

  if (!title || !canonicalUrl) {
    stats.skippedInvalid += 1;
    return;
  }

  const externalId = item.guid || canonicalUrl || `${normalizeTitle(title)}|${publishedAt}`;
  const feedItemId = sha1(`${sourceId}|${externalId}`);
  const storyId = buildStoryId(title, canonicalUrl, publishedAt);
  const contentHash = sha1(`${title}|${item.description}|${publishedAt}`);

  await setFirestoreDocument(FEED_ITEMS_COLLECTION, feedItemId, {
    fuenteId: sourceId,
    feedUrl: source.urlFeed ?? null,
    sourceType,
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

  if (existingFeedItemIds.has(feedItemId)) stats.rawItemsUpdated += 1;
  else {
    existingFeedItemIds.add(feedItemId);
    stats.rawItemsInserted += 1;
  }

  const scored = await scoreFeedItem(item, canonicalUrl);
  if (scored.scoreTotal < 15) return;

  const current = storiesToWrite.get(storyId) ?? existingStoriesById.get(storyId);
  const mergedSources = {
    ...((current?.fuentes ?? {}) as Record<string, boolean>),
    [sourceId]: true,
  };

  storiesToWrite.set(storyId, {
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
  });
}

async function processRssSource(
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
  if (!response.ok) throw new Error(`feed-fetch-${response.status}`);

  const xml = await response.text();
  const parsedItems = parseFeedXml(xml, source.urlFeed!).slice(0, 20);

  for (const item of parsedItems) {
    await writeStory(sourceId, source, item, existingFeedItemIds, existingStoriesById, storiesToWrite, stats, 'rss');
  }
}

async function processWebSource(
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
      accept: 'text/html,application/xhtml+xml, application/xml;q=0.9,*/*;q=0.8',
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`web-fetch-${response.status}`);

  const html = await response.text();
  const links = extractLinks(html, source.urlFeed!);

  for (const link of links) {
    const article = await fetchArticle(link);
    const item: ParsedFeedItem = {
      guid: link,
      link,
      title: article?.title || titleFromUrl(link),
      description: article?.description || truncateWords(article?.text || '', 40),
      publishedAt: new Date().toISOString(),
    };
    await writeStory(sourceId, source, item, existingFeedItemIds, existingStoriesById, storiesToWrite, stats, 'web');
  }
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
  const existingStoriesById = new Map(existingRadarDocs.map((doc) => [doc.id, doc.data as ExistingRadarRecord]));
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
      if (source.sourceType === 'web') {
        await processWebSource(sourceId, source, existingFeedItemIds, existingStoriesById, storiesToWrite, stats);
      } else {
        await processRssSource(sourceId, source, existingFeedItemIds, existingStoriesById, storiesToWrite, stats);
      }

      stats.feedsProcessed += 1;
      await updateFirestoreDocument(FUENTES_COLLECTION, sourceId, {
        lastFetchedAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
        lastRunStatus: 'ok',
        updatedAt: new Date().toISOString(),
      });
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
      if (existingStoriesById.has(storyId)) stats.storiesUpdated += 1;
      else stats.storiesCreated += 1;
      await setFirestoreDocument(RADAR_COLLECTION, storyId, storyDoc);
    })
  );

  const nextStoryIds = new Set(Array.from(storiesToWrite.keys()));
  for (const existingDoc of existingRadarDocs) {
    if (!nextStoryIds.has(existingDoc.id)) {
      await deleteFirestoreDocument(RADAR_COLLECTION, existingDoc.id);
    }
  }

  return stats;
}
