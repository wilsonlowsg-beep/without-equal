'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { GroupStats, User, LeavePeriod } from '@/types/database'
import { displayName, GROUPS, todayStr, tomorrowStr, formatDate, statusColor, AVAILABLE_STATUSES } from '@/lib/constants'

export default function FormationDashboard({ showToast }: { showToast: (m:string)=>void }) {
  const [stats,    setStats]    = useState<GroupStats[]>([])
  const [overseas, setOverseas] = useState<{user:User;leave:LeavePeriod}[]>([])
  const [returning,setReturning]= useState<{user:User;leave:LeavePeriod}[]>([])
  const [retTomorrow,setRetTomorrow] = useState<{user:User;leave:LeavePeriod}[]>([])
  const [notContac, setNotCon]  = useState<{user:User;leave:LeavePeriod}[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [allSubs,  setAllSubs]  = useState<any[]>([])
  const [filter,   setFilter]   = useState('All')
  const [aiText,   setAiText]   = useState<string|null>(null)
  const [aiLoading,setAiL]      = useState(false)
  const [aiShown,  setAiS]      = useState(false)
  const [loading,  setLoading]  = useState(true)
  // Historical export state
  const [histFrom, setHistFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate()-13); return d.toISOString().slice(0,10) })
  const [histTo,   setHistTo]   = useState(() => new Date().toISOString().slice(0,10))
  const [histLoading, setHistLoading] = useState(false)
  const supabase = createClient()
  const today    = todayStr()
  const tomorrow = tomorrowStr()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    // Formation stats via DB function
    const { data: formStats } = await supabase.rpc('get_formation_readiness', { target_date: today })

    // All users and today's subs for filter panel
    const [{ data: users }, { data: subs }] = await Promise.all([
      supabase.from('users').select('*').eq('is_active',true).neq('role','admin').order('full_name'),
      supabase.from('daily_submissions').select('*').eq('submission_date',today),
    ])

    // Leave intelligence
    const { data: allLeaves } = await supabase
      .from('leave_periods')
      .select('*, user:users(*)')
      .eq('status','approved')

    const overseas_now = (allLeaves??[]).filter(l => l.leave_type==='Overseas Leave' && today>=l.start_date && today<=l.end_date)
    const returning_today = (allLeaves??[]).filter(l => l.end_date===today)
    const returning_tom   = (allLeaves??[]).filter(l => l.end_date===tomorrow)
    const not_contactable = overseas_now.filter(l => !l.contactable)

    setStats(formStats ?? [])
    setAllUsers(users ?? [])
    setAllSubs(subs ?? [])
    setOverseas(overseas_now.map(l=>({user:l.user,leave:l})))
    setReturning(returning_today.map(l=>({user:l.user,leave:l})))
    setRetTomorrow(returning_tom.map(l=>({user:l.user,leave:l})))
    setNotCon(not_contactable.map(l=>({user:l.user,leave:l})))
    setLoading(false)
  }

  const total        = stats.reduce((a,b)=>a+(b.strength??0),0)
  const reported     = stats.reduce((a,b)=>a+(b.reported??0),0)
  const pending      = stats.reduce((a,b)=>a+(b.pending??0),0)
  const avail        = stats.reduce((a,b)=>a+(b.available??0),0)
  const attB         = stats.reduce((a,b)=>a+(b.attend_b??0),0)
  const attC         = stats.reduce((a,b)=>a+(b.attend_c??0),0)
  const localLv      = stats.reduce((a,b)=>a+(b.local_leave??0),0)
  const overseasLv   = stats.reduce((a,b)=>a+(b.overseas_leave??0),0)
  const timeOff      = stats.reduce((a,b)=>a+(b.time_off??0),0)
  const duty         = stats.reduce((a,b)=>a+(b.duty??0),0)
  const rate         = total ? Math.round(reported/total*100) : 0
  const unreviewed   = stats.filter(g=>!g.reviewed)

  // Filter
  let filtered = allUsers
  if (filter==='Military')     filtered = allUsers.filter(u=>u.personnel_type==='Military')
  if (filter==='Civilian')     filtered = allUsers.filter(u=>u.personnel_type==='Civilian')
  if (filter==='Available Now')filtered = allUsers.filter(u=>allSubs.some(s=>s.user_id===u.id&&AVAILABLE_STATUSES.includes(s.status)))
  if (filter==='Not Reported') filtered = allUsers.filter(u=>!allSubs.some(s=>s.user_id===u.id))
  if (filter==='Attend B')     filtered = allUsers.filter(u=>allSubs.some(s=>s.user_id===u.id&&s.status==='Attend B'))
  if (filter==='Attend C')     filtered = allUsers.filter(u=>allSubs.some(s=>s.user_id===u.id&&s.status==='Attend C'))
  if (filter==='Local Leave')  filtered = allUsers.filter(u=>allSubs.some(s=>s.user_id===u.id&&s.status==='Local Leave'))
  if (filter==='Overseas')     filtered = allUsers.filter(u=>allSubs.some(s=>s.user_id===u.id&&s.status==='Overseas Leave'))

  const buildReport = () => [
    'WITHOUT EQUAL','Daily Readiness Report',`${today} · 0830H`,
    '─────────────────────────',
    `Total Personnel : ${total}`,`Reported        : ${reported}`,`Pending         : ${pending}`,
    '─────────────────────────',
    `Available       : ${avail}`,`Attend B        : ${attB}`,`Attend C        : ${attC}`,
    `Local Leave     : ${localLv}`,`Overseas Leave  : ${overseasLv}`,`Time Off        : ${timeOff}`,`Duty / Course   : ${duty}`,
    '─────────────────────────',
    ...(overseas.length>0?['Overseas Personnel:',...overseas.map(o=>`  · ${displayName(o.user)} [${o.leave.country}]${!o.leave.contactable?' ⚠ NOT CONTACTABLE':''}`)]:[]),
    ...(returning.length>0?['Returning Today:',...returning.map(r=>`  · ${displayName(r.user)}`)]:[]),
    ...(retTomorrow.length>0?['Returning Tomorrow:',...retTomorrow.map(r=>`  · ${displayName(r.user)}`)]:[]),
    '─────────────────────────','Command Attention:',
    ...(attC>0?[`  ⚠ [RED] ${attC} Attend C case(s)`]:[]),
    ...(notContac.length>0?[`  ⚠ [RED] ${notContac.length} overseas not contactable: ${notContac.map(n=>displayName(n.user)).join(', ')}`]:[]),
    ...(pending>0?[`  ⚠ ${pending} personnel not reported`]:[]),
    ...(retTomorrow.length>0?[`  ℹ [AMBER] ${retTomorrow.length} returning tomorrow`]:[]),
    ...(unreviewed.length>0?[`  ℹ [AMBER] Groups pending review: ${unreviewed.map(g=>g.group_short).join(', ')}`]:[]),
    ...(attC===0&&notContac.length===0&&pending===0&&unreviewed.length===0?['  ✓ Nil. Formation fully reported and reviewed.']:[]),
    '─────────────────────────','WITHOUT EQUAL',
  ].join('\n')

  const reportText = buildReport()

  const copyReport = (fmt: string) => {
    let text = reportText
    if (fmt==='whatsapp') text = reportText.replace(/─+/g,'---')
    navigator.clipboard.writeText(text).then(()=>showToast(`Copied (${fmt}) ✓`)).catch(()=>showToast('Tap Copy again'))
  }

  const generateAI = async () => {
    setAiL(true); setAiS(true); setAiText(null)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-6', max_tokens:500,
          messages:[{role:'user',content:`You are a staff officer for Singapore military formation "WITHOUT EQUAL". Today ${today}: strength ${total}, reported ${reported}, pending ${pending}, available ${avail}, Attend B ${attB}, Attend C ${attC}, local leave ${localLv}, overseas leave ${overseasLv}, time off ${timeOff}, duty/course ${duty}, rate ${rate}%. Overseas personnel: ${overseas.map(o=>displayName(o.user)+' ('+o.leave.country+')').join(', ')||'Nil'}. Not contactable: ${notContac.map(n=>displayName(n.user)).join(', ')||'Nil'}. Returning today: ${returning.map(r=>displayName(r.user)).join(', ')||'Nil'}. Returning tomorrow: ${retTomorrow.map(r=>displayName(r.user)).join(', ')||'Nil'}. Unreviewed groups: ${unreviewed.map(g=>g.group_name).join(', ')||'Nil'}. Write a 4-5 sentence command-level readiness summary for AC3. Military register, active voice. Flag urgent issues first (Attend C, non-contactable overseas). Include leave and overseas situation. End with one-line formation posture assessment.`}]
        })
      })
      const d = await res.json()
      setAiText(d.content?.[0]?.text ?? 'Unable to generate.')
    } catch { setAiText('AI unavailable. Review data directly.') }
    setAiL(false)
  }

  const downloadHistoricalCSV = async () => {
    if (histFrom > histTo) { showToast('Start date must be before end date'); return }
    setHistLoading(true)
    try {
      // Build list of dates in range
      const dates: string[] = []
      const cur = new Date(histFrom)
      const end = new Date(histTo)
      while (cur <= end) { dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1) }

      // Fetch total active personnel count (denominator)
      const { data: activeUsers } = await supabase.from('users').select('id').eq('is_active',true).neq('role','admin')
      const totalStrength = activeUsers?.length ?? 0

      // Fetch all submissions in range in one query
      const { data: allHistSubs } = await supabase
        .from('daily_submissions')
        .select('submission_date, status, user_id')
        .gte('submission_date', histFrom)
        .lte('submission_date', histTo)

      const subs = allHistSubs ?? []

      // Aggregate per date
      const rows = dates.map(date => {
        const day = subs.filter(s => s.submission_date === date)
        const reported    = day.length
        const pending     = totalStrength - reported
        const available   = day.filter(s => ['Available','Work From Home'].includes(s.status)).length
        const attendB     = day.filter(s => s.status === 'Attend B').length
        const attendC     = day.filter(s => s.status === 'Attend C').length
        const localLeave  = day.filter(s => s.status === 'Local Leave').length
        const overseasLv  = day.filter(s => s.status === 'Overseas Leave').length
        const timeOff     = day.filter(s => s.status === 'Time Off').length
        const duty        = day.filter(s => ['Duty','Course'].includes(s.status)).length
        const rate        = totalStrength ? Math.round(reported / totalStrength * 100) : 0
        return [date, totalStrength, reported, pending, rate, available, attendB, attendC, localLeave, overseasLv, timeOff, duty]
      })

      const header = ['Date','Strength','Reported','Pending','Rate_%','Available','Attend_B','Attend_C','Local_Leave','Overseas_Leave','Time_Off','Duty_Course']
      const csv = [header, ...rows].map(r => r.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `WITHOUT_EQUAL_History_${histFrom}_to_${histTo}.csv`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Historical CSV downloaded ✓')
    } catch { showToast('Export failed — try again') }
    setHistLoading(false)
  }

  if (loading) return <div style={{padding:24,color:'var(--dim)',fontSize:13}}>Loading formation data…</div>

  return (
    <div>
      {/* HEADER */}
      <div style={{textAlign:'center',padding:'10px 0 14px',borderBottom:'1px solid var(--border)',marginBottom:12}}>
        <div style={{fontFamily:'var(--mono)',fontSize:9,letterSpacing:'0.2em',color:'var(--faint)',textTransform:'uppercase'}}>RESTRICTED · Formation Use Only</div>
        <div style={{fontSize:13,fontWeight:700,letterSpacing:'0.1em',color:'var(--amber)',marginTop:4}}>WITHOUT EQUAL · DAILY READINESS PICTURE</div>
        <div style={{fontSize:11,color:'var(--dim)',marginTop:3,fontFamily:'var(--mono)'}}>{today}</div>
      </div>

      {/* FORMATION SUMMARY */}
      <div className="we-card">
        <div className="we-clabel">Formation Summary</div>
        <div className="g3" style={{marginBottom:10}}>
          <div className="we-stat"><div className="we-statval sv-white">{total}</div><div className="we-statlbl">Strength</div></div>
          <div className="we-stat"><div className={`we-statval ${rate<80?'sv-amber':'sv-green'}`}>{reported}</div><div className="we-statlbl">Reported</div></div>
          <div className="we-stat"><div className={`we-statval ${pending>0?'sv-red':'sv-dim'}`}>{pending}</div><div className="we-statlbl">Pending</div></div>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--dim)',marginBottom:4}}>
          <span>Formation rate</span>
          <span style={{color:rate>=90?'var(--green)':rate>=70?'var(--amber)':'var(--red)',fontWeight:700,fontFamily:'var(--mono)'}}>{rate}%</span>
        </div>
        <div className="we-prog-wrap"><div className="we-prog-fill" style={{width:`${rate}%`,background:rate>=90?'var(--green)':rate>=70?'var(--amber)':'var(--red)'}}/></div>
      </div>

      {/* AVAILABILITY */}
      <div className="we-card">
        <div className="we-clabel">Availability State</div>
        <div className="g4">
          <div className="we-stat"><div className="we-statval sv-green">{avail}</div><div className="we-statlbl">Avail</div></div>
          <div className="we-stat"><div className={`we-statval ${attB+attC>0?'sv-red':'sv-dim'}`}>{attB+attC}</div><div className="we-statlbl">Medical</div></div>
          <div className="we-stat"><div className="we-statval sv-blue">{duty}</div><div className="we-statlbl">Duty</div></div>
          <div className="we-stat"><div className={`we-statval ${localLv+overseasLv+timeOff>0?'sv-amber':'sv-dim'}`}>{localLv+overseasLv+timeOff}</div><div className="we-statlbl">Leave</div></div>
        </div>
        <div className="g3" style={{marginTop:6}}>
          <div className="we-stat"><div className={`we-statval ${localLv>0?'sv-amber':'sv-dim'}`} style={{fontSize:18}}>{localLv}</div><div className="we-statlbl">Local Lv</div></div>
          <div className="we-stat"><div className={`we-statval ${overseasLv>0?'sv-purple':'sv-dim'}`} style={{fontSize:18}}>{overseasLv}</div><div className="we-statlbl">Overseas</div></div>
          <div className="we-stat"><div className={`we-statval ${timeOff>0?'sv-amber':'sv-dim'}`} style={{fontSize:18}}>{timeOff}</div><div className="we-statlbl">Time Off</div></div>
        </div>
      </div>

      {/* GROUP TABLE */}
      <div className="we-card">
        <div className="we-clabel">Readiness by Group</div>
        <div className="we-tablewrap">
          <table className="we-table">
            <thead><tr><th>Grp</th><th>Str</th><th>Rep</th><th>Avl</th><th>Lv</th><th>Med</th><th>Rev</th></tr></thead>
            <tbody>
              {stats.map(g => {
                const r = g.strength ? Math.round(g.reported/g.strength*100) : 0
                const totalLeave = (g.local_leave??0)+(g.overseas_leave??0)+(g.time_off??0)
                return (
                  <tr key={g.group_id}>
                    <td><span style={{fontWeight:700}}>{g.group_short}</span><span style={{fontSize:10,color:'var(--dim)',marginLeft:3}}>{r}%</span></td>
                    <td style={{color:'var(--dim)'}}>{g.strength}</td>
                    <td style={{color:(g.pending??0)>0?'var(--amber)':'var(--green)'}}>{g.reported}</td>
                    <td style={{color:'var(--green)'}}>{g.available}</td>
                    <td style={{color:totalLeave>0?'var(--amber)':'var(--dim)'}}>{totalLeave}</td>
                    <td style={{color:(g.attend_b??0)+(g.attend_c??0)>0?'var(--red)':'var(--dim)'}}>{(g.attend_b??0)+(g.attend_c??0)}</td>
                    <td>{g.reviewed?<span className="badge-green" style={{fontSize:9,padding:'2px 6px'}}>✓</span>:<span className="badge-dim" style={{fontSize:9,padding:'2px 6px'}}>—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* OVERSEAS PANEL */}
      {overseas.length > 0 && (
        <div className="we-card purple">
          <div className="we-clabel cl-purple">✈️ Overseas Personnel · {overseas.length}</div>
          {overseas.map(({user,leave}) => (
            <div className="we-row" key={user.id}>
              <div className="we-dot" style={{background:'var(--purple)'}} />
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500}}>{displayName(user)}</div>
                <div style={{fontSize:11,color:'var(--dim)'}}>
                  {leave.city?leave.city+', ':''}{leave.country} · Returns {formatDate(leave.end_date)}
                  {!leave.contactable && <span style={{color:'var(--red)',fontWeight:600,marginLeft:4}}>⚠ NOT CONTACTABLE</span>}
                </div>
                {leave.emergency_contact && <div style={{fontSize:10,color:'var(--dim)'}}>Emergency: {leave.emergency_contact}</div>}
              </div>
              <span className="we-chip" style={{background:leave.contactable?'var(--green-bg)':'var(--red-bg)',color:leave.contactable?'var(--green)':'var(--red)',fontSize:9}}>
                {leave.contactable?'✓ OK':'⚠ No Contact'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* RETURNING TODAY */}
      {returning.length > 0 && (
        <div className="we-card green">
          <div className="we-clabel cl-green">↩ Returning from Leave Today</div>
          {returning.map(({user,leave}) => (
            <div className="we-row" key={user.id}>
              <div className="we-dot" style={{background:'var(--green)'}} />
              <div style={{flex:1,fontSize:13,fontWeight:500}}>{displayName(user)}</div>
              <div style={{fontSize:11,color:'var(--dim)'}}>{leave.leave_type}</div>
            </div>
          ))}
        </div>
      )}

      {/* RETURNING TOMORROW */}
      {retTomorrow.length > 0 && (
        <div className="we-card amber">
          <div className="we-clabel cl-amber">📅 Returning from Leave Tomorrow</div>
          {retTomorrow.map(({user,leave}) => (
            <div className="we-row" key={user.id}>
              <div className="we-dot" style={{background:'var(--amber)'}} />
              <div style={{flex:1,fontSize:13}}>{displayName(user)}</div>
              <div style={{fontSize:11,color:'var(--dim)'}}>{leave.leave_type}</div>
            </div>
          ))}
        </div>
      )}

      {/* COMMAND ATTENTION */}
      <div className={`we-card ${attC>0||notContac.length>0?'red':retTomorrow.length>0||unreviewed.length>0?'amber':'green'}`}>
        <div className={`we-clabel ${attC>0||notContac.length>0?'cl-red':retTomorrow.length>0||unreviewed.length>0?'cl-amber':'cl-green'}`}>◆ Command Attention</div>

        {attC > 0 && <div className="we-alert"><div className="we-alert-dot" style={{background:'var(--red)'}}/><div><div className="we-alert-text"><strong>Attend C:</strong> {attC} case{attC>1?'s':''}</div></div></div>}
        {notContac.map(n=>(
          <div key={n.user.id} className="we-alert"><div className="we-alert-dot" style={{background:'var(--red)'}}/><div><div className="we-alert-text"><strong>Overseas Not Contactable:</strong> {displayName(n.user)}</div><div className="we-alert-sub">{n.leave.country} · Emergency: {n.leave.emergency_contact||'—'}</div></div></div>
        ))}
        {pending > 0 && <div className="we-alert"><div className="we-alert-dot" style={{background:pending>2?'var(--red)':'var(--amber)'}}/><div><div className="we-alert-text"><strong>{pending} personnel</strong> not yet reported</div></div></div>}
        {retTomorrow.length > 0 && <div className="we-alert"><div className="we-alert-dot" style={{background:'var(--amber)'}}/><div><div className="we-alert-text"><strong>{retTomorrow.length} personnel</strong> returning from leave tomorrow</div><div className="we-alert-sub">Ensure status submitted on return day</div></div></div>}
        {unreviewed.length > 0 && <div className="we-alert"><div className="we-alert-dot" style={{background:'var(--amber)'}}/><div><div className="we-alert-text"><strong>Groups pending review:</strong> {unreviewed.map(g=>g.group_name).join(', ')}</div></div></div>}
        {rate < 80 && <div className="we-alert"><div className="we-alert-dot" style={{background:'var(--amber)'}}/><div><div className="we-alert-text">Reporting rate below 80%</div><div className="we-alert-sub">Current: {rate}%</div></div></div>}
        {attC===0&&notContac.length===0&&pending===0&&unreviewed.length===0&&rate>=80 && (
          <div className="we-alert"><div className="we-alert-dot" style={{background:'var(--green)'}}/><div><div className="we-alert-text" style={{color:'var(--green)'}}>Formation fully reported and reviewed</div></div></div>
        )}
      </div>

      {/* FILTER + PERSONNEL */}
      <div className="we-section-hdr">Filter Personnel</div>
      <div className="we-filters">
        {['All','Military','Civilian','Available Now','Not Reported','Attend B','Attend C','Local Leave','Overseas'].map(f=>(
          <button key={f} className={`we-pill${filter===f?' on':''}`} onClick={()=>setFilter(f)}>{f}</button>
        ))}
      </div>
      <div className="we-card">
        <div className="we-clabel">{filter} · {filtered.length} personnel</div>
        {filtered.slice(0,25).map(u => {
          const sub = allSubs.find(s=>s.user_id===u.id)
          const grp = GROUPS.find(g=>g.id===u.group_id)?.short
          return (
            <div className="we-row" key={u.id}>
              <div className="we-dot" style={{background:sub?statusColor(sub.status):'var(--red)'}} />
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500}}>{displayName(u)}</div>
                <div style={{fontSize:10,color:'var(--dim)'}}>{grp} · {u.appointment}</div>
              </div>
              {sub
                ? <span className="we-chip" style={{background:statusColor(sub.status)+'18',color:statusColor(sub.status),border:`1px solid ${statusColor(sub.status)}33`,fontSize:10}}>{sub.is_auto?'🤖 ':''}{sub.status}</span>
                : <span className="we-chip" style={{background:'var(--red-bg)',color:'var(--red)',fontSize:10}}>Pending</span>
              }
            </div>
          )
        })}
        {filtered.length>25&&<div style={{fontSize:11,color:'var(--dim)',textAlign:'center',paddingTop:8}}>+{filtered.length-25} more</div>}
      </div>

      {/* 0830 REPORT */}
      <div className="we-card dark">
        <div className="we-clabel cl-amber">📋 0830 Daily Readiness Report</div>
        <div className="we-report">{reportText}</div>
        <div className="we-exportrow">
          <button className="we-exportbtn" onClick={()=>copyReport('plain')}>📋 Copy</button>
          <button className="we-exportbtn" onClick={()=>copyReport('whatsapp')}>💬 WhatsApp</button>
          <button className="we-exportbtn" onClick={()=>copyReport('email')}>📧 Email</button>
        </div>
      </div>

      {/* AI SUMMARY */}
      <div className="we-card">
        <div className="we-clabel cl-amber">⚡ AI Command Summary</div>
        {!aiShown && <div><div style={{fontSize:13,color:'var(--dim)',marginBottom:12,lineHeight:1.5}}>Generate an AI-written command-level readiness summary.</div><button className="btn btn-primary" onClick={generateAI}>Generate Summary</button></div>}
        {aiLoading && <div className="we-ai-loading"><div className="we-ai-dot"/><div className="we-ai-dot"/><div className="we-ai-dot"/><span>Generating…</span></div>}
        {aiText && <div className="we-ai-text">{aiText}</div>}
      </div>

      {/* HISTORICAL EXPORT */}
      <div className="we-card dark">
        <div className="we-clabel cl-amber">📥 Historical Records Export</div>
        <div style={{fontSize:12,color:'var(--dim)',marginBottom:12,lineHeight:1.5}}>
          Download a CSV of daily formation statistics for any date range. Includes strength, reporting rate, availability breakdown, leave counts, and medical status.
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:12}}>
          <div style={{display:'flex',flexDirection:'column',gap:4,flex:1,minWidth:120}}>
            <label style={{fontSize:10,color:'var(--dim)',fontFamily:'var(--mono)',letterSpacing:'0.05em'}}>FROM</label>
            <input
              type="date"
              value={histFrom}
              onChange={e=>setHistFrom(e.target.value)}
              max={histTo}
              style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:13,padding:'6px 10px',fontFamily:'var(--mono)',width:'100%'}}
            />
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4,flex:1,minWidth:120}}>
            <label style={{fontSize:10,color:'var(--dim)',fontFamily:'var(--mono)',letterSpacing:'0.05em'}}>TO</label>
            <input
              type="date"
              value={histTo}
              onChange={e=>setHistTo(e.target.value)}
              min={histFrom}
              max={new Date().toISOString().slice(0,10)}
              style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:13,padding:'6px 10px',fontFamily:'var(--mono)',width:'100%'}}
            />
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={downloadHistoricalCSV}
          disabled={histLoading}
          style={{width:'100%'}}
        >
          {histLoading ? '⏳ Exporting…' : '⬇ Download CSV'}
        </button>
        <div style={{fontSize:10,color:'var(--faint)',marginTop:8,fontFamily:'var(--mono)'}}>
          RESTRICTED · Formation use only · Do not share externally
        </div>
      </div>
    </div>
  )
}
