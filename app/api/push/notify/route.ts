/**
 * GET /api/push/notify
 *
 * Called by Vercel cron at 0800 SGT (0000 UTC).
 * Vercel cron always sends GET requests — auth via x-vercel-cron header.
 * Sends a push notification to every subscribed user who has NOT yet
 * submitted their daily status for today.
 *
 * Required env vars (Vercel dashboard > Settings > Environment Variables):
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_EMAIL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { NextRequest, NextResponse } from 'next/server'
import * as webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

async function sendNotifications() {
  const vapidPublic  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidEmail   = process.env.VAPID_EMAIL

  if (!vapidPublic || !vapidPrivate || !vapidEmail) {
    throw new Error('VAPID env vars not configured')
  }

  webpush.setVapidDetails(`mailto:${vapidEmail}`, vapidPublic, vapidPrivate)

  const db = supabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  const { data: subs, error } = await db
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')

  if (error) throw new Error(error.message)
  if (!subs || subs.length === 0) return { sent: 0, failed: 0, skipped: 0 }

  const { data: submitted } = await db
    .from('daily_submissions')
    .select('user_id')
    .eq('submission_date', today)

  const submittedIds = new Set((submitted ?? []).map((s: { user_id: string }) => s.user_id))
  const pending = subs.filter((s: { user_id: string }) => !submittedIds.has(s.user_id))

  const payload = JSON.stringify({
    title: 'WITHOUT EQUAL · Daily Readiness',
    body: '⏰ 0800H — Report your status for today.',
    url: '/',
  })

  const results = await Promise.allSettled(
    pending.map((sub: { endpoint: string; p256dh: string; auth: string }) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  )

  return {
    sent:    results.filter((r) => r.status === 'fulfilled').length,
    failed:  results.filter((r) => r.status === 'rejected').length,
    skipped: submittedIds.size,
  }
}

// Vercel cron sends GET
export async function GET(req: NextRequest) {
  // Vercel automatically sets this header for cron invocations
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (!isCron) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await sendNotifications()
    console.log('[push/notify]', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[push/notify] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
