'use client'

/**
 * GroupManage — admin-like panel for group heads, scoped to their own group.
 * Can: add members, edit work schedule, deactivate.
 * Cannot: change roles beyond personnel/grouphead, move to another group.
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@/types/database'
import { displayName, MIL_RANKS, CIV_TITLES, GROUPS } from '@/lib/constants'

const ROLE_OPTIONS = [
  { value: 'personnel', label: 'Personnel',  icon: '👤', desc: 'Submit own status only.' },
  { value: 'grouphead', label: 'Group Head', icon: '👥', desc: 'Manages this group + submits own status.' },
]

// ── Edit member modal ────────────────────────────────────────────────────────
function EditModal({ member, onSave, onClose }: {
  member: User
  onSave: (workSchedule: string, role: string) => void
  onClose: () => void
}) {
  const [workSchedule, setWorkSchedule] = useState(member.work_schedule ?? 'weekdays')
  const [role, setRole] = useState(member.role === 'grouphead' ? 'grouphead' : 'personnel')

  return (
    <div style={{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:'var(--surf)',border:'1px solid var(--border)',borderRadius:'14px 14px 0 0',padding:'20px 18px 40px',width:'100%',maxWidth:430}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,borderRadius:4,background:'var(--border)',margin:'0 auto 16px'}}/>
        <div style={{fontSize:14,fontWeight:700,marginBottom:2}}>{displayName(member)}</div>
        <div style={{fontSize:11,color:'var(--dim)',marginBottom:16}}>{member.appointment} · {member.mobile}</div>

        <label className="we-label" style={{marginBottom:8,display:'block'}}>Access Level</label>
        <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
          {ROLE_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setRole(opt.value)} style={{
              display:'flex', alignItems:'center', gap:12,
              padding:'12px 14px', borderRadius:8, cursor:'pointer',
              border:`1.5px solid ${role===opt.value?'var(--amber)':'var(--border)'}`,
              background: role===opt.value?'rgba(232,160,32,0.1)':'var(--surf-hi)',
              textAlign:'left', width:'100%', fontFamily:'var(--sans)',
            }}>
              <span style={{fontSize:18}}>{opt.icon}</span>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:role===opt.value?'var(--amber)':'var(--text)'}}>{opt.label}</div>
                <div style={{fontSize:11,color:'var(--dim)',marginTop:1}}>{opt.desc}</div>
              </div>
              {role===opt.value && <span style={{marginLeft:'auto',color:'var(--amber)'}}>✓</span>}
            </button>
          ))}
        </div>

        <label className="we-label" style={{marginBottom:10,display:'block'}}>Work Schedule</label>
        <div className="g2" style={{gap:8,marginBottom:20}}>
          {[
            { v:'weekdays', label:'📅 Mon–Fri',      desc:'No weekend reporting' },
            { v:'shift',    label:'🔄 Shift / 24-7', desc:'Reports daily incl. weekends' },
          ].map(opt => (
            <button key={opt.v} onClick={() => setWorkSchedule(opt.v)} style={{
              padding:'10px 12px', borderRadius:8, cursor:'pointer', textAlign:'left',
              border:`1.5px solid ${workSchedule===opt.v?'var(--amber)':'var(--border)'}`,
              background: workSchedule===opt.v?'rgba(232,160,32,0.1)':'var(--surf-hi)',
              color: workSchedule===opt.v?'var(--text)':'var(--dim)',
              fontFamily:'var(--sans)',
            }}>
              <div style={{fontSize:12,fontWeight:600}}>{opt.label}</div>
              <div style={{fontSize:10,marginTop:2,opacity:0.7}}>{opt.desc}</div>
            </button>
          ))}
        </div>

        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-secondary" style={{flex:1}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{flex:2}} onClick={() => onSave(workSchedule, role)}>Save Changes</button>
        </div>
      </div>
    </div>
  )
}

// ── Add member form ──────────────────────────────────────────────────────────
function AddMemberForm({ groupId, onDone, showToast }: {
  groupId: number
  onDone: () => void
  showToast: (m: string) => void
}) {
  const [form, setForm] = useState({
    type: 'Military', rank: 'MAJ', title: 'Mr',
    name: '', appt: '', mobile: '', email: '', password: '',
    work_schedule: 'weekdays',
  })
  const [err, setErr]     = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const upd = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim())   { setErr('Full name is required.'); return }
    if (!form.appt.trim())   { setErr('Appointment is required.'); return }
    if (!form.mobile.trim()) { setErr('Mobile number is required.'); return }
    if (!form.email.trim() || !form.email.includes('@')) { setErr('Valid email required.'); return }
    if (!/^\d{8}$/.test(form.mobile.trim())) { setErr('Enter a valid 8-digit Singapore mobile.'); return }
    if (!form.password || form.password.length < 6) { setErr('Password must be at least 6 characters.'); return }
    setSaving(true); setErr('')

    const { data: dup } = await supabase.from('users').select('id').eq('mobile', form.mobile.trim()).single()
    if (dup) { setErr('This mobile is already registered.'); setSaving(false); return }

    const authEmail = form.email.trim().toLowerCase()
    const { data, error } = await supabase.auth.signUp({ email: authEmail, password: form.password })
    if (error || !data.user) { setErr(error?.message ?? 'Failed to create account.'); setSaving(false); return }

    const { error: profileErr } = await supabase.from('users').insert({
      id:             data.user.id,
      personnel_type: form.type as any,
      rank:           form.type === 'Military' ? form.rank  : null,
      title:          form.type === 'Civilian' ? form.title : null,
      full_name:      form.name.trim(),
      group_id:       groupId,         // always the group head's group
      appointment:    form.appt.trim(),
      mobile:         form.mobile.trim(),
      email:          authEmail,
      role:           'personnel',     // always starts as personnel
      work_schedule:  form.work_schedule,
    })

    if (profileErr) { setErr('Profile error: ' + profileErr.message); setSaving(false); return }
    await supabase.rpc('confirm_user_by_mobile' as any, { p_mobile: form.mobile.trim() }).catch(() => {})

    showToast(`${form.name.trim()} added ✓`)
    onDone()
    setSaving(false)
  }

  const grpName = GROUPS.find(g => g.id === groupId)?.name ?? `Group ${groupId}`

  return (
    <div className="we-card amber" style={{marginBottom:12}}>
      <div className="we-clabel cl-amber">Add Member to {grpName}</div>
      <div style={{fontSize:11,color:'var(--dim)',marginBottom:12,lineHeight:1.5}}>
        New member will be added to your group as Personnel. Tap their name after to adjust access level.
      </div>

      <div className="fg"><label className="we-label">Personnel Type</label>
        <div className="g2">{['Military','Civilian'].map(t=>(
          <button key={t} className="btn-sm" onClick={()=>upd('type',t)}
            style={{padding:10,borderColor:form.type===t?'var(--amber)':'var(--border)',color:form.type===t?'var(--amber)':'var(--dim)'}}>
            {t}
          </button>))}
        </div>
      </div>

      {form.type==='Military'
        ? <div className="fg"><label className="we-label">Rank</label><select className="we-input we-select" value={form.rank} onChange={e=>upd('rank',e.target.value)}>{MIL_RANKS.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
        : <div className="fg"><label className="we-label">Title</label><select className="we-input we-select" value={form.title} onChange={e=>upd('title',e.target.value)}>{CIV_TITLES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
      }

      <div className="fg"><label className="we-label">Full Name</label>
        <input className="we-input" placeholder="e.g. John Tan" value={form.name} onChange={e=>upd('name',e.target.value)}/>
      </div>

      <div className="fg"><label className="we-label">Appointment</label>
        <input className="we-input" placeholder="e.g. SO3 Plans" value={form.appt} onChange={e=>upd('appt',e.target.value)}/>
      </div>

      <div className="fg"><label className="we-label">Mobile Number</label>
        <input className="we-input" placeholder="8-digit e.g. 91234567" inputMode="numeric" value={form.mobile} onChange={e=>upd('mobile',e.target.value)}/>
      </div>

      <div className="fg"><label className="we-label">Email Address</label>
        <input className="we-input" type="email" placeholder="e.g. name@gmail.com" value={form.email} onChange={e=>upd('email',e.target.value)}/>
      </div>

      <div className="fg"><label className="we-label">Temporary Password</label>
        <input className="we-input" type="password" placeholder="Min 6 characters" value={form.password} onChange={e=>upd('password',e.target.value)}/>
        <div style={{fontSize:10,color:'var(--dim)',marginTop:4}}>Tell them this password. They can use Forgot Password to change it.</div>
      </div>

      <div className="fg">
        <label className="we-label">Work Schedule</label>
        <div className="g2" style={{gap:8}}>
          {[
            { v:'weekdays', label:'📅 Mon–Fri',      desc:'No weekend reporting' },
            { v:'shift',    label:'🔄 Shift / 24-7', desc:'Reports daily incl. weekends' },
          ].map(opt => (
            <button key={opt.v} onClick={() => upd('work_schedule', opt.v)} style={{
              padding:'10px 12px', borderRadius:8, cursor:'pointer', textAlign:'left',
              border:`1.5px solid ${form.work_schedule===opt.v?'var(--amber)':'var(--border)'}`,
              background: form.work_schedule===opt.v?'rgba(232,160,32,0.1)':'var(--surf-hi)',
              color: form.work_schedule===opt.v?'var(--text)':'var(--dim)',
              fontFamily:'var(--sans)',
            }}>
              <div style={{fontSize:12,fontWeight:600}}>{opt.label}</div>
              <div style={{fontSize:10,marginTop:2,opacity:0.7}}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {err && <div className="we-err-text" style={{marginBottom:10}}>{err}</div>}

      <div style={{display:'flex',gap:8}}>
        <button className="btn btn-secondary" style={{flex:1}} onClick={onDone}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={saving} onClick={submit}>
          {saving ? 'Adding…' : 'Add Member'}
        </button>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function GroupManage({ user, showToast }: { user: User; showToast: (m: string) => void }) {
  const [members, setMembers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [search,  setSearch]  = useState('')
  const supabase = createClient()

  useEffect(() => { loadMembers() }, [])

  const loadMembers = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('group_id', user.group_id)
      .eq('is_active', true)
      .order('full_name')
    setMembers(data ?? [])
    setLoading(false)
  }

  const saveEdit = async (workSchedule: string, role: string) => {
    if (!editing) return
    // Group heads can only set role to personnel or grouphead — not admin/ac3
    const safeRole = ['personnel', 'grouphead'].includes(role) ? role : 'personnel'
    await supabase.from('users')
      .update({ work_schedule: workSchedule, role: safeRole })
      .eq('id', editing.id)
    showToast(`${editing.full_name.split(' ').pop()} updated ✓`)
    setEditing(null)
    loadMembers()
  }

  const deactivate = async (m: User) => {
    await supabase.from('users').update({ is_active: false }).eq('id', m.id)
    showToast(`${m.full_name.split(' ').pop()} deactivated`)
    loadMembers()
  }

  const grpName = GROUPS.find(g => g.id === user.group_id)?.name ?? `Group ${user.group_id}`
  const filtered = members.filter(m =>
    !search ||
    m.full_name.toLowerCase().includes(search.toLowerCase()) ||
    m.mobile.includes(search) ||
    m.appointment.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div style={{padding:24,color:'var(--dim)',fontSize:13}}>Loading…</div>

  return (
    <div>
      {/* Header */}
      <div className="we-card" style={{marginBottom:12}}>
        <div className="we-clabel">Grp {user.group_id} — {grpName} · {members.length} pax</div>
        <div style={{fontSize:11,color:'var(--dim)'}}>
          Manage your group members' access levels and work schedules. Tap a member to edit.
        </div>
      </div>

      <button className="btn btn-primary" style={{marginBottom:12,width:'100%'}} onClick={() => setShowAdd(v => !v)}>
        {showAdd ? 'Cancel' : '+ Add New Member'}
      </button>

      {showAdd && (
        <AddMemberForm
          groupId={user.group_id}
          onDone={() => { setShowAdd(false); loadMembers() }}
          showToast={showToast}
        />
      )}

      <div className="fg" style={{marginBottom:12}}>
        <input className="we-input" placeholder="Search by name, mobile, or appointment…"
          value={search} onChange={e => setSearch(e.target.value)}/>
      </div>

      {/* Member list */}
      <div className="we-card" style={{marginBottom:12}}>
        {filtered.length === 0
          ? <div style={{fontSize:13,color:'var(--dim)'}}>No members found.</div>
          : filtered.map(m => (
            <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid var(--surf-hi)',cursor:'pointer'}}
              onClick={() => setEditing(m)}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600}}>{displayName(m)}</div>
                <div style={{fontSize:10,color:'var(--dim)',marginTop:2}}>{m.appointment} · {m.mobile}</div>
              </div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3}}>
                <span style={{
                  fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20,
                  background: m.role==='grouphead'?'rgba(59,130,246,0.15)':'rgba(100,100,100,0.15)',
                  color: m.role==='grouphead'?'var(--blue)':'var(--dim)',
                }}>
                  {m.role === 'grouphead' ? '👥 Grp Head' : '👤 Personnel'}
                </span>
                <span style={{fontSize:9,color:m.work_schedule==='shift'?'var(--teal,#0891B2)':'var(--faint)'}}>
                  {m.work_schedule === 'shift' ? '🔄 Shift' : '📅 Mon–Fri'}
                </span>
              </div>
            </div>
          ))
        }
      </div>

      {/* Deactivate section */}
      {filtered.length > 0 && (
        <div className="we-card">
          <div className="we-clabel cl-red">Deactivate Member</div>
          <div style={{fontSize:11,color:'var(--dim)',marginBottom:10}}>Deactivated members cannot sign in. Data is preserved.</div>
          {filtered.map(m => (
            <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--surf-hi)'}}>
              <div style={{flex:1,fontSize:12}}>{displayName(m)}</div>
              <button className="btn-sm" style={{fontSize:10,padding:'4px 10px',color:'var(--red)',borderColor:'rgba(220,53,69,.2)'}}
                onClick={() => deactivate(m)}>Deactivate</button>
            </div>
          ))}
        </div>
      )}

      {editing && <EditModal member={editing} onSave={saveEdit} onClose={() => setEditing(null)}/>}
    </div>
  )
}
