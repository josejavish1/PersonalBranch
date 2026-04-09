import { Source } from '@/lib/types';
import { SourcesManager } from '@/components/sources/sources-manager';

export const dynamic = 'force-dynamic';

export default async function SourcesPage() {
  const sources: Source[] = [];

  return <SourcesManager initialSources={sources} />;
}
