/**
 * POST /api/push/send-now
 * Admin-only manual push with a custom message.
 * Body: { userId: string; message: string; title?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/push'

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  try {
    const { userId, message, title } = await req.json()
    if (!userId || !message?.trim())
      return NextResponse.json({ error: 'userId and message required' }, { status: 400 })

    const vapidPublic  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY
    const vapidEmail   = process.env.VAPID_EMAIL
    if (!vapidPublic || !vapidPrivate || !vapidEmail)
      return NextResponse.json({ error: 'VAPID env vars not set' }, { status: 500 })

    const db = supabaseAdmin()

    // Verify caller is an admin
    const { data: caller } = await db.from('users').select('role').eq('id', userId).single()
    if (caller?.role !== 'admin')
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })

    const today = new Date().toISOString().slice(0, 10)

    const { data: subs, error } = await db.from('push_subscriptions').select('user_id, endpoint, p256dh, auth')
    if (error || !subs?.length) return NextResponse.json({ ok: true, sent: 0, reason: 'no subscriptions' })

    // Only send to users who haven't reported today
    const { data: submitted } = await db.from('daily_submissions').select('user_id').eq('submission_date', today)
    const done    = new Set((submitted ?? []).map((r: { user_id: string }) => r.user_id))
    const pending = subs.filter((r: { user_id: string }) => !done.has(r.user_id))

    const payload = JSON.stringify({
      title: title?.trim() || 'WITHOUT EQUAL · Daily Readiness',
      body: message.trim(),
      url: '/',
    })

    const results = await Promise.allSettled(
      pending.map((sub: { endpoint: string; p256dh: string; auth: string }) =>
        sendPush(sub, payload, vapidPublic, vapidPrivate, vapidEmail)
      )
    )

    const sent   = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    console.log(`[push/send-now] sent=${sent} failed=${failed} skipped=${done.size} msg="${message}"`)

    // Update last sent timestamp
    await db.from('system_settings')
      .upsert({ key: 'push_last_sent', value: new Date().toISOString(), updated_at: new Date().toISOString() })

    return NextResponse.json({ ok: true, sent, failed, skipped: done.size })
  } catch (err) {
    console.error('[push/send-now] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
