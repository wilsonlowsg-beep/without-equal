/**
 * Shared Web Push helpers (VAPID + RFC 8291 encryption)
 * Used by /api/push/notify and /api/push/send-now
 */

import crypto from 'crypto'

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'binary') : buf
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  return Buffer.from((str + pad).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/** Wrap a raw 32-byte EC private key scalar into PKCS8 DER for P-256 */
function wrapRawEcPrivateKey(raw: Buffer): ArrayBuffer {
  const ecHeader = Buffer.from('3041020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420', 'hex')
  return Buffer.concat([ecHeader, raw]).buffer
}

export async function makeVapidJwt(audience: string, subject: string, privateKeyB64: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header  = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const payload = b64url(JSON.stringify({ aud: audience, exp: now + 3600, sub: subject }))
  const signingInput = `${header}.${payload}`

  const keyData = b64urlDecode(privateKeyB64)
  const key = await crypto.subtle.importKey(
    'pkcs8',
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

function buildInfo(type: string, recvPub: Uint8Array, sendPub: Uint8Array): Uint8Array {
  const enc    = new TextEncoder()
  const prefix = enc.encode(`Content-Encoding: ${type}\0P-256\0`)
  const recvLen = new Uint8Array(2); new DataView(recvLen.buffer).setUint16(0, recvPub.length)
  const sendLen = new Uint8Array(2); new DataView(sendLen.buffer).setUint16(0, sendPub.length)
  return new Uint8Array([...prefix, ...recvLen, ...recvPub, ...sendLen, ...sendPub])
}

/** RFC 8291 payload encryption (aes128gcm) */
export async function encryptPayload(p256dhB64: string, authB64: string, plaintext: string): Promise<ArrayBuffer> {
  const p256dh = b64urlDecode(p256dhB64)
  const auth   = b64urlDecode(authB64)
  const enc    = new TextEncoder()

  const ephemeral  = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const ephPubRaw  = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey))
  const recvKey    = await crypto.subtle.importKey('raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const sharedBits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: recvKey }, ephemeral.privateKey, 256))

  const authKey = await crypto.subtle.importKey('raw', auth, 'HKDF', false, ['deriveBits'])
  const prkBits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: auth, info: enc.encode('Content-Encoding: auth\0') },
    authKey, 256
  ))

  const keyInfo   = buildInfo('aes128gcm', p256dh, ephPubRaw)
  const nonceInfo = buildInfo('nonce', p256dh, ephPubRaw)
  const prk       = await crypto.subtle.importKey('raw', prkBits, 'HKDF', false, ['deriveBits'])
  const cek   = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sharedBits, info: keyInfo },   prk, 128))
  const nonce = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sharedBits, info: nonceInfo }, prk, 96))

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const padded = new Uint8Array([...enc.encode(plaintext), 0x02])
  const ct     = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded))

  const salt   = crypto.randomBytes(16)
  const rs     = Buffer.alloc(4); rs.writeUInt32BE(4096, 0)
  const keylen = Buffer.from([ephPubRaw.length])
  return Buffer.concat([salt, rs, keylen, ephPubRaw, ct]).buffer
}

export async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublic: string,
  vapidPrivate: string,
  vapidEmail: string
): Promise<void> {
  const url      = new URL(subscription.endpoint)
  const audience = `${url.protocol}//${url.host}`
  const jwt      = await makeVapidJwt(audience, `mailto:${vapidEmail}`, vapidPrivate)
  const vapidAuth = `vapid t=${jwt},k=${vapidPublic}`
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
