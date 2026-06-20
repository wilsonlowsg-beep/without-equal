/**
 * POST /api/push/notify
 *
 * Called by Vercel cron at 0800 SGT (0000 UTC).
 * Sends a push notification to every subscribed user who has NOT yet
 * submitted their daily status for today.
 *
 * Required env vars:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_EMAIL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

export async function POST(req: NextRequest) {
  // Verify cron secret (set in vercel.json headers or env)
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = supabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  // Get all push subscriptions where user hasn't submitted today
  const { data: subs, error } = await db
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')

  if (error || !subs) {
    return NextResponse.json({ error: error?.message ?? 'No subscriptions' }, { status: 500 })
  }

  // Get user IDs who already submitted today
  const { data: submitted } = await db
    .from('daily_submissions')
    .select('user_id')
    .eq('submission_date', today)

  const submittedIds = new Set((submitted ?? []).map((s: { user_id: string }) => s.user_id))

  // Send only to those who haven't submitted
  const pending = subs.filter((s: { user_id: string }) => !submittedIds.has(s.user_id))

  const payload = JSON.stringify({
    title: 'WITHOUT EQUAL · Daily Readiness',
    body: '⏰ 0800H — Report your status for today.',
    url: '/',
  })

  const results = await Promise.allSettled(
    pending.map((sub: { endpoint: string; p256dh: string; auth: string }) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      )
    )
  )

  const sent     = results.filter((r) => r.status === 'fulfilled').length
  const failed   = results.filter((r) => r.status === 'rejected').length

  console.log(`[push/notify] ${today}: sent=${sent}, failed=${failed}, skipped=${submittedIds.size}`)

  return NextResponse.json({ ok: true, sent, failed, skipped: submittedIds.size })
}
