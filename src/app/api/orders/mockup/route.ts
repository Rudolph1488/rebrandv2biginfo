import { NextResponse } from 'next/server';
import { getUserContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_BYTES = 350 * 1024; // 350 KB hard cap (client compresses to ~30-60 KB WebP)

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const orgId = String(formData.get('orgId') || '');
    const file = formData.get('file');

    if (!orgId || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Не вказано файл або компанію' },
        { status: 400 }
      );
    }

    const membership = ctx.memberships.find((m) => m.org_id === orgId);
    const canUpload =
      ctx.profile?.is_super_admin ||
      membership?.role === 'owner' ||
      membership?.role === 'admin' ||
      Boolean(membership?.permissions?.orders);

    if (!canUpload) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'Стиснутий макет перевищує 350 КБ' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const ext = file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${orgId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await admin.storage
      .from('order-files')
      .upload(path, buffer, {
        contentType: file.type || 'image/webp',
        upsert: false,
      });

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      url: `/api/orders/mockup?path=${encodeURIComponent(path)}`,
    });
  } catch (err) {
    console.error('Mockup upload error:', err);
    return NextResponse.json(
      { error: 'Помилка завантаження макету' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path') || '';
  const orgId = path.split('/')[0];

  if (!orgId || path.includes('..')) {
    return new NextResponse('Invalid path', { status: 400 });
  }

  const hasMembership =
    ctx.profile?.is_super_admin ||
    ctx.memberships.some((m) => m.org_id === orgId);

  if (!hasMembership) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from('order-files')
    .download(path);

  if (error || !data) {
    return new NextResponse('Not found', { status: 404 });
  }

  const arrayBuffer = await data.arrayBuffer();
  return new NextResponse(arrayBuffer, {
    headers: {
      'Content-Type': data.type || 'image/webp',
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
