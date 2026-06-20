'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@/types/database'
import { statusColor, displayName, todayStr, GROUPS, MIL_RANKS, CIV_TITLES } from '@/lib/constants'

// ── MY HISTORY ───────────────────────────────────────────────────────────────
export function MyHistory({ user }: { user: User }) {
  const [subs, setSubs] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => {
    supabase.from('daily_submissions').select('*')
      .eq('user_id', user.id).order('submission_date',{ascending:false}).limit(90)
      .then(({data}) => setSubs(data??[]))
  }, [])

  const downloadCSV = () => {
    if (subs.length === 0) return
    const header = ['Date','Status','Time_Submitted','Auto','Amended','Remarks']
    const rows = subs.map(s => [
      s.submission_date,
      s.status,
      new Date(s.submitted_at).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit',hour12:false}),
      s.is_auto ? 'Yes' : 'No',
      s.is_amended ? 'Yes' : 'No',
      (s.remarks ?? '').replace(/,/g,' ')
    ])
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `WE_History_${user.full_name.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="we-card">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div className="we-clabel" style={{marginBottom:0}}>Submission History</div>
          {subs.length > 0 && (
            <button
              onClick={downloadCSV}
              style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',cursor:'pointer',fontFamily:'var(--mono)'}}
            >
              ⬇ CSV
            </button>
          )}
        </div>
        {subs.length === 0
          ? <div style={{fontSize:13,color:'var(--dim)'}}>No submissions yet.</div>
          : subs.map((s,i) => (
            <div className="we-row" key={i}>
              <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--dim)',width:52,flexShrink:0}}>{s.submission_date.slice(5)}</div>
              <div style={{flex:1,fontSize:13,fontWeight:500,color:statusColor(s.status)}}>{s.status}</div>
              {s.is_auto    && <span className="badge-auto" style={{fontSize:9,padding:'2px 6px'}}>AUTO</span>}
              {s.is_amended && <span className="we-chip" style={{background:'var(--amber-bg)',color:'var(--amber)',border:'1px solid rgba(232,160,32,.2)',fontSize:9}}>AMENDED</span>}
              <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--dim)'}}>
                {new Date(s.submitted_at).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit',hour12:false})}H
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ── TRENDS ───────────────────────────────────────────────────────────────────
export function TrendsView() {
  const [trend, setTrend] = useState<{date:string;rate:number}[]>([])
  const supabase = createClient()

  useEffect(() => {
    const loadTrend = async () => {
      const { data: total } = await supabase.from('users').select('id',{count:'exact'}).eq('is_active',true).neq('role','admin')
      const totalCount = total?.length ?? 0
      const days = Array.from({length:14}).map((_,i) => {
        const d = new Date(); d.setDate(d.getDate()-i)
        return d.toISOString().slice(0,10)
      }).reverse()
      const results = await Promise.all(days.map(async date => {
        const {data} = await supabase.from('daily_submissions').select('id',{count:'exact'}).eq('submission_date',date)
        const count = data?.length ?? 0
        return {date, rate: totalCount ? Math.round(count/totalCount*100) : 0}
      }))
      setTrend(results)
    }
    loadTrend()
  }, [])

  return (
    <div>
      <div className="we-card">
        <div className="we-clabel">14-Day Reporting Trend</div>
        {trend.map((d,i) => (
          <div key={i} style={{marginBottom:10}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--dim)',marginBottom:4}}>
              <span style={{fontFamily:'var(--mono)'}}>{d.date.slice(5)}</span>
              <span style={{color:d.rate>=80?'var(--green)':d.rate>=60?'var(--amber)':'var(--red)',fontWeight:600}}>{d.rate}%</span>
            </div>
            <div className="we-prog-wrap" style={{height:6}}>
              <div className="we-prog-fill" style={{width:`${d.rate}%`,background:d.rate>=80?'var(--green)':d.rate>=60?'var(--amber)':'var(--red)'}}/>
            </div>
          </div>
        ))}
      </div>
      <div className="we-card">
        <div className="we-clabel">Threshold Reference</div>
        {[['≥90%','Full compliance','var(--green)'],['80–89%','Acceptable','var(--amber)'],['<80%','Action required','var(--red)']].map(([p,l,c])=>(
          <div key={p} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,fontSize:12}}>
            <div style={{width:8,height:8,borderRadius:4,background:c,flexShrink:0}}/>
            <span style={{fontFamily:'var(--mono)',color:c,fontWeight:600,width:48}}>{p}</span>
            <span style={{color:'var(--dim)'}}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── ADMIN DASHBOARD ───────────────────────────────────────────────────────────
export function AdminDashboard({ showToast }: { showToast: (m:string)=>void }) {
  const [users, setUsers]     = useState<User[]>([])
  const [audit, setAudit]     = useState<any[]>([])
  const [activeTab, setATab]  = useState<'users'|'audit'>('users')
  const [showAdd, setShowAdd] = useState(false)
  const [nu, setNu] = useState({type:'Military',rank:'MAJ',title:'Mr',name:'',groupId:1,appt:'',mobile:'',email:'',password:'demo',role:'personnel'})
  const [nuErr, setNuErr] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const [{ data: u }, { data: a }] = await Promise.all([
      supabase.from('users').select('*').eq('is_active',true).order('group_id').order('full_name'),
      supabase.from('audit_log').select('*, user:users(full_name,rank,title,personnel_type)').order('created_at',{ascending:false}).limit(50),
    ])
    setUsers(u??[])
    setAudit(a??[])
  }

  const upd = (k:string,v:any) => setNu(n=>({...n,[k]:v}))

  const addUser = async () => {
    if (!nu.name.trim()||!nu.mobile.trim()||!nu.email.trim()) { setNuErr('Name, mobile and email required.'); return }
    setSaving(true); setNuErr('')
    // Create auth user
    const { data, error } = await supabase.auth.admin?.createUser?.({
      email: nu.mobile.trim()+'@we.internal',
      password: nu.password,
      email_confirm: true,
    }) ?? { data: null, error: { message: 'Admin API not available in client' } }

    if (error) {
      setNuErr('Use Supabase dashboard to create auth users, or use the Register flow. Error: '+error.message)
      setSaving(false); return
    }
    if (data?.user) {
      await supabase.from('users').insert({
        id: data.user.id,
        personnel_type: nu.type as any,
        rank: nu.type==='Military'?nu.rank:undefined,
        title: nu.type==='Civilian'?nu.title:undefined,
        full_name: nu.name.trim(),
        group_id: Number(nu.groupId),
        appointment: nu.appt.trim(),
        mobile: nu.mobile.trim(),
        role: nu.role as any,
      })
      showToast('User added ✓')
      setShowAdd(false)
      loadData()
    }
    setSaving(false)
  }

  const cycleRole = async (u: User) => {
    const order: User['role'][] = ['personnel','grouphead','ac3','admin']
    const next = order[(order.indexOf(u.role)+1)%order.length]
    await supabase.from('users').update({role:next}).eq('id',u.id)
    showToast(`${u.full_name.split(' ').pop()} → ${next}`)
    loadData()
  }

  const deactivate = async (u: User) => {
    await supabase.from('users').update({is_active:false}).eq('id',u.id)
    showToast(`${u.full_name.split(' ').pop()} deactivated`)
    loadData()
  }

  return (
    <div>
      <div style={{display:'flex',gap:6,marginBottom:12}}>
        {(['users','audit'] as const).map(t=>(
          <button key={t} className={`we-pill${activeTab===t?' on':''}`} onClick={()=>setATab(t)}>
            {t==='users'?'User Management':'Audit Log'}
          </button>
        ))}
      </div>

      {activeTab==='users' && <>
        <button className="btn btn-primary" style={{marginBottom:12}} onClick={()=>setShowAdd(v=>!v)}>
          {showAdd?'Cancel':'+ Add User'}
        </button>
        {showAdd && (
          <div className="we-card amber" style={{marginBottom:12}}>
            <div className="we-clabel cl-amber">New User</div>
            <div className="fg"><label className="we-label">Type</label>
              <div className="g2">{['Military','Civilian'].map(t=><button key={t} className="btn-sm" onClick={()=>upd('type',t)} style={{padding:10,borderColor:nu.type===t?'var(--amber)':'var(--border)',color:nu.type===t?'var(--amber)':'var(--dim)'}}>{t}</button>)}</div></div>
            {nu.type==='Military'
              ?<div className="fg"><label className="we-label">Rank</label><select className="we-input we-select" value={nu.rank} onChange={e=>upd('rank',e.target.value)}>{MIL_RANKS.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
              :<div className="fg"><label className="we-label">Title</label><select className="we-input we-select" value={nu.title} onChange={e=>upd('title',e.target.value)}>{CIV_TITLES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>}
            <div className="fg"><label className="we-label">Name</label><input className="we-input" value={nu.name} onChange={e=>upd('name',e.target.value)} placeholder="Full name"/></div>
            <div className="fg"><label className="we-label">Group</label>
              <select className="we-input we-select" value={nu.groupId} onChange={e=>upd('groupId',e.target.value)}>
                {GROUPS.filter(g=>g.id>0).map(g=><option key={g.id} value={g.id}>Grp {g.id} – {g.name}</option>)}
              </select></div>
            <div className="fg"><label className="we-label">Appointment</label><input className="we-input" value={nu.appt} onChange={e=>upd('appt',e.target.value)} placeholder="e.g. SO2"/></div>
            <div className="fg"><label className="we-label">Mobile</label><input className="we-input" value={nu.mobile} onChange={e=>upd('mobile',e.target.value)} placeholder="e.g. 91234567"/></div>
            <div className="fg"><label className="we-label">Email</label><input className="we-input" value={nu.email} onChange={e=>upd('email',e.target.value)} placeholder="name@we.mil.sg"/></div>
            <div className="fg"><label className="we-label">Role</label>
              <select className="we-input we-select" value={nu.role} onChange={e=>upd('role',e.target.value)}>
                <option value="personnel">Personnel</option><option value="grouphead">Group Head</option>
                <option value="ac3">AC3</option><option value="admin">Admin</option>
              </select></div>
            {nuErr && <div className="we-err-text" style={{marginBottom:10}}>{nuErr}</div>}
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-secondary" style={{flex:1}} onClick={()=>setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" style={{flex:2}} disabled={saving} onClick={addUser}>{saving?'Adding…':'Add User'}</button>
            </div>
          </div>
        )}
        {GROUPS.map(g => {
          const members = users.filter(u=>u.group_id===g.id)
          if (!members.length) return null
          return (
            <div className="we-card" key={g.id} style={{marginBottom:10}}>
              <div className="we-clabel">Grp {g.id} — {g.name} · {members.length} pax</div>
              {members.map(u=>(
                <div className="we-row" key={u.id}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600}}>{displayName(u)}</div>
                    <div style={{fontSize:10,color:'var(--dim)'}}>{u.appointment} · {u.mobile}</div>
                  </div>
                  <span className="we-chip" style={{background:'var(--surf-hi)',color:'var(--dim)',border:'1px solid var(--border)',fontSize:9,cursor:'pointer',marginRight:6}} onClick={()=>cycleRole(u)}>
                    {u.role}
                  </span>
                  <button className="btn-sm" style={{fontSize:10,padding:'4px 8px',color:'var(--red)',borderColor:'rgba(220,53,69,.2)'}} onClick={()=>deactivate(u)}>✕</button>
                </div>
              ))}
            </div>
          )
        })}
      </>}

      {activeTab==='audit' && (
        <div className="we-card">
          <div className="we-clabel cl-amber">Audit Log</div>
          {audit.length===0
            ?<div style={{fontSize:13,color:'var(--dim)'}}>No audit entries.</div>
            :audit.map((a,i)=>(
              <div className="we-row" key={i}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600}}>{a.user?displayName(a.user as any):'System'}</div>
                  <div style={{fontSize:11,color:'var(--dim)'}}>{a.action} · {new Date(a.created_at).toLocaleString('en-SG')}</div>
                  {a.new_value?.amend_reason && <div style={{fontSize:11,color:'var(--dim)'}}>Reason: {a.new_value.amend_reason}</div>}
                </div>
                {a.new_value?.status && (
                  <span className="we-chip" style={{background:statusColor(a.new_value.status)+'18',color:statusColor(a.new_value.status),fontSize:10}}>
                    {a.new_value.status}
                  </span>
                )}
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

export default MyHistory
