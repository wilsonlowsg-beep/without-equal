'use client'

import { useState } from 'react'
import { GROUPS } from '@/lib/constants'

/**
 * PushSender — manual push notification panel.
 * Used in AdminDashboard (full targeting) and GroupDashboard (own group only).
 *
 * Props:
 *   userId       — current user's ID (passed to API for auth)
 *   role         — 'admin' | 'grouphead'
 *   myGroupId    — current user's group (used to restrict group head targeting)
 *   showToast    — toast callback
 *   onSent?      — called after successful send with { sent, failed }
 */

interface Props {
  userId:    string
  role:      'admin' | 'ac3' | 'grouphead'
  myGroupId: number
  showToast: (msg: string) => void
  onSent?:   (result: { sent: number; failed: number }) => void
}

const QUICK_MESSAGES = [
  '⏰ Reminder: please report your status for today.',
  '📋 Parade state closing in 15 minutes — report now.',
  '🔔 All staff please report status by 0830H.',
  '📢 Change of parade — please check with your group head.',
]

export default function PushSender({ userId, role, myGroupId, showToast, onSent }: Props) {
  const isAdmin = role === 'admin' || role === 'ac3'

  // Target selection — group heads locked to own group
  const [targetGroup, setTargetGroup] = useState<number | 'all'>(isAdmin ? 'all' : myGroupId)
  const [pendingOnly, setPendingOnly]  = useState(false)
  const [title,       setTitle]        = useState('')
  const [message,     setMessage]      = useState('')
  const [sending,     setSending]      = useState(false)

  const handleSend = async () => {
    if (!message.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/push/send-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          message:     message.trim(),
          title:       title.trim() || undefined,
          targetGroup: targetGroup === 'all' ? null : targetGroup,
          pendingOnly,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        const label = targetGroup === 'all'
          ? 'all users'
          : GROUPS.find(g => g.id === targetGroup)?.name ?? `Group ${targetGroup}`
        showToast(`Sent to ${json.sent} device${json.sent === 1 ? '' : 's'} in ${label} ✓`)
        setMessage(''); setTitle('')
        onSent?.({ sent: json.sent, failed: json.failed })
      } else {
        showToast('Error: ' + (json.error ?? 'Unknown'))
      }
    } catch {
      showToast('Network error — check console')
    }
    setSending(false)
  }

  const groupLabel = (id: number) => {
    const g = GROUPS.find(g => g.id === id)
    return g ? `${g.short} — ${g.name}` : `Group ${id}`
  }

  return (
    <div style={{
      border: '1px solid rgba(8,145,178,0.3)',
      background: 'rgba(8,145,178,0.04)',
      borderRadius: 10,
      padding: '14px 16px',
    }}>
      <div style={{fontSize:11,fontWeight:700,color:'var(--teal,#0891B2)',letterSpacing:'0.08em',
        textTransform:'uppercase',marginBottom:12,fontFamily:'var(--mono)'}}>
        📲 Send Push Notification
      </div>

      {/* Target selector */}
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,color:'var(--dim)',marginBottom:6,fontWeight:600}}>Send to</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {isAdmin && (
            <button
              onClick={() => setTargetGroup('all')}
              style={{
                padding:'6px 12px', borderRadius:20, fontSize:11, cursor:'pointer',
                fontFamily:'var(--sans)', fontWeight:600,
                border: `1.5px solid ${targetGroup==='all'?'var(--teal,#0891B2)':'var(--border)'}`,
                background: targetGroup==='all'?'rgba(8,145,178,0.15)':'var(--surf-hi)',
                color: targetGroup==='all'?'var(--teal,#0891B2)':'var(--dim)',
              }}
            >
              🌐 All Users
            </button>
          )}
          {(isAdmin ? GROUPS : GROUPS.filter(g => g.id === myGroupId)).map(g => (
            <button
              key={g.id}
              onClick={() => setTargetGroup(g.id)}
              style={{
                padding:'6px 12px', borderRadius:20, fontSize:11, cursor:'pointer',
                fontFamily:'var(--sans)', fontWeight:600,
                border: `1.5px solid ${targetGroup===g.id?'var(--teal,#0891B2)':'var(--border)'}`,
                background: targetGroup===g.id?'rgba(8,145,178,0.15)':'var(--surf-hi)',
                color: targetGroup===g.id?'var(--teal,#0891B2)':'var(--dim)',
              }}
            >
              {g.short} — {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* Pending only toggle */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'8px 12px', background:'var(--surf-hi)', borderRadius:8,
        border:'1px solid var(--border)', marginBottom:12,
      }}>
        <div>
          <div style={{fontSize:12,fontWeight:600}}>Pending only</div>
          <div style={{fontSize:10,color:'var(--dim)',marginTop:1}}>
            {pendingOnly ? 'Only users who haven\'t submitted today' : 'Everyone in the selected group(s)'}
          </div>
        </div>
        <button
          onClick={() => setPendingOnly(v => !v)}
          style={{
            width:42, height:24, borderRadius:12, border:'none', cursor:'pointer',
            background: pendingOnly ? 'var(--teal,#0891B2)' : 'var(--border)',
            position:'relative', transition:'background 0.2s', flexShrink:0,
          }}
        >
          <div style={{
            position:'absolute', top:3, left: pendingOnly ? 19 : 3,
            width:18, height:18, borderRadius:9,
            background:'white', transition:'left 0.2s',
          }}/>
        </button>
      </div>

      {/* Quick messages */}
      <div style={{marginBottom:10}}>
        <div style={{fontSize:11,color:'var(--dim)',marginBottom:6,fontWeight:600}}>Quick messages</div>
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          {QUICK_MESSAGES.map((m, i) => (
            <button
              key={i}
              onClick={() => setMessage(m)}
              style={{
                textAlign:'left', padding:'7px 10px', borderRadius:7, fontSize:11,
                border:`1px solid ${message===m?'rgba(8,145,178,0.5)':'var(--border)'}`,
                background: message===m?'rgba(8,145,178,0.1)':'var(--surf-hi)',
                color: message===m?'var(--teal,#0891B2)':'var(--dim)',
                cursor:'pointer', fontFamily:'var(--sans)',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Custom title */}
      <div className="fg" style={{marginBottom:8}}>
        <label className="we-label">Custom Title (optional)</label>
        <input
          className="we-input"
          placeholder="WITHOUT EQUAL · Daily Readiness"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
      </div>

      {/* Custom message */}
      <div className="fg" style={{marginBottom:12}}>
        <label className="we-label">Message <span style={{color:'var(--red)'}}>*</span></label>
        <textarea
          className="we-input we-textarea"
          rows={2}
          placeholder="Type a message or pick one above…"
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
      </div>

      {/* Preview */}
      {message.trim() && (
        <div style={{
          padding:'10px 12px', borderRadius:8, marginBottom:12,
          background:'var(--surf-hi)', border:'1px solid var(--border)',
        }}>
          <div style={{fontSize:10,color:'var(--faint)',marginBottom:4,fontFamily:'var(--mono)'}}>PREVIEW</div>
          <div style={{fontSize:12,fontWeight:700,marginBottom:2}}>
            {title.trim() || 'WITHOUT EQUAL · Daily Readiness'}
          </div>
          <div style={{fontSize:11,color:'var(--dim)'}}>{message.trim()}</div>
        </div>
      )}

      <button
        className="btn btn-primary"
        disabled={!message.trim() || sending}
        onClick={handleSend}
        style={{background:'var(--teal,#0891B2)', width:'100%'}}
      >
        {sending
          ? 'Sending…'
          : `Send to ${targetGroup === 'all' ? 'All Users' : groupLabel(targetGroup as number)}`
        }
      </button>
    </div>
  )
}
