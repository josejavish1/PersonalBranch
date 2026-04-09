import { supabase } from '@/lib/supabase';
import { Article } from '@/lib/types';
import { RadarClient } from './radar-client';

export const dynamic = 'force-dynamic';

export default async function RadarPage() {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .gte('total_score', 15)
    .neq('status', 'discarded')
    .order('created_at', { ascending: false });

  const articles: Article[] = (data as Article[]) ?? [];

  return <RadarClient initialArticles={articles} />;
}
