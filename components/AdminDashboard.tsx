'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@/types/database'
import { displayName, GROUPS, MIL_RANKS, CIV_TITLES, statusColor } from '@/lib/constants'
import PushSender from './PushSender'

// removed - using real email now
function mobileToEmail(mobile: string): string {
  return `${mobile.trim()}@without-equal.app`
}

const ROLE_OPTIONS = [
  { value:'personnel', label:'Personnel',  desc:'Submit own status only. Cannot see others.',                          color:'var(--dim)',    icon:'👤' },
  { value:'grouphead', label:'Group Head', desc:'Sees full status of own group only. Can mark group Reviewed.',        color:'var(--blue)',   icon:'👥' },
  { value:'ac3',       label:'AC3 View',   desc:'Sees all groups, formation dashboard, trends, and full report.',      color:'var(--amber)',  icon:'🎖️' },
  { value:'admin',     label:'Admin',      desc:'Manages users and roles. Full system access.',                        color:'var(--red)',    icon:'⚙️' },
]

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_OPTIONS.find(r => r.value === role) ?? ROLE_OPTIONS[0]
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:600,
      background: cfg.color+'18', color: cfg.color, border:`1px solid ${cfg.color}33`,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function RoleModal({ user, onSave, onClose }: { user: User; onSave:(role:string,groupId:number,workSchedule:string)=>void; onClose:()=>void }) {
  const [role,         setRole]        = useState(user.role)
  const [groupId,      setGroupId]     = useState(user.group_id)
  const [workSchedule, setWorkSchedule] = useState((user as any).work_schedule ?? 'weekdays')
  return (
    <div style={{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:'var(--surf)',border:'1px solid var(--border)',borderRadius:'14px 14px 0 0',padding:'20px 18px 40px',width:'100%',maxWidth:430}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,borderRadius:4,background:'var(--border)',margin:'0 auto 16px'}}/>
        <div style={{fontSize:14,fontWeight:700,marginBottom:2}}>{displayName(user)}</div>
        <div style={{fontSize:11,color:'var(--dim)',marginBottom:16}}>{user.appointment} · {user.mobile}</div>

        <label className="we-label" style={{marginBottom:8,display:'block'}}>Assign to Group</label>
        <select className="we-input we-select" style={{marginBottom:16}} value={groupId} onChange={e=>setGroupId(Number(e.target.value))}>
          {GROUPS.map(g=><option key={g.id} value={g.id}>Grp {g.id} – {g.name}</option>)}
        </select>

        <label className="we-label" style={{marginBottom:10,display:'block'}}>Work Schedule</label>
        <div className="g2" style={{gap:8,marginBottom:16}}>
          {[
            { v:'weekdays', label:'📅 Mon–Fri', desc:'No weekend reporting' },
            { v:'shift',    label:'🔄 Shift / 24-7', desc:'Reports daily incl. weekends' },
          ].map(opt=>(
            <button key={opt.v} onClick={()=>setWorkSchedule(opt.v)} style={{
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

        <label className="we-label" style={{marginBottom:10,display:'block'}}>Access Level</label>
        <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
          {ROLE_OPTIONS.map(opt=>(
            <button key={opt.value} onClick={()=>setRole(opt.value)} style={{
              display:'flex', alignItems:'flex-start', gap:12,
              padding:'12px 14px', borderRadius:8, cursor:'pointer',
              border:`1.5px solid ${role===opt.value?opt.color:'var(--border)'}`,
              background: role===opt.value ? opt.color+'12' : 'var(--surf-hi)',
              textAlign:'left', width:'100%', fontFamily:'var(--sans)',
            }}>
              <div style={{fontSize:20,lineHeight:1,flexShrink:0,marginTop:1}}>{opt.icon}</div>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:role===opt.value?opt.color:'var(--text)'}}>{opt.label}</div>
                <div style={{fontSize:11,color:'var(--dim)',marginTop:2,lineHeight:1.4}}>{opt.desc}</div>
              </div>
              {role===opt.value && <div style={{marginLeft:'auto',color:opt.color,fontSize:16,flexShrink:0}}>✓</div>}
            </button>
          ))}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-secondary" style={{flex:1}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{flex:2}} onClick={()=>onSave(role,groupId,workSchedule)}>Save Changes</button>
        </div>
      </div>
    </div>
  )
}

function AddUserForm({ onDone, showToast }: { onDone:()=>void; showToast:(m:string)=>void }) {
  const [form, setForm] = useState({
    type:'Military', rank:'MAJ', title:'Mr',
    name:'', groupId:1, appt:'', mobile:'', email:'', password:'',
    work_schedule: 'weekdays',
  })
  const [err, setErr]       = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const upd = (k:string,v:any) => setForm(f=>({...f,[k]:v}))

  const submit = async () => {
    if (!form.name.trim())   { setErr('Full name is required.'); return }
    if (!form.appt.trim())   { setErr('Appointment is required.'); return }
    if (!form.mobile.trim()) { setErr('Mobile number is required.'); return }
    if (!form.email.trim()||!form.email.includes('@')) { setErr('Valid email address required.'); return }
    if (!/^\d{8}$/.test(form.mobile.trim())) { setErr('Enter a valid 8-digit Singapore mobile number.'); return }
    if (!form.password || form.password.length < 6) { setErr('Password must be at least 6 characters.'); return }
    setSaving(true); setErr('')

    // Check duplicate mobile
    const { data: dup } = await supabase.from('users').select('id').eq('mobile', form.mobile.trim()).single()
    if (dup) { setErr('This mobile number is already registered.'); setSaving(false); return }

    const authEmail = form.email.trim().toLowerCase()
    const { data, error } = await supabase.auth.signUp({ email: authEmail, password: form.password })

    if (error || !data.user) {
      setErr(error?.message ?? 'Failed to create account.')
      setSaving(false); return
    }

    // Confirm immediately
    const { error: profileErr } = await supabase.from('users').insert({
      id:             data.user.id,
      personnel_type: form.type as any,
      rank:           form.type==='Military' ? form.rank  : null,
      title:          form.type==='Civilian' ? form.title : null,
      full_name:      form.name.trim(),
      group_id:       Number(form.groupId),
      appointment:    form.appt.trim(),
      mobile:         form.mobile.trim(),
      email:          authEmail,
      role:           'personnel',
      work_schedule:  form.work_schedule,
    })

    if (profileErr) { setErr('Profile error: ' + profileErr.message); setSaving(false); return }

    // Auto-confirm in auth
    await supabase.rpc('confirm_user_by_mobile' as any, { p_mobile: form.mobile.trim() }).catch(()=>{})

    showToast(`${form.name} added ✓ — tap their name below to assign role`)
    onDone()
    setSaving(false)
  }

  return (
    <div className="we-card amber" style={{marginBottom:12}}>
      <div className="we-clabel cl-amber">New User</div>
      <div style={{fontSize:11,color:'var(--dim)',marginBottom:12,lineHeight:1.5}}>
        After adding, tap the user to assign their access level. They sign in with their mobile number and the temporary password you set here.
      </div>

      <div className="fg"><label className="we-label">Personnel Type</label>
        <div className="g2">{['Military','Civilian'].map(t=>(
          <button key={t} className="btn-sm" onClick={()=>upd('type',t)}
            style={{padding:10,borderColor:form.type===t?'var(--amber)':'var(--border)',color:form.type===t?'var(--amber)':'var(--dim)'}}>
            {t}
          </button>))}
        </div></div>

      {form.type==='Military'
        ?<div className="fg"><label className="we-label">Rank</label><select className="we-input we-select" value={form.rank} onChange={e=>upd('rank',e.target.value)}>{MIL_RANKS.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
        :<div className="fg"><label className="we-label">Title</label><select className="we-input we-select" value={form.title} onChange={e=>upd('title',e.target.value)}>{CIV_TITLES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
      }

      <div className="fg"><label className="we-label">Full Name</label>
        <input className="we-input" placeholder="e.g. Wilson Low" value={form.name} onChange={e=>upd('name',e.target.value)}/></div>

      <div className="fg"><label className="we-label">Group</label>
        <select className="we-input we-select" value={form.groupId} onChange={e=>upd('groupId',e.target.value)}>
          {GROUPS.map(g=><option key={g.id} value={g.id}>Grp {g.id} – {g.name}</option>)}
        </select></div>

      <div className="fg"><label className="we-label">Appointment</label>
        <input className="we-input" placeholder="e.g. SO2 Current" value={form.appt} onChange={e=>upd('appt',e.target.value)}/></div>

      <div className="fg"><label className="we-label">Mobile Number</label>
        <input className="we-input" placeholder="8-digit e.g. 91234567" inputMode="numeric" value={form.mobile} onChange={e=>upd('mobile',e.target.value)}/></div>

      <div className="fg"><label className="we-label">Email Address</label>
        <input className="we-input" type="email" placeholder="e.g. name@gmail.com" value={form.email} onChange={e=>upd('email',e.target.value)}/>
        <div style={{fontSize:10,color:'var(--dim)',marginTop:4}}>Any email — Gmail, Hotmail, work email all accepted.</div>
      </div>

      <div className="fg"><label className="we-label">Temporary Password</label>
        <input className="we-input" type="password" placeholder="Min 6 characters" value={form.password} onChange={e=>upd('password',e.target.value)}/>
        <div style={{fontSize:10,color:'var(--dim)',marginTop:4}}>Tell them this password. They can use Forgot Password to change it.</div>
      </div>

      <div className="fg">
        <label className="we-label">Work Schedule</label>
        <div className="g2" style={{gap:8}}>
          {[
            { v:'weekdays', label:'📅 Mon–Fri', desc:'No weekend reporting' },
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
          {saving?'Adding…':'Add User'}
        </button>
      </div>
    </div>
  )
}

export default function AdminDashboard({ showToast }: { showToast:(m:string)=>void }) {
  const [users,       setUsers]      = useState<User[]>([])
  const [audit,       setAudit]      = useState<any[]>([])
  const [tab,         setTab]        = useState<'users'|'audit'|'notifications'>('users')
  const [showAdd,     setShowAdd]    = useState(false)
  const [editing,     setEditing]    = useState<User|null>(null)
  const [loading,     setLoading]    = useState(true)
  const [search,      setSearch]     = useState('')
  const [myUserId,    setMyUserId]   = useState<string|null>(null)
  // Notification settings state
  const [pushEnabled,  setPushEnabled]  = useState(true)
  const [pushMessage,  setPushMessage]  = useState('⏰ 0800H — Report your status for today.')
  const [pushLastSent, setPushLastSent] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const supabase = createClient()

  useEffect(()=>{
    loadData()
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null))
  },[])

  const loadData = async () => {
    setLoading(true)
    const [{ data: u },{ data: a },{ data: ss }] = await Promise.all([
      supabase.from('users').select('*').eq('is_active',true).order('group_id').order('full_name'),
      supabase.from('audit_log').select('*, user:users(full_name,rank,title,personnel_type)').order('created_at',{ascending:false}).limit(50),
      supabase.from('system_settings').select('key,value'),
    ])
    setUsers(u??[])
    setAudit(a??[])
    if (ss) {
      const s = Object.fromEntries(ss.map((r:any)=>[r.key,r.value]))
      setPushEnabled(s['push_enabled'] !== 'false')
      if (s['push_message']) setPushMessage(s['push_message'])
      if (s['push_last_sent']) setPushLastSent(s['push_last_sent'])
    }
    setLoading(false)
  }

  const saveNotificationSettings = async () => {
    setSavingSettings(true)
    await Promise.all([
      supabase.from('system_settings').upsert({ key:'push_enabled', value: pushEnabled?'true':'false', updated_at: new Date().toISOString() }),
      supabase.from('system_settings').upsert({ key:'push_message', value: pushMessage.trim()||'⏰ 0800H — Report your status for today.', updated_at: new Date().toISOString() }),
    ])
    setSavingSettings(false)
    showToast('Notification settings saved ✓')
  }


  const saveRoleAndGroup = async (role:string, groupId:number, workSchedule:string) => {
    if (!editing) return
    const { error } = await supabase.from('users').update({ role, group_id:groupId, work_schedule:workSchedule }).eq('id', editing.id)
    if (error) { showToast('Error: '+error.message); return }
    await supabase.from('audit_log').insert({
      user_id: editing.id, action:'ROLE_CHANGE',
      old_value:{ role:editing.role, group_id:editing.group_id, work_schedule:(editing as any).work_schedule },
      new_value:{ role, group_id:groupId, work_schedule:workSchedule },
    })
    showToast(`${editing.full_name.split(' ').pop()} → ${role} ✓`)
    setEditing(null)
    loadData()
  }

  const deactivate = async (u:User) => {
    await supabase.from('users').update({is_active:false}).eq('id',u.id)
    showToast(`${u.full_name.split(' ').pop()} deactivated`)
    loadData()
  }

  const filtered = users.filter(u =>
    !search ||
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.mobile.includes(search) ||
    u.appointment.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div style={{padding:24,color:'var(--dim)',fontSize:13}}>Loading…</div>

  return (
    <div>
      <div style={{display:'flex',gap:6,marginBottom:12}}>
        {([
          ['users',         `Users (${users.length})`],
          ['notifications', '🔔 Notifications'],
          ['audit',         'Audit Log'],
        ] as const).map(([t, label])=>(
          <button key={t} className={`we-pill${tab===t?' on':''}`} onClick={()=>setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {tab==='users' && <>
        {/* HOW IT WORKS */}
        <div className="we-card" style={{marginBottom:12}}>
          <div className="we-clabel">Access Levels</div>
          {ROLE_OPTIONS.map(opt=>(
            <div key={opt.value} style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:8}}>
              <span style={{fontSize:16,flexShrink:0}}>{opt.icon}</span>
              <div><span style={{fontSize:12,fontWeight:600,color:opt.color}}>{opt.label}</span>
                <span style={{fontSize:11,color:'var(--dim)',marginLeft:6}}>{opt.desc}</span></div>
            </div>
          ))}
          <div style={{marginTop:8,fontSize:11,color:'var(--faint)'}}>
            Tap any user to change their access level or group.
          </div>
        </div>

        <button className="btn btn-primary" style={{marginBottom:12}} onClick={()=>setShowAdd(v=>!v)}>
          {showAdd?'Cancel':'+ Add New User'}
        </button>

        {showAdd && <AddUserForm onDone={()=>{setShowAdd(false);loadData()}} showToast={showToast}/>}

        <div className="fg">
          <input className="we-input" placeholder="Search by name, mobile, or appointment…"
            value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        {filtered.length===0 && !showAdd && (
          <div className="we-card" style={{textAlign:'center',padding:'20px 0'}}>
            <div style={{fontSize:13,color:'var(--dim)'}}>
              No users yet. Add users above, or share the registration link with your staff.
            </div>
            <div style={{marginTop:12,fontFamily:'var(--mono)',fontSize:12,color:'var(--amber)'}}>
              without-equal.vercel.app
            </div>
          </div>
        )}

        {GROUPS.map(g=>{
          const members = filtered.filter(u=>u.group_id===g.id)
          if (!members.length) return null
          return (
            <div className="we-card" key={g.id} style={{marginBottom:10}}>
              <div className="we-clabel">Grp {g.id} — {g.name} · {members.length} pax</div>
              {members.map(u=>(
                <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid var(--surf-hi)',cursor:'pointer'}}
                  onClick={()=>setEditing(u)}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600}}>{displayName(u)}</div>
                    <div style={{fontSize:10,color:'var(--dim)',marginTop:2}}>{u.appointment} · {u.mobile}</div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3}}>
                    <RoleBadge role={u.role}/>
                    <span style={{fontSize:9,color:(u as any).work_schedule==='shift'?'var(--teal,#0891B2)':'var(--faint)'}}>
                      {(u as any).work_schedule==='shift'?'🔄 Shift':'📅 Mon–Fri'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        })}

        {filtered.length>0 && (
          <div className="we-card" style={{marginTop:4}}>
            <div className="we-clabel cl-red">Deactivate User</div>
            <div style={{fontSize:11,color:'var(--dim)',marginBottom:10}}>Deactivated users cannot sign in. Data is preserved.</div>
            {filtered.map(u=>(
              <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--surf-hi)'}}>
                <div style={{flex:1,fontSize:12}}>{displayName(u)}</div>
                <button className="btn-sm" style={{fontSize:10,padding:'4px 10px',color:'var(--red)',borderColor:'rgba(220,53,69,.2)'}}
                  onClick={()=>deactivate(u)}>Deactivate</button>
              </div>
            ))}
          </div>
        )}
      </>}

      {tab==='notifications' && (
        <div>
          {/* Status bar */}
          <div className={`we-card ${pushEnabled?'green':'amber'}`} style={{marginBottom:12}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{fontSize:28}}>{pushEnabled?'🔔':'🔕'}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:pushEnabled?'var(--green)':'var(--amber)'}}>
                  Daily Push {pushEnabled?'Enabled':'Disabled'}
                </div>
                <div style={{fontSize:11,color:'var(--dim)',marginTop:2}}>
                  {pushEnabled
                    ? 'Fires at 0800H SGT to all users who haven\'t submitted'
                    : 'No automatic push will be sent today'}
                </div>
                {pushLastSent && (
                  <div style={{fontSize:10,color:'var(--faint)',marginTop:4,fontFamily:'var(--mono)'}}>
                    Last sent: {new Date(pushLastSent).toLocaleString('en-SG',{dateStyle:'short',timeStyle:'short'})}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Daily push settings */}
          <div className="we-card" style={{marginBottom:12}}>
            <div className="we-clabel">Daily 0800H Push Settings</div>

            {/* Toggle */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,padding:'10px 14px',background:'var(--surf-hi)',borderRadius:8,border:'1px solid var(--border)'}}>
              <div>
                <div style={{fontSize:13,fontWeight:600}}>Auto-push at 0800H</div>
                <div style={{fontSize:11,color:'var(--dim)',marginTop:2}}>Disable for stand-downs or holidays</div>
              </div>
              <button
                onClick={()=>setPushEnabled(v=>!v)}
                style={{
                  width:48,height:28,borderRadius:14,border:'none',cursor:'pointer',
                  background: pushEnabled ? 'var(--green)' : 'var(--border)',
                  position:'relative', transition:'background 0.2s', flexShrink:0,
                }}
              >
                <div style={{
                  position:'absolute', top:4, left: pushEnabled?22:4,
                  width:20, height:20, borderRadius:10,
                  background:'white', transition:'left 0.2s',
                }}/>
              </button>
            </div>

            {/* Message */}
            <div className="fg">
              <label className="we-label">Push Message</label>
              <textarea
                className="we-input we-textarea"
                rows={2}
                value={pushMessage}
                onChange={e=>setPushMessage(e.target.value)}
                placeholder="⏰ 0800H — Report your status for today."
              />
              <div style={{fontSize:10,color:'var(--dim)',marginTop:4}}>
                This is the body text of the daily reminder notification.
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{marginTop:4}}
              disabled={savingSettings}
              onClick={saveNotificationSettings}
            >
              {savingSettings ? 'Saving…' : 'Save Settings'}
            </button>
          </div>

          {/* Send Now */}
          {myUserId && (
            <PushSender
              userId={myUserId}
              role="admin"
              myGroupId={0}
              showToast={showToast}
              onSent={({ sent }) => {
                if (sent > 0) setPushLastSent(new Date().toISOString())
              }}
            />
          )}
        </div>
      )}

      {tab==='audit' && (
        <div className="we-card">
          <div className="we-clabel cl-amber">Audit Log</div>
          {audit.length===0
            ?<div style={{fontSize:13,color:'var(--dim)'}}>No entries yet.</div>
            :audit.map((a,i)=>(
              <div className="we-row" key={i}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600}}>{a.user?(a.user as any).full_name:'System'}</div>
                  <div style={{fontSize:11,color:'var(--dim)'}}>{a.action} · {new Date(a.created_at).toLocaleString('en-SG',{dateStyle:'short',timeStyle:'short'})}</div>
                  {a.action==='ROLE_CHANGE'&&a.old_value&&a.new_value&&(
                    <div style={{fontSize:11,color:'var(--dim)'}}>{a.old_value.role} → <span style={{color:'var(--amber)',fontWeight:600}}>{a.new_value.role}</span></div>
                  )}
                  {a.new_value?.amend_reason&&<div style={{fontSize:11,color:'var(--dim)'}}>Reason: {a.new_value.amend_reason}</div>}
                </div>
                {a.new_value?.status&&(
                  <span className="we-chip" style={{background:statusColor(a.new_value.status)+'18',color:statusColor(a.new_value.status),fontSize:10}}>
                    {a.new_value.status}
                  </span>
                )}
              </div>
            ))
          }
        </div>
      )}

      {editing && <RoleModal user={editing} onSave={saveRoleAndGroup} onClose={()=>setEditing(null)}/>}
    </div>
  )
}
