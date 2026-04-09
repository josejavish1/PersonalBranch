// ADD web source support (minimal)

function extractLinks(html: string, baseUrl: string): string[] {
  const matches = Array.from(html.matchAll(/href=["']([^"'#]+)["']/gi));
  const urls = new Set<string>();

  for (const m of matches) {
    try {
      const url = new URL(m[1], baseUrl).toString();
      if (url.includes(baseUrl) && url.length < 200) {
        urls.add(url);
      }
    } catch {}
  }

  return Array.from(urls).slice(0, 20);
}

async function processWebSource(
  sourceId,
  source,
  existingFeedItemIds,
  existingStoriesById,
  storiesToWrite,
  stats
) {
  const response = await fetch(source.urlFeed);
  if (!response.ok) throw new Error('web-fetch-failed');

  const html = await response.text();
  const links = extractLinks(html, source.urlFeed);
  const now = new Date().toISOString();

  for (const link of links) {
    const title = link.split('/').slice(-1)[0] || link;

    const item = {
      guid: link,
      link,
      title,
      description: '',
      publishedAt: now,
    };

    const feedItemId = sha1(`${sourceId}|${link}`);
    const storyId = sha1(link);

    await setFirestoreDocument(FEED_ITEMS_COLLECTION, feedItemId, {
      fuenteId: sourceId,
      canonicalUrl: link,
      titleRaw: title,
      publishedAt: now,
      fetchedAt: now,
    });

    const scored = await scoreFeedItem(item, link);
    if (scored.scoreTotal < 15) continue;

    storiesToWrite.set(storyId, {
      titulo: title,
      url: link,
      fuenteId: sourceId,
      scoreTotal: scored.scoreTotal,
      scoreBreakdown: scored.scoreBreakdown,
      porQueImporta: scored.porQueImporta,
      ideaFuerte: scored.ideaFuerte,
      pilar: scored.pilar,
      status: 'pending',
      updatedAt: now,
    });
  }

  stats.feedsProcessed += 1;
}

// hook in main loop
// replace inside processRadarFeeds loop:
// if (source.sourceType === 'web') use processWebSource
