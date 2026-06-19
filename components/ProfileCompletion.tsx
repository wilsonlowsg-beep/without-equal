'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@/types/database'
import { CIV_TITLES, GROUPS, MIL_RANKS, cleanProfileValue, displayName, emailUsername } from '@/lib/constants'

export default function ProfileCompletion({
  user,
  onComplete,
  onLogout,
}: {
  user: User
  onComplete: (user: User) => void
  onLogout: () => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState({
    personnelType: user.personnel_type || 'Military',
    rank: cleanProfileValue(user.rank) || 'MAJ',
    title: cleanProfileValue(user.title) || 'Mr',
    fullName: cleanProfileValue(user.full_name) || emailUsername(user.email),
    groupId: user.group_id ?? 1,
    appointment: cleanProfileValue(user.appointment) === 'Pending onboarding' ? '' : cleanProfileValue(user.appointment),
    mobile: cleanProfileValue(user.mobile).startsWith('auth-') ? '' : cleanProfileValue(user.mobile),
  })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const upd = (key: string, value: string | number) => setForm(current => ({ ...current, [key]: value }))

  const save = async () => {
    if (!form.fullName.trim()) { setErr('Full name is required.'); return }
    if (!form.appointment.trim()) { setErr('Appointment is required.'); return }
    if (!form.mobile.trim()) { setErr('Mobile number is required.'); return }
    if (form.personnelType === 'Military' && !form.rank.trim()) { setErr('Rank is required.'); return }
    if (form.personnelType === 'Civilian' && !form.title.trim()) { setErr('Title is required.'); return }

    setSaving(true)
    setErr('')

    const update = {
      personnel_type: form.personnelType as User['personnel_type'],
      rank: form.personnelType === 'Military' ? form.rank.trim() : null,
      title: form.personnelType === 'Civilian' ? form.title.trim() : null,
      full_name: form.fullName.trim(),
      group_id: Number(form.groupId),
      appointment: form.appointment.trim(),
      mobile: form.mobile.trim(),
    }

    const { data, error } = await supabase
      .from('users')
      .update(update)
      .eq('id', user.id)
      .select('*, group:groups(*)')
      .maybeSingle()

    setSaving(false)

    if (error) { setErr(error.message); return }
    if (!data) { setErr('Profile saved but could not be reloaded. Please sign in again.'); return }
    onComplete({ ...data, email: (data as User).email ?? user.email } as User)
  }

  return (
    <div className="we-scroll">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:20}}>
        <div>
          <div className="we-login-brand" style={{textAlign:'left'}}>WITHOUT EQUAL</div>
          <div style={{fontSize:15,fontWeight:700}}>Complete Profile</div>
        </div>
        <button className="btn-sm" onClick={onLogout}>Sign Out</button>
      </div>

      <div className="we-card amber" style={{marginBottom:14}}>
        <div className="we-clabel cl-amber">Profile incomplete</div>
        <div style={{fontSize:13,color:'var(--dim)',lineHeight:1.5}}>
          Signed in as {displayName(user)}. Add the missing details to continue.
        </div>
      </div>

      <div className="fg"><label className="we-label">Personnel Type</label>
        <div className="g2">{['Military','Civilian'].map(t=>(
          <button key={t} className="btn-sm" onClick={()=>upd('personnelType',t)}
            style={{padding:10,borderColor:form.personnelType===t?'var(--amber)':'var(--border)',color:form.personnelType===t?'var(--amber)':'var(--dim)'}}>
            {t}
          </button>
        ))}</div></div>

      {form.personnelType === 'Military'
        ? <div className="fg"><label className="we-label">Rank</label><select className="we-input we-select" value={form.rank} onChange={e=>upd('rank', e.target.value)}>{MIL_RANKS.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
        : <div className="fg"><label className="we-label">Title</label><select className="we-input we-select" value={form.title} onChange={e=>upd('title', e.target.value)}>{CIV_TITLES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
      }

      <div className="fg"><label className="we-label">Full Name</label>
        <input className="we-input" value={form.fullName} onChange={e=>upd('fullName', e.target.value)} placeholder="e.g. Wilson Low"/></div>

      <div className="fg"><label className="we-label">Group</label>
        <select className="we-input we-select" value={form.groupId} onChange={e=>upd('groupId', Number(e.target.value))}>
          {GROUPS.map(g=><option key={g.id} value={g.id}>Grp {g.id} - {g.name}</option>)}
        </select></div>

      <div className="fg"><label className="we-label">Appointment</label>
        <input className="we-input" value={form.appointment} onChange={e=>upd('appointment', e.target.value)} placeholder="e.g. SO2 Current"/></div>

      <div className="fg"><label className="we-label">Mobile Number</label>
        <input className="we-input" inputMode="numeric" value={form.mobile} onChange={e=>upd('mobile', e.target.value)} placeholder="e.g. 91234567"/></div>

      {err && <div className="we-login-err" style={{marginBottom:12}}>{err}</div>}

      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving...' : 'Save Profile'}
      </button>
    </div>
  )
}
