import { NextRequest, NextResponse } from 'next/server';
import {
  createFirestoreDocument,
  deleteFirestoreDocument,
  listFirestoreDocuments,
  updateFirestoreDocument,
} from '@/lib/firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SourceTier = 'tier1' | 'tier2';

interface FirestoreSource {
  nombre: string;
  urlFeed: string;
  tier: SourceTier;
  activa: boolean;
  pilar: string | null;
  peso: number;
  lastFetchedAt: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

function toIsoString(value?: string | null) {
  return value ?? new Date(0).toISOString();
}

function toSourceResponse(id: string, data: Partial<FirestoreSource>) {
  const category: SourceTier = data.tier === 'tier1' ? 'tier1' : 'tier2';

  return {
    id,
    name: data.nombre ?? '',
    category,
    url: data.urlFeed ?? '',
    is_active: data.activa ?? true,
    created_at: toIsoString(data.createdAt),
  };
}

export async function GET() {
  try {
    const documents = await listFirestoreDocuments('fuentes');

    const sources = documents
      .map((document) => toSourceResponse(document.id, document.data as Partial<FirestoreSource>))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    return NextResponse.json({ sources });
  } catch (error) {
    console.error('Sources GET error:', error);
    return NextResponse.json({ error: 'Failed to load sources' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, category, url } = body as {
      name?: string;
      category?: SourceTier;
      url?: string;
    };

    if (!name || !category || !url) {
      return NextResponse.json({ error: 'name, category and url are required' }, { status: 400 });
    }

    if (!['tier1', 'tier2'].includes(category)) {
      return NextResponse.json({ error: 'category must be tier1 or tier2' }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'url must be a valid URL' }, { status: 400 });
    }

    const now = new Date().toISOString();

    const document = await createFirestoreDocument('fuentes', {
      nombre: name.trim(),
      urlFeed: url.trim(),
      tier: category,
      activa: true,
      pilar: null,
      peso: category === 'tier1' ? 2 : 1,
      lastFetchedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const source = toSourceResponse(document.id, document.data as Partial<FirestoreSource>);

    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    console.error('Sources POST error:', error);
    return NextResponse.json({ error: 'Failed to create source' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, is_active } = body as {
      id?: string;
      is_active?: boolean;
    };

    if (!id || typeof is_active !== 'boolean') {
      return NextResponse.json({ error: 'id and is_active are required' }, { status: 400 });
    }

    const document = await updateFirestoreDocument('fuentes', id, {
      activa: is_active,
      updatedAt: new Date().toISOString(),
    });

    const source = toSourceResponse(document.id, document.data as Partial<FirestoreSource>);

    return NextResponse.json({ source });
  } catch (error) {
    console.error('Sources PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update source' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await deleteFirestoreDocument('fuentes', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Sources DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete source' }, { status: 500 });
  }
}
