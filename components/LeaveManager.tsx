'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { User, LeavePeriod } from '@/types/database'
import { todayStr, formatDate } from '@/lib/constants'

export default function LeaveManager({ user, showToast }: { user: User; showToast: (m:string)=>void }) {
  const [leaves,    setLeaves]    = useState<LeavePeriod[]>([])
  const [personnel, setPersonnel] = useState<User[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [formErr,   setFormErr]   = useState('')
  const supabase = createClient()
  const today = todayStr()

  const [form, setForm] = useState({
    leave_type:          'Local Leave' as 'Local Leave' | 'Overseas Leave' | 'Time Off',
    start_date:          today,
    end_date:            today,
    country:             '',
    city:                '',
    contactable:         true,
    emergency_contact:   '',
    remarks:             '',
    covering_person_id:  '',
  })
  const upd = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadLeaves(); loadPersonnel() }, [])

  const loadLeaves = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('leave_periods')
      .select('*, covering_person:covering_person_id(id, full_name, rank, title, personnel_type)')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false })
      .limit(20)
    setLeaves(data ?? [])
    setLoading(false)
  }

  const loadPersonnel = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, rank, title, personnel_type')
      .eq('is_active', true)
      .neq('role', 'admin')
      .neq('id', user.id)
      .order('full_name')
    setPersonnel(data ?? [])
  }

  const submitLeave = async () => {
    if (!form.start_date || !form.end_date) { setFormErr('Start and end dates required.'); return }
    if (form.end_date < form.start_date)    { setFormErr('End date must be on or after start date.'); return }
    if (form.leave_type === 'Overseas Leave' && !form.country) { setFormErr('Country required for Overseas Leave.'); return }
    setSaving(true); setFormErr('')

    const { error } = await supabase.from('leave_periods').insert({
      user_id:             user.id,
      leave_type:          form.leave_type,
      start_date:          form.start_date,
      end_date:            form.end_date,
      country:             form.leave_type === 'Overseas Leave' ? form.country           : null,
      city:                form.leave_type === 'Overseas Leave' ? form.city              : null,
      contactable:         form.leave_type === 'Overseas Leave' ? form.contactable       : true,
      emergency_contact:   form.leave_type === 'Overseas Leave' ? form.emergency_contact : null,
      remarks:             form.remarks || null,
      covering_person_id:  form.covering_person_id || null,
      status:              'approved',
    })

    if (error) { setFormErr('Error: ' + error.message); setSaving(false); return }
    showToast('Leave registered ✓ — system will auto-mark your status')
    setShowForm(false)
    setForm({ leave_type:'Local Leave', start_date:today, end_date:today, country:'', city:'', contactable:true, emergency_contact:'', remarks:'', covering_person_id:'' })
    loadLeaves()
    setSaving(false)
  }

  const cancelLeave = async (id: string) => {
    const leave = leaves.find(l => l.id === id)
    await supabase.from('leave_periods').update({ status: 'cancelled' }).eq('id', id)

    // Remove auto-submitted daily submissions for today onwards within the leave period
    // so the user is prompted to re-submit their actual status
    if (leave) {
      const cleanFrom = today >= leave.start_date ? today : leave.start_date
      await supabase.from('daily_submissions')
        .delete()
        .eq('user_id', user.id)
        .eq('is_auto', true)
        .gte('submission_date', cleanFrom)
        .lte('submission_date', leave.end_date)
    }

    showToast('Leave cancelled')
    loadLeaves()
  }

  const statusBadge = (l: LeavePeriod) => {
    if (l.status === 'cancelled') return { label: 'Cancelled', color: 'var(--dim)' }
    if (today > l.end_date)       return { label: 'Completed', color: 'var(--green)' }
    if (today >= l.start_date)    return { label: 'Active',    color: 'var(--amber)' }
    return                               { label: 'Upcoming',  color: 'var(--blue)' }
  }

  const leaveTypes: Array<'Local Leave' | 'Overseas Leave' | 'Time Off'> = ['Local Leave', 'Overseas Leave', 'Time Off']

  return (
    <div>
      <div className="we-section-hdr">My Leave Periods</div>

      <div className="we-card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.6 }}>
          Register multi-day leave here. The system will{' '}
          <strong style={{ color: 'var(--amber)' }}>automatically mark your daily status</strong>{' '}
          during the leave period — you won't need to report each day.
        </div>
      </div>

      <button className="btn btn-primary" style={{ marginBottom: 14 }} onClick={() => setShowForm(v => !v)}>
        {showForm ? 'Cancel' : '+ Register Leave / Time Off'}
      </button>

      {showForm && (
        <div className="we-card amber" style={{ marginBottom: 12 }}>
          <div className="we-clabel cl-amber">New Leave Registration</div>

          {/* LEAVE TYPE */}
          <div className="fg">
            <label className="we-label">Leave Type</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {leaveTypes.map(t => (
                <button
                  key={t}
                  onClick={() => upd('leave_type', t)}
                  style={{
                    padding: '10px 14px', borderRadius: 7, cursor: 'pointer',
                    border: `1.5px solid ${form.leave_type === t ? 'var(--amber)' : 'var(--border)'}`,
                    background: form.leave_type === t ? 'rgba(232,160,32,0.12)' : 'var(--surf-hi)',
                    color: form.leave_type === t ? 'var(--text)' : 'var(--dim)',
                    fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500,
                    textAlign: 'left',
                  }}>
                  {t === 'Local Leave' && '🏠 '}
                  {t === 'Overseas Leave' && '✈️ '}
                  {t === 'Time Off' && '⏰ '}
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* DATES */}
          {form.leave_type !== 'Time Off' ? (
            <div className="g2" style={{ gap: 8, marginBottom: 12 }}>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="we-label">Start Date</label>
                <input className="we-input" type="date" value={form.start_date} min={today}
                  onChange={e => upd('start_date', e.target.value)} />
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="we-label">End Date</label>
                <input className="we-input" type="date" value={form.end_date} min={form.start_date}
                  onChange={e => upd('end_date', e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="fg">
              <label className="we-label">Date</label>
              <input className="we-input" type="date" value={form.start_date} min={today}
                onChange={e => { upd('start_date', e.target.value); upd('end_date', e.target.value) }} />
            </div>
          )}

          {/* OVERSEAS FIELDS */}
          {form.leave_type === 'Overseas Leave' && (
            <>
              <div className="fg">
                <label className="we-label">Country <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className="we-input" placeholder="e.g. Malaysia" value={form.country}
                  onChange={e => upd('country', e.target.value)} />
              </div>
              <div className="fg">
                <label className="we-label">City (optional)</label>
                <input className="we-input" placeholder="e.g. Kuala Lumpur" value={form.city}
                  onChange={e => upd('city', e.target.value)} />
              </div>
              <div className="fg">
                <label className="we-label">Contactable While Overseas?</label>
                <div className="g2" style={{ gap: 6 }}>
                  {[{ v: true, l: '✓ Yes — Contactable' }, { v: false, l: '✗ No — Not Contactable' }].map(opt => (
                    <button key={String(opt.v)}
                      onClick={() => upd('contactable', opt.v)}
                      style={{
                        padding: '10px', borderRadius: 7, cursor: 'pointer',
                        border: `1.5px solid ${form.contactable === opt.v ? (opt.v ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
                        background: form.contactable === opt.v ? (opt.v ? 'rgba(22,169,107,0.12)' : 'rgba(220,53,69,0.12)') : 'var(--surf-hi)',
                        color: form.contactable === opt.v ? 'var(--text)' : 'var(--dim)',
                        fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 500,
                      }}>
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="fg">
                <label className="we-label">Emergency Contact Number</label>
                <input className="we-input" placeholder="e.g. +60 12 345 6789" value={form.emergency_contact}
                  onChange={e => upd('emergency_contact', e.target.value)} />
              </div>
            </>
          )}

          {/* COVERING PERSON */}
          <div className="fg">
            <label className="we-label">Covering Person (optional)</label>
            <select
              className="we-input"
              value={form.covering_person_id}
              onChange={e => upd('covering_person_id', e.target.value)}
              style={{ color: form.covering_person_id ? 'var(--text)' : 'var(--dim)' }}
            >
              <option value="">— None / Not applicable —</option>
              {personnel.map(p => (
                <option key={p.id} value={p.id}>
                  {p.personnel_type === 'Military' ? p.rank : p.title} {p.full_name}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
              Who will handle your duties while you're away?
            </div>
          </div>

          <div className="fg">
            <label className="we-label">Remarks (optional)</label>
            <textarea className="we-input we-textarea" placeholder="e.g. Family trip, Annual leave block"
              value={form.remarks} onChange={e => upd('remarks', e.target.value)} />
          </div>

          {formErr && <div className="we-err-text" style={{ marginBottom: 10 }}>{formErr}</div>}

          <div style={{ background: 'var(--bg)', borderRadius: 7, padding: '10px 12px', fontSize: 11, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.6 }}>
            ℹ️ System will auto-mark your daily status from {form.start_date} to {form.end_date}.
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={submitLeave}>
              {saving ? 'Saving…' : 'Register Leave'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--dim)', textAlign: 'center', padding: 24 }}>Loading…</div>
      ) : leaves.length === 0 ? (
        <div className="we-card">
          <div style={{ fontSize: 13, color: 'var(--dim)', textAlign: 'center', padding: '16px 0' }}>No leave periods registered.</div>
        </div>
      ) : (
        leaves.map(l => {
          const badge      = statusBadge(l)
          const isOverseas = l.leave_type === 'Overseas Leave'
          return (
            <div key={l.id} className={`we-card${l.status === 'cancelled' ? '' : isOverseas ? ' purple' : ' amber'}`} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{isOverseas ? '✈️ ' : '🏠 '}{l.leave_type}</div>
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>
                    {formatDate(l.start_date)} → {formatDate(l.end_date)}
                  </div>
                </div>
                <span className="we-chip" style={{ background: badge.color + '22', color: badge.color, border: `1px solid ${badge.color}44`, fontSize: 10 }}>
                  {badge.label}
                </span>
              </div>
              {isOverseas && l.country && (
                <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 6 }}>
                  📍 {l.city ? l.city + ', ' : ''}{l.country} ·
                  <span style={{ color: l.contactable ? 'var(--green)' : 'var(--red)', fontWeight: 600, marginLeft: 4 }}>
                    {l.contactable ? 'Contactable' : 'Not Contactable'}
                  </span>
                  {l.emergency_contact && ` · ${l.emergency_contact}`}
                </div>
              )}
              {l.covering_person && (
                <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: 'var(--teal,#0891B2)' }}>👤 Covered by:</span>
                  <span style={{ fontWeight: 600 }}>
                    {(l.covering_person as any).personnel_type === 'Military'
                      ? (l.covering_person as any).rank
                      : (l.covering_person as any).title}{' '}
                    {(l.covering_person as any).full_name}
                  </span>
                </div>
              )}
              {l.remarks && <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 8 }}>"{l.remarks}"</div>}
              {l.status === 'approved' && today <= l.end_date && (
                <button className="btn-sm" style={{ fontSize: 10, color: 'var(--red)', borderColor: 'rgba(220,53,69,0.2)' }}
                  onClick={() => cancelLeave(l.id)}>
                  Cancel Leave
                </button>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
