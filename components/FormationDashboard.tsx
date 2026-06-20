'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { GroupStats, User, LeavePeriod } from '@/types/database'
import { displayName, GROUPS, todayStr, tomorrowStr, formatDate, statusColor, AVAILABLE_STATUSES, SHIFT_STATUSES, LEAVE_STATUSES, medicalDurationLabel, WEEKEND_STATUS, PUBLIC_HOLIDAY_STATUS, MALAYSIA_STATUS, STANDDOWN_STATUSES, isStandDown, isPastCutoff, dayOfWeek } from '@/lib/constants'

export default function FormationDashboard({ user, showToast }: { user: User; showToast: (m:string)=>void }) {
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
  const [histMode, setHistMode] = useState<'summary'|'detailed'>('summary')
  // Snapshot state
  const [snapshot,  setSnapshot]  = useState<{id:string;captured_at:string;report_text:string}|null>(null)
  const [snapView,  setSnapView]  = useState<'live'|'snapshot'>('live')
  const reportRef = useRef('')  // keeps latest report text for snapshot capture
  const supabase = createClient()
  const today    = todayStr()
  const tomorrow = tomorrowStr()

  useEffect(() => {
    loadData()
    loadSnapshot()
  }, [])

  // Auto-capture snapshot after data loads, if past 0830 and none exists today
  useEffect(() => {
    if (!loading) captureSnapshotIfNeeded()
  }, [loading])

  const loadData = async () => {
    setLoading(true)
    // Formation stats via DB function
    const { data: formStats } = await supabase.rpc('get_formation_readiness', { target_date: today })

    // All users and today's subs for filter panel
    const [{ data: users }, { data: subs }] = await Promise.all([
      supabase.from('users').select('*').eq('is_active',true).neq('role','admin').order('full_name'),
      supabase.from('daily_submissions').select('*, covering_person:covering_person_id(id, full_name, rank, title, personnel_type)').eq('submission_date',today),
    ])

    // Leave intelligence
    const { data: allLeaves } = await supabase
      .from('leave_periods')
      .select('*, user:users(*), covering_person:covering_person_id(id, full_name, rank, title, personnel_type)')
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

  const loadSnapshot = async () => {
    const { data } = await supabase
      .from('formation_snapshots')
      .select('id, captured_at, report_text')
      .eq('snapshot_date', today)
      .single()
    if (data) setSnapshot(data)
  }

  const captureSnapshotIfNeeded = async () => {
    if (!isPastCutoff()) return
    const { data: existing } = await supabase
      .from('formation_snapshots')
      .select('id, captured_at, report_text')
      .eq('snapshot_date', today)
      .single()
    if (existing) { setSnapshot(existing); return }
    // First AC3/admin to open the dashboard after 0830 — capture the state
    const { data: saved } = await supabase
      .from('formation_snapshots')
      .insert({ snapshot_date: today, captured_at: new Date().toISOString(), report_text: reportRef.current })
      .select('id, captured_at, report_text')
      .single()
    if (saved) setSnapshot(saved)
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
  // Shift counts from allSubs (client-side, not in RPC)
  const dayShift     = allSubs.filter(s=>s.status==='Day Shift').length
  const nightShift   = allSubs.filter(s=>s.status==='Night Shift').length
  const restDay      = allSubs.filter(s=>s.status==='Rest Day').length
  const totalShift   = dayShift + nightShift + restDay
  // Stand-down counts (weekends + public holidays)
  const weekendCount  = allSubs.filter(s=>s.status===WEEKEND_STATUS).length
  const phCount       = allSubs.filter(s=>s.status===PUBLIC_HOLIDAY_STATUS).length
  const malaysiaCount = allSubs.filter(s=>s.status===MALAYSIA_STATUS).length
  const standDownTotal = weekendCount + phCount
  const isStanddown   = isStandDown()
  const malaysiaUsers = allSubs.filter(s=>s.status===MALAYSIA_STATUS).map(s=>allUsers.find(u=>u.id===s.user_id)).filter(Boolean) as User[]

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
    ...(totalShift>0?[`Day Shift       : ${dayShift}`,`Night Shift     : ${nightShift}`,`Rest Day        : ${restDay}`]:[]),
    ...(weekendCount>0?[`Weekend Stand-dn: ${weekendCount}`]:[]),
    ...(phCount>0?[`Public Holiday  : ${phCount}`]:[]),
    ...(malaysiaCount>0?[`Malaysia (Infmd): ${malaysiaCount}`]:[]),
    '─────────────────────────',
    ...(overseas.length>0?['Overseas Personnel:',...overseas.map(o=>{
      const cover = (o.leave as any).covering_person ? ` / Covered by: ${displayName((o.leave as any).covering_person)}` : ''
      return `  · ${displayName(o.user)} [${o.leave.country}]${!o.leave.contactable?' ⚠ NOT CONTACTABLE':''}${cover}`
    })]:[]),
    ...(returning.length>0?['Returning Today:',...returning.map(r=>`  · ${displayName(r.user)}`)]:[]),
    ...(retTomorrow.length>0?['Returning Tomorrow:',...retTomorrow.map(r=>`  · ${displayName(r.user)}`)]:[]),
    '─────────────────────────','Command Attention:',
    // Attend C per-person lines added below
    ...(notContac.length>0?[`  ⚠ [RED] ${notContac.length} overseas not contactable: ${notContac.map(n=>displayName(n.user)).join(', ')}`]:[]),
    ...(pending>0?[`  ⚠ ${pending} personnel not reported`]:[]),
    ...(retTomorrow.length>0?[`  ℹ [AMBER] ${retTomorrow.length} returning tomorrow`]:[]),
    ...(unreviewed.length>0?[`  ℹ [AMBER] Groups pending review: ${unreviewed.map(g=>g.group_short).join(', ')}`]:[]),
    ...(attC > 0 ? allSubs.filter((s:any)=>s.status==='Attend C').map((s:any)=>{
      const u = allUsers.find(u=>u.id===s.user_id)
      const med = s.medical_end_date ? ` [MC until ${s.medical_end_date}]` : ''
      return `  ⚠ [RED] Attend C: ${u?displayName(u):'Unknown'}${med}`
    }) : []),
    ...(malaysiaCount>0?[`  ℹ ${malaysiaCount} in Malaysia (no leave reqd): ${malaysiaUsers.map(u=>displayName(u)).join(', ')}`]:[]),
    ...(attC===0&&notContac.length===0&&pending===0&&unreviewed.length===0&&malaysiaCount===0?['  ✓ Nil. Formation fully reported and reviewed.']:[]),
    '─────────────────────────','WITHOUT EQUAL',
  ].join('\n')

  const reportText = buildReport()
  reportRef.current = reportText  // keep ref in sync for snapshot capture


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

      // Fetch all submissions in range with user details
      const { data: allHistSubs } = await supabase
        .from('daily_submissions')
        .select('submission_date, status, user_id, is_auto, is_amended, submitted_at, remarks, user:users(full_name, rank, title, personnel_type, group_id, appointment)')
        .gte('submission_date', histFrom)
        .lte('submission_date', histTo)
        .order('submission_date', { ascending: true })

      const subs = allHistSubs ?? []

      let csv = ''

      if (histMode === 'detailed') {
        // One row per person per day
        // Fetch all active users for "not reported" rows
        const { data: activeUsers } = await supabase
          .from('users').select('id, full_name, rank, title, personnel_type, group_id, appointment')
          .eq('is_active', true).neq('role', 'admin').order('full_name')
        const users = activeUsers ?? []

        const header = ['Date','Day','Name','Personnel_Type','Rank_Title','Group','Appointment','Status','Time_Submitted','Auto','Amended','Remarks']
        const rows: string[][] = []

        for (const date of dates) {
          const daySubs = subs.filter(s => s.submission_date === date)
          const dow = dayOfWeek(date)
          for (const u of users) {
            const sub = daySubs.find(s => s.user_id === u.id)
            const grp = GROUPS.find(g => g.id === u.group_id)?.short ?? ''
            const rankTitle = u.personnel_type === 'Military' ? (u.rank ?? '') : (u.title ?? '')
            if (sub) {
              rows.push([
                date,
                dow,
                u.full_name,
                u.personnel_type,
                rankTitle,
                grp,
                u.appointment ?? '',
                sub.status,
                new Date(sub.submitted_at).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit',hour12:false}),
                sub.is_auto ? 'Yes' : 'No',
                sub.is_amended ? 'Yes' : 'No',
                (sub.remarks ?? '').replace(/,/g,' ')
              ])
            } else {
              rows.push([date, dow, u.full_name, u.personnel_type, rankTitle, grp, u.appointment ?? '', 'Not Reported', '', 'No', 'No', ''])
            }
          }
        }
        csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')

      } else {
        // Summary: aggregate counts per date
        const { data: activeUsers } = await supabase.from('users').select('id').eq('is_active',true).neq('role','admin')
        const totalStrength = activeUsers?.length ?? 0

        const header = ['Date','Day','Strength','Reported','Pending','Rate_%','Available','Attend_B','Attend_C','Local_Leave','Overseas_Leave','Time_Off','Duty_Course']
        const rows = dates.map(date => {
          const day = subs.filter(s => s.submission_date === date)
          const reported   = day.length
          const pending    = totalStrength - reported
          const available  = day.filter(s => ['Available','Work From Home'].includes(s.status)).length
          const attendB    = day.filter(s => s.status === 'Attend B').length
          const attendC    = day.filter(s => s.status === 'Attend C').length
          const localLeave = day.filter(s => s.status === 'Local Leave').length
          const overseasLv = day.filter(s => s.status === 'Overseas Leave').length
          const timeOff    = day.filter(s => s.status === 'Time Off').length
          const duty       = day.filter(s => ['Duty','Course'].includes(s.status)).length
          const rate       = totalStrength ? Math.round(reported / totalStrength * 100) : 0
          return [date, dayOfWeek(date), totalStrength, reported, pending, rate, available, attendB, attendC, localLeave, overseasLv, timeOff, duty]
        })
        csv = [header, ...rows].map(r => r.join(',')).join('\n')
      }

      const blob = new Blob([csv], { type: 'text/csv' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `WITHOUT_EQUAL_${histMode === 'detailed' ? 'Detailed' : 'Summary'}_${histFrom}_to_${histTo}.csv`
      a.click()
      URL.revokeObjectURL(url)
      showToast(`${histMode === 'detailed' ? 'Detailed' : 'Summary'} CSV downloaded ✓`)
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

      {/* LIVE / SNAPSHOT TOGGLE */}
      <div style={{display:'flex',gap:6,marginBottom:12}}>
        <button className={`we-pill${snapView==='live'?' on':''}`} onClick={()=>setSnapView('live')}>
          📡 Live
        </button>
        <button
          className={`we-pill${snapView==='snapshot'?' on':''}`}
          onClick={()=>{ if(snapshot) setSnapView('snapshot') }}
          style={{opacity:snapshot?1:0.4,cursor:snapshot?'pointer':'default'}}
        >
          📸 0830 Snapshot{!snapshot ? ' (pending)' : ''}
        </button>
        {snapshot && (
          <span style={{fontSize:10,color:'var(--dim)',alignSelf:'center',fontFamily:'var(--mono)',marginLeft:2}}>
            {new Date(snapshot.captured_at).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit',hour12:false})}H
          </span>
        )}
      </div>

      {/* SNAPSHOT VIEW */}
      {snapView === 'snapshot' && snapshot && (
        <div>
          <div className="we-card amber" style={{marginBottom:10,padding:'10px 14px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{fontSize:18}}>📸</div>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:'var(--amber)'}}>0830 Snapshot · {today}</div>
                <div style={{fontSize:10,color:'var(--dim)',marginTop:2}}>
                  Captured at {new Date(snapshot.captured_at).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit',hour12:false})}H — reflects formation state at that moment
                </div>
              </div>
            </div>
          </div>
          <div className="we-card" style={{marginBottom:10}}>
            <pre style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text)',whiteSpace:'pre-wrap',lineHeight:1.7,margin:0}}>
              {snapshot.report_text}
            </pre>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:16}}>
            <button className="btn btn-secondary" style={{flex:1}} onClick={()=>navigator.clipboard.writeText(snapshot.report_text).then(()=>showToast('Snapshot copied ✓'))}>
              📋 Copy
            </button>
            <button className="btn btn-secondary" style={{flex:1}} onClick={()=>navigator.clipboard.writeText(snapshot.report_text.replace(/─+/g,'---')).then(()=>showToast('Copied (WhatsApp) ✓'))}>
              💬 WhatsApp
            </button>
          </div>
          <div style={{textAlign:'center',marginBottom:16}}>
            <button onClick={()=>setSnapView('live')} style={{fontSize:12,color:'var(--dim)',background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'7px 18px',cursor:'pointer',fontFamily:'var(--sans)'}}>
              Switch to Live View →
            </button>
          </div>
        </div>
      )}

      {snapView === 'live' && <div>

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
        {(standDownTotal > 0 || malaysiaCount > 0) && (
          <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)',display:'flex',flexWrap:'wrap',gap:12,alignItems:'center'}}>
            {weekendCount > 0 && <span style={{fontSize:11,color:'var(--dim)'}}>🏖️ Weekend: <strong>{weekendCount}</strong></span>}
            {phCount > 0      && <span style={{fontSize:11,color:'var(--green)'}}>🎉 Public Holiday: <strong>{phCount}</strong></span>}
            {malaysiaCount > 0 && <span style={{fontSize:11,color:'var(--teal,#0891B2)'}}>🇲🇾 Malaysia: <strong>{malaysiaCount}</strong></span>}
          </div>
        )}
        {totalShift > 0 && (
          <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)'}}>
            <div style={{fontSize:10,color:'var(--teal,#0891B2)',fontFamily:'var(--mono)',letterSpacing:'0.08em',marginBottom:6}}>SHIFT WORKERS · {totalShift}</div>
            <div className="g3">
              <div className="we-stat"><div className={`we-statval ${dayShift>0?'sv-teal':'sv-dim'}`} style={{fontSize:18}}>{dayShift}</div><div className="we-statlbl">Day Shift</div></div>
              <div className="we-stat"><div className={`we-statval ${nightShift>0?'sv-teal':'sv-dim'}`} style={{fontSize:18}}>{nightShift}</div><div className="we-statlbl">Night Shift</div></div>
              <div className="we-stat"><div className={`we-statval ${restDay>0?'sv-teal':'sv-dim'}`} style={{fontSize:18}}>{restDay}</div><div className="we-statlbl">Rest Day</div></div>
            </div>
          </div>
        )}
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
                {(leave as any).covering_person && (
                  <div style={{fontSize:11,marginTop:2}}>
                    <span style={{color:'var(--teal,#0891B2)'}}>👤 Covered by: </span>
                    <span style={{fontWeight:600}}>{displayName((leave as any).covering_person)}</span>
                  </div>
                )}
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

      {/* MALAYSIA */}
      {malaysiaUsers.length > 0 && (
        <div className="we-card" style={{border:'1px solid rgba(8,145,178,0.25)',background:'rgba(8,145,178,0.04)'}}>
          <div className="we-clabel" style={{color:'var(--teal,#0891B2)'}}>🇲🇾 In Malaysia (Informed) — No Leave Required</div>
          {malaysiaUsers.map(u => (
            <div className="we-row" key={u.id}>
              <div style={{fontSize:18,flexShrink:0}}>🇲🇾</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500}}>{displayName(u)}</div>
                <div style={{fontSize:10,color:'var(--dim)'}}>Weekend/PH trip · Commander informed</div>
              </div>
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

        {attC > 0 && (
          <div>
            {allSubs.filter(s=>s.status==='Attend C').map((s:any) => {
              const u = allUsers.find(u=>u.id===s.user_id)
              if (!u) return null
              return (
                <div key={s.user_id} className="we-alert">
                  <div className="we-alert-dot" style={{background:'var(--red)'}}/>
                  <div>
                    <div className="we-alert-text"><strong>Attend C:</strong> {displayName(u)}</div>
                    {s.medical_end_date && <div className="we-alert-sub">🏥 {medicalDurationLabel(s.medical_end_date)}</div>}
                    {s.remarks && <div className="we-alert-sub">{s.remarks}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {notContac.map(n=>(
          <div key={n.user.id} className="we-alert"><div className="we-alert-dot" style={{background:'var(--red)'}}/><div><div className="we-alert-text"><strong>Overseas Not Contactable:</strong> {displayName(n.user)}</div><div className="we-alert-sub">{n.leave.country} · Emergency: {n.leave.emergency_contact||'—'}</div></div></div>
        ))}
        {pending > 0 && <div className="we-alert"><div className="we-alert-dot" style={{background:pending>2?'var(--red)':'var(--amber)'}}/><div><div className="we-alert-text"><strong>{pending} personnel</strong> not yet reported</div></div></div>}
        {retTomorrow.length > 0 && <div className="we-alert"><div className="we-alert-dot" style={{background:'var(--amber)'}}/><div><div className="we-alert-text"><strong>{retTomorrow.length} personnel</strong> returning from leave tomorrow</div><div className="we-alert-sub">Ensure status submitted on return day</div></div></div>}
        {unreviewed.length > 0 && <div className="we-alert"><div className="we-alert-dot" style={{background:'var(--amber)'}}/><div><div className="we-alert-text"><strong>Groups pending review:</strong> {unreviewed.map(g=>g.group_name).join(', ')}</div></div></div>}
        {rate < 80 && <div className="we-alert"><div className="we-alert-dot" style={{background:'var(--amber)'}}/><div><div className="we-alert-text">Reporting rate below 80%</div><div className="we-alert-sub">Current: {rate}%</div></div></div>}
        {malaysiaCount > 0 && (
          <div className="we-alert"><div className="we-alert-dot" style={{background:'var(--teal,#0891B2)'}}/><div>
            <div className="we-alert-text" style={{color:'var(--teal,#0891B2)'}}>🇲🇾 {malaysiaCount} in Malaysia (no leave reqd)</div>
            <div className="we-alert-sub">{malaysiaUsers.map(u=>displayName(u)).join(' · ')}</div>
          </div></div>
        )}
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
              {sub ? (
                <div style={{textAlign:'right'}}>
                  <span className="we-chip" style={{background:statusColor(sub.status)+'18',color:statusColor(sub.status),border:`1px solid ${statusColor(sub.status)}33`,fontSize:10}}>{sub.is_auto?'🤖 ':''}{sub.status}</span>
                  {LEAVE_STATUSES.includes(sub.status) && (sub as any).covering_person && (
                    <div style={{fontSize:9,color:'var(--teal,#0891B2)',marginTop:2}}>
                      👤 {(sub as any).covering_person.personnel_type==='Military'?(sub as any).covering_person.rank:(sub as any).covering_person.title} {(sub as any).covering_person.full_name}
                    </div>
                  )}
                </div>
              ) : (
                <span className="we-chip" style={{background:'var(--red-bg)',color:'var(--red)',fontSize:10}}>Pending</span>
              )}
            </div>
          )
        })}
        {filtered.length>25&&<div style={{fontSize:11,color:'var(--dim)',textAlign:'center',paddingTop:8}}>+{filtered.length-25} more</div>}
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

        {/* Mode toggle */}
        <div style={{display:'flex',gap:6,marginBottom:12}}>
          {(['summary','detailed'] as const).map(m => (
            <button
              key={m}
              onClick={()=>setHistMode(m)}
              style={{
                flex:1,fontSize:12,padding:'6px 0',borderRadius:6,cursor:'pointer',fontWeight:600,
                border:`1px solid ${histMode===m?'var(--amber)':'var(--border)'}`,
                background:histMode===m?'rgba(232,160,32,0.12)':'var(--surface)',
                color:histMode===m?'var(--amber)':'var(--dim)'
              }}
            >
              {m === 'summary' ? '📊 Summary' : '👥 Detailed'}
            </button>
          ))}
        </div>
        <div style={{fontSize:12,color:'var(--dim)',marginBottom:12,lineHeight:1.5}}>
          {histMode === 'summary'
            ? 'One row per day — strength, reporting rate, and status count totals.'
            : 'One row per person per day — name, rank, group, and individual status. Includes "Not Reported" entries.'}
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

    </div>} {/* end snapView === 'live' */}
    </div>
  )
}
