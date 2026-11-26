import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendOrgPushNotification } from '@/lib/push';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const orgId = typeof body.orgId === 'string' ? body.orgId : '';
    const orgSlug = typeof body.orgSlug === 'string' ? body.orgSlug : '';

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }

    const result = await sendOrgPushNotification({
      orgId,
      targetUserId: user.id,
      eventType: 'test',
      title: '🔔 Тестове сповіщення CENTRUM',
      body: 'Push-сповіщення працюють як швейцарський годинник!',
      url: orgSlug ? `/w/${orgSlug}` : '/',
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('Test push error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
