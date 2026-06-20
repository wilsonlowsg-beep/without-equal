/**
 * GET /api/push/notify
 * Called by Vercel cron at 0800 SGT (0000 UTC).
 * Checks push_enabled setting before sending.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/push'

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (!isCron) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const vapidPublic  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidEmail   = process.env.VAPID_EMAIL
  if (!vapidPublic || !vapidPrivate || !vapidEmail)
    return NextResponse.json({ error: 'VAPID env vars not set' }, { status: 500 })

  const db    = supabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  // Check system settings
  const { data: settings } = await db.from('system_settings').select('key, value')
  const s = Object.fromEntries((settings ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))

  if (s['push_enabled'] === 'false')
    return NextResponse.json({ ok: true, sent: 0, reason: 'push_enabled=false' })

  const pushMessage = s['push_message'] || '⏰ 0800H — Report your status for today.'

  const { data: subs, error } = await db.from('push_subscriptions').select('user_id, endpoint, p256dh, auth')
  if (error || !subs?.length) return NextResponse.json({ ok: true, sent: 0, reason: 'no subscriptions' })

  const { data: submitted } = await db.from('daily_submissions').select('user_id').eq('submission_date', today)
  const done    = new Set((submitted ?? []).map((r: { user_id: string }) => r.user_id))
  const pending = subs.filter((r: { user_id: string }) => !done.has(r.user_id))

  const payload = JSON.stringify({
    title: 'WITHOUT EQUAL · Daily Readiness',
    body: pushMessage,
    url: '/',
  })

  const results = await Promise.allSettled(
    pending.map((sub: { endpoint: string; p256dh: string; auth: string }) =>
      sendPush(sub, payload, vapidPublic, vapidPrivate, vapidEmail)
    )
  )

  const sent   = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length
  console.log(`[push/notify] ${today} sent=${sent} failed=${failed} skipped=${done.size}`)

  // Update last sent timestamp
  await db.from('system_settings')
    .upsert({ key: 'push_last_sent', value: new Date().toISOString(), updated_at: new Date().toISOString() })

  return NextResponse.json({ ok: true, sent, failed, skipped: done.size })
}
