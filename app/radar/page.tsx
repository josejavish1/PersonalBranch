import { Article } from '@/lib/types';
import { RadarClient } from './radar-client';

export const dynamic = 'force-dynamic';

export default async function RadarPage() {
  const articles: Article[] = [];

  return <RadarClient initialArticles={articles} />;
}
