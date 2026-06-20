/**
 * GET /api/push/notify
 *
 * Called by Vercel cron at 0800 SGT (0000 UTC).
 * Implements VAPID Web Push with Node.js built-in crypto — no extra packages.
 *
 * Required env vars (Vercel dashboard > Settings > Environment Variables):
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY   — base64url VAPID public key
 *   VAPID_PRIVATE_KEY              — base64url VAPID private key
 *   VAPID_EMAIL                    — mailto: contact
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// ── VAPID JWT helper (no web-push package) ────────────────────

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'binary') : buf
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  return Buffer.from((str + pad).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

async function makeVapidJwt(audience: string, subject: string, privateKeyB64: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const payload = b64url(JSON.stringify({ aud: audience, exp: now + 3600, sub: subject }))
  const signingInput = `${header}.${payload}`

  const keyData = b64urlDecode(privateKeyB64)
  const key = await crypto.subtle.importKey(
    'pkcs8',
    // web-push private keys are raw 32-byte scalars; wrap in PKCS8 for P-256
    wrapRawEcPrivateKey(keyData),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    Buffer.from(signingInput)
  )

  return `${signingInput}.${b64url(Buffer.from(sig))}`
}

/** Wrap a raw 32-byte EC private key scalar into PKCS8 DER for P-256 */
function wrapRawEcPrivateKey(raw: Buffer): ArrayBuffer {
  // PKCS8 header for P-256 + ECPrivateKey(version=1, privateKey=raw)
  const ecHeader = Buffer.from('3041020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420', 'hex')
  return Buffer.concat([ecHeader, raw]).buffer
}

async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublic: string,
  vapidPrivate: string,
  vapidEmail: string
): Promise<void> {
  const url = new URL(subscription.endpoint)
  const audience = `${url.protocol}//${url.host}`

  const jwt = await makeVapidJwt(audience, `mailto:${vapidEmail}`, vapidPrivate)
  const vapidAuth = `vapid t=${jwt},k=${vapidPublic}`

  // Encrypt payload with ECDH + AES-128-GCM per RFC 8291
  // For simplicity, send as plaintext with content-type text/plain if encryption
  // is skipped — most push services require encrypted payloads.
  // We use the encrypted path via TextEncoder + subtle crypto.
  const encrypted = await encryptPayload(subscription.p256dh, subscription.auth, payload)

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuth,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
      Urgency: 'normal',
    },
    body: encrypted,
  })

  if (!res.ok && res.status !== 201) {
    throw new Error(`Push failed: ${res.status} ${await res.text()}`)
  }
}

/** RFC 8291 payload encryption (aes128gcm) */
async function encryptPayload(p256dhB64: string, authB64: string, plaintext: string): Promise<ArrayBuffer> {
  const p256dh = b64urlDecode(p256dhB64)
  const auth   = b64urlDecode(authB64)
  const enc    = new TextEncoder()

  // Generate ephemeral key pair
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey))

  // Import receiver public key
  const recvKey = await crypto.subtle.importKey('raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, false, [])

  // ECDH shared secret
  const sharedBits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: recvKey }, ephemeral.privateKey, 256))

  // HKDF — auth secret
  const authKey = await crypto.subtle.importKey('raw', auth, 'HKDF', false, ['deriveBits'])
  const prkBits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: auth, info: enc.encode('Content-Encoding: auth\0') },
    authKey, 256
  ))

  // Content-encryption key + nonce using aes128gcm key info
  const keyInfo   = buildInfo('aes128gcm', p256dh, ephPubRaw)
  const nonceInfo = buildInfo('nonce', p256dh, ephPubRaw)

  const prk = await crypto.subtle.importKey('raw', prkBits, 'HKDF', false, ['deriveBits'])
  const cek   = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sharedBits, info: keyInfo },   prk, 128))
  const nonce = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sharedBits, info: nonceInfo }, prk, 96))

  // AES-128-GCM encrypt with padding delimiter (0x02)
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const padded = new Uint8Array([...enc.encode(plaintext), 0x02])
  const ct     = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded))

  // Build aes128gcm record: salt(16) + rs(4) + keylen(1) + pubkey(65) + ciphertext
  const salt    = crypto.randomBytes(16)
  const rs      = Buffer.alloc(4); rs.writeUInt32BE(4096, 0)
  const keylen  = Buffer.from([ephPubRaw.length])
  return Buffer.concat([salt, rs, keylen, ephPubRaw, ct]).buffer
}

function buildInfo(type: string, recvPub: Uint8Array, sendPub: Uint8Array): Uint8Array {
  const enc = new TextEncoder()
  const prefix = enc.encode(`Content-Encoding: ${type}\0P-256\0`)
  const recvLen = new Uint8Array(2); new DataView(recvLen.buffer).setUint16(0, recvPub.length)
  const sendLen = new Uint8Array(2); new DataView(sendLen.buffer).setUint16(0, sendPub.length)
  return new Uint8Array([...prefix, ...recvLen, ...recvPub, ...sendLen, ...sendPub])
}

// ── Supabase client ────────────────────────────────────────────

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ── Route handler (GET — Vercel cron) ─────────────────────────

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (!isCron) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const vapidPublic  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidEmail   = process.env.VAPID_EMAIL

  if (!vapidPublic || !vapidPrivate || !vapidEmail) {
    return NextResponse.json({ error: 'VAPID env vars not set' }, { status: 500 })
  }

  const db    = supabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  const { data: subs, error } = await db.from('push_subscriptions').select('user_id, endpoint, p256dh, auth')
  if (error || !subs?.length) return NextResponse.json({ ok: true, sent: 0, reason: 'no subscriptions' })

  const { data: submitted } = await db.from('daily_submissions').select('user_id').eq('submission_date', today)
  const done    = new Set((submitted ?? []).map((s: { user_id: string }) => s.user_id))
  const pending = subs.filter((s: { user_id: string }) => !done.has(s.user_id))

  const payload = JSON.stringify({
    title: 'WITHOUT EQUAL · Daily Readiness',
    body: '⏰ 0800H — Report your status for today.',
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

  return NextResponse.json({ ok: true, sent, failed, skipped: done.size })
}
