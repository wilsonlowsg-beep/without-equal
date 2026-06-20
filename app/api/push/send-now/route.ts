/**
 * POST /api/push/send-now
 * Manual push — available to admin (any group) and group heads (own group only).
 *
 * Body:
 *   userId:      string   — caller's user ID (for role verification)
 *   message:     string   — push body text (required)
 *   title?:      string   — push title (defaults to "WITHOUT EQUAL · Daily Readiness")
 *   targetGroup?: number  — group ID to target; omit or null = all groups
 *   pendingOnly?: boolean — true = only users who haven't submitted today (default: false)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPush, StaleSubscriptionError } from '@/lib/push'

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  try {
    const { userId, message, title, targetGroup, pendingOnly = false } = await req.json()

    if (!userId || !message?.trim())
      return NextResponse.json({ error: 'userId and message required' }, { status: 400 })

    const vapidPublic  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY
    const vapidEmail   = process.env.VAPID_EMAIL
    if (!vapidPublic || !vapidPrivate || !vapidEmail)
      return NextResponse.json({ error: 'VAPID env vars not set' }, { status: 500 })

    const db = supabaseAdmin()

    // Verify caller role
    const { data: caller } = await db
      .from('users')
      .select('role, group_id')
      .eq('id', userId)
      .single()

    if (!caller || !['admin', 'ac3', 'grouphead'].includes(caller.role))
      return NextResponse.json({ error: 'Forbidden — admin, AC3 or group head only' }, { status: 403 })

    // Group heads can only target their own group; admin + ac3 can target any
    const effectiveGroup: number | null =
      caller.role === 'grouphead'
        ? caller.group_id                            // always own group
        : (targetGroup != null ? targetGroup : null) // admin/ac3: null = all

    // Get target user IDs first, then fetch their subscriptions
    let usersQuery = db.from('users').select('id').eq('is_active', true)
    if (effectiveGroup != null) {
      usersQuery = usersQuery.eq('group_id', effectiveGroup)
    }
    const { data: targetUsers } = await usersQuery
    const targetIds = (targetUsers ?? []).map((u: { id: string }) => u.id)
    console.log(`[push/send-now] targetIds=${JSON.stringify(targetIds)}`)
    if (!targetIds.length) return NextResponse.json({ ok: true, sent: 0, reason: 'no users in target' })

    const { data: subs, error } = await db
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth')
      .in('user_id', targetIds)

    console.log(`[push/send-now] subs found=${subs?.length ?? 0} error=${JSON.stringify(error)}`)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!subs?.length) return NextResponse.json({ ok: true, sent: 0, reason: 'no subscriptions — no one has enabled push notifications yet' })

    // If pendingOnly, exclude users who already submitted today
    let targetSubs = subs
    if (pendingOnly) {
      const today = new Date().toISOString().slice(0, 10)
      const { data: submitted } = await db
        .from('daily_submissions')
        .select('user_id')
        .eq('submission_date', today)
      const done = new Set((submitted ?? []).map((r: { user_id: string }) => r.user_id))
      targetSubs = subs.filter((s: any) => !done.has(s.user_id))
    }

    if (!targetSubs.length) return NextResponse.json({ ok: true, sent: 0, reason: 'all users already submitted' })

    const payload = JSON.stringify({
      title: title?.trim() || 'WITHOUT EQUAL · Daily Readiness',
      body:  message.trim(),
      url:   '/',
    })

    const results = await Promise.allSettled(
      targetSubs.map((sub: any) =>
        sendPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload, vapidPublic, vapidPrivate, vapidEmail
        )
      )
    )

    // Auto-delete stale subscriptions (expired, key-mismatch, 404/410)
    const staleEndpoints = targetSubs
      .filter((_: any, i: number) => {
        const r = results[i]
        return r.status === 'rejected' && (r as any).reason instanceof StaleSubscriptionError
      })
      .map((s: any) => s.endpoint)
    if (staleEndpoints.length) {
      await db.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
      console.log(`[push/send-now] Deleted ${staleEndpoints.length} stale subscription(s)`)
    }

    const sent    = results.filter(r => r.status === 'fulfilled').length
    const failed  = results.filter(r => r.status === 'rejected').length
    const errors  = results.filter(r => r.status === 'rejected').map(r => (r as any).reason?.message)
    const groupLabel = effectiveGroup != null ? `group ${effectiveGroup}` : 'all groups'
    console.log(`[push/send-now] ${groupLabel} sent=${sent} failed=${failed} errors=${JSON.stringify(errors)}`)

    await db.from('system_settings')
      .upsert({ key: 'push_last_sent', value: new Date().toISOString(), updated_at: new Date().toISOString() })

    return NextResponse.json({ ok: true, sent, failed, errors })
  } catch (err) {
    console.error('[push/send-now] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
