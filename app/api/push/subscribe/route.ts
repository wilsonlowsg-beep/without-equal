import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

export async function POST(req: NextRequest) {
  try {
    const { subscription, userId } = await req.json()

    if (!subscription?.endpoint || !userId) {
      return NextResponse.json({ error: 'Missing subscription or userId' }, { status: 400 })
    }

    const db = supabaseAdmin()

    const { error } = await db.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys?.p256dh,
        auth: subscription.keys?.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    if (error) {
      console.error('[push/subscribe] DB error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[push/subscribe] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await req.json()
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const db = supabaseAdmin()
    await db.from('push_subscriptions').delete().eq('user_id', userId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[push/subscribe DELETE] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
