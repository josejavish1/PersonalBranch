import { supabase } from '@/lib/supabase';
import { Source } from '@/lib/types';
import { SourcesManager } from '@/components/sources/sources-manager';

export const dynamic = 'force-dynamic';

export default async function SourcesPage() {
  const { data } = await supabase
    .from('sources')
    .select('*')
    .order('created_at', { ascending: false });

  const sources: Source[] = (data as Source[]) ?? [];

  return <SourcesManager initialSources={sources} />;
}
