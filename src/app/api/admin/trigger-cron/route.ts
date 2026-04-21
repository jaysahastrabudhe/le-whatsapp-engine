import { NextResponse } from 'next/server';

const CRON_MAP: Record<string, string> = {
  'mql-sync':       '/api/cron/mql-sync',
  'zoho-reconcile': '/api/cron/zoho-reconcile',
  'reengagement':   '/api/cron/reengagement',
  'sla-monitor':    '/api/cron/sla-monitor',
};

export async function POST(request: Request) {
  const { name } = await request.json();

  const path = CRON_MAP[name];
  if (!path) {
    return NextResponse.json({ error: `Unknown cron: ${name}` }, { status: 400 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://le-whatsapp-engine.vercel.app';
  const url = `${base}${path}`;

  console.log(`[Trigger Cron] Manually firing ${name} → ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    cache: 'no-store',
  });

  const body = await res.json().catch(() => ({ raw: res.statusText }));
  return NextResponse.json({ success: res.ok, status: res.status, result: body });
}
