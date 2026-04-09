import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sources: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, category, url } = body;

  if (!name || !category || !url) {
    return NextResponse.json({ error: 'name, category and url are required' }, { status: 400 });
  }

  if (!['tier1', 'tier2'].includes(category)) {
    return NextResponse.json({ error: 'category must be tier1 or tier2' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('sources')
    .insert({ name, category, url })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ source: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await supabase.from('sources').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
