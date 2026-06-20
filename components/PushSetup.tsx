'use client'

/**
 * PushSetup — registers the service worker and requests push
 * notification permission after the user logs in.
 *
 * Mount this once inside AppShell (after user is confirmed).
 * It is invisible — renders nothing to the UI.
 */

import { useEffect } from 'react'

interface Props {
  userId: string
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export default function PushSetup({ userId }: Props) {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    ) {
      return
    }

    async function setup() {
      try {
        // 1. Register service worker
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

        // 2. Wait for it to be ready
        await navigator.serviceWorker.ready

        // 3. Check existing subscription
        const existing = await reg.pushManager.getSubscription()
        if (existing) {
          // Already subscribed — re-sync to DB in case it changed
          await syncSubscription(existing)
          return
        }

        // 4. Request permission (only ask once; browser remembers)
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        // 5. Subscribe to push
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
          ),
        })

        await syncSubscription(subscription)
      } catch (err) {
        // Non-fatal — push is enhancement only
        console.warn('[PushSetup] Setup error:', err)
      }
    }

    async function syncSubscription(sub: PushSubscription) {
      try {
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON(), userId }),
        })
      } catch (err) {
        console.warn('[PushSetup] Sync error:', err)
      }
    }

    setup()
  }, [userId])

  return null
}
