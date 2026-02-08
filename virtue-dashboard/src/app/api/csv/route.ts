import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path || !path.startsWith('/mnt/data/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const data = await fs.readFile(path, 'utf8');
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
