'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { User, DailySubmission, LeavePeriod, GroupReview } from '@/types/database'
import { displayName, lastName, statusColor, todayStr, tomorrowStr, formatDate, AVAILABLE_STATUSES, medicalDurationLabel, LEAVE_STATUSES, MALAYSIA_STATUS, STANDDOWN_STATUSES, isStandDown, isPastCutoff, GROUPS } from '@/lib/constants'

interface PersonnelRow {
  user: User
  sub: DailySubmission | null
  leave: LeavePeriod | null
}

export default function GroupDashboard({ user, showToast }: { user: User; showToast: (m:string)=>void }) {
  const [rows,    setRows]    = useState<PersonnelRow[]>([])
  const [review,  setReview]  = useState<GroupReview|null>(null)
  const [loading, setLoading] = useState(true)
  const [snapshot,  setSnapshot]  = useState<{id:string;captured_at:string;report_text:string}|null>(null)
  const [snapView,  setSnapView]  = useState<'live'|'snapshot'>('live')
  const [schedEdit, setSchedEdit] = useState<User|null>(null)
  const reportRef = useRef('')
  const supabase = createClient()
  const today    = todayStr()
  const tomorrow = tomorrowStr()

  useEffect(() => {
    loadData()
    loadSnapshot()
  }, [])

  useEffect(() => {
    if (!loading) captureSnapshotIfNeeded()
  }, [loading])

  const loadData = async () => {
    setLoading(true)

    const [{ data: members }, { data: subs }, { data: leaves }, { data: rev }] = await Promise.all([
      supabase.from('users').select('*').eq('group_id', user.group_id).eq('is_active', true).neq('role','admin').order('full_name'),
      supabase.from('daily_submissions').select('*').eq('submission_date', today).in('user_id', []),
      supabase.from('leave_periods').select('*, covering_person:covering_person_id(id, full_name, rank, title, personnel_type)').eq('status','approved').lte('start_date',today).gte('end_date',today),
      supabase.from('group_reviews').select('*, reviewer:users(*)').eq('group_id', user.group_id).eq('review_date', today).single(),
    ])

    const memberIds = (members ?? []).map(m => m.id)
    const { data: todaySubs } = await supabase
      .from('daily_submissions')
      .select('*, covering_person:covering_person_id(id, full_name, rank, title, personnel_type)')
      .eq('submission_date', today).in('user_id', memberIds)

    const combined: PersonnelRow[] = (members ?? []).map(m => ({
      user: m,
      sub:  (todaySubs ?? []).find(s => s.user_id === m.id) ?? null,
      leave:(leaves ?? []).find(l => l.user_id === m.id) ?? null,
    }))

    setRows(combined)
    setReview(rev)
    setLoading(false)
  }

  const loadSnapshot = async () => {
    const { data } = await supabase
      .from('group_snapshots')
      .select('id, captured_at, report_text')
      .eq('snapshot_date', today)
      .eq('group_id', user.group_id)
      .single()
    if (data) setSnapshot(data)
  }

  const captureSnapshotIfNeeded = async () => {
    if (!isPastCutoff()) return
    const { data: existing } = await supabase
      .from('group_snapshots')
      .select('id, captured_at, report_text')
      .eq('snapshot_date', today)
      .eq('group_id', user.group_id)
      .single()
    if (existing) { setSnapshot(existing); return }
    const { data: saved } = await supabase
      .from('group_snapshots')
      .insert({ snapshot_date: today, group_id: user.group_id, captured_at: new Date().toISOString(), report_text: reportRef.current })
      .select('id, captured_at, report_text')
      .single()
    if (saved) setSnapshot(saved)
  }

  const doReview = async () => {
    const { data, error } = await supabase
      .from('group_reviews')
      .upsert({
        group_id: user.group_id,
        review_date: today,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      }, { onConflict: 'group_id,review_date' })
      .select('*, reviewer:users(*)').single()
    if (!error) { setReview(data); showToast('Group marked Reviewed ✓') }
  }

  const saveSchedule = async (targetUser: User, schedule: string) => {
    const { error } = await supabase.rpc('set_work_schedule', {
      target_user_id: targetUser.id,
      new_schedule: schedule,
    })
    if (error) { showToast('Error: ' + error.message); return }
    // Update local state immediately
    setRows(prev => prev.map(r =>
      r.user.id === targetUser.id ? { ...r, user: { ...r.user, work_schedule: schedule } as User } : r
    ))
    showToast(`${lastName(targetUser)} → ${schedule === 'shift' ? 'Shift / 24-7' : 'Mon–Fri'} ✓`)
    setSchedEdit(null)
  }

  if (loading) return <div style={{padding:24,color:'var(--dim)',fontSize:13}}>Loading…</div>

  const standDown      = isStandDown()
  const activeRows     = standDown ? rows.filter(r => (r.user as any).work_schedule === 'shift' || (r.sub && !STANDDOWN_STATUSES.includes(r.sub.status))) : rows
  const strength       = standDown ? rows.filter(r => (r.user as any).work_schedule === 'shift').length : rows.length
  const reported       = standDown ? activeRows.filter(r => r.sub && !STANDDOWN_STATUSES.includes(r.sub.status)).length : rows.filter(r => r.sub !== null).length
  const pending        = strength - reported
  const standDownCount = rows.filter(r => r.sub && STANDDOWN_STATUSES.includes(r.sub.status) && r.sub.status !== MALAYSIA_STATUS).length
  const malaysiaRows   = rows.filter(r => r.sub?.status === MALAYSIA_STATUS)
  const available      = rows.filter(r => r.sub && AVAILABLE_STATUSES.includes(r.sub.status)).length
  const attendB        = rows.filter(r => r.sub?.status === 'Attend B').length
  const attendC        = rows.filter(r => r.sub?.status === 'Attend C').length
  const localLeave     = rows.filter(r => r.sub?.status === 'Local Leave').length
  const overseasLeave  = rows.filter(r => r.sub?.status === 'Overseas Leave').length
  const timeOff        = rows.filter(r => r.sub?.status === 'Time Off').length
  const duty           = rows.filter(r => r.sub && ['Duty','Course','Exercise','Official Travel'].includes(r.sub.status)).length
  const rate           = strength ? Math.round(reported/strength*100) : 0
  const notReported    = standDown
    ? rows.filter(r => !r.sub && (r.user as any).work_schedule === 'shift')
    : rows.filter(r => !r.sub)
  const attendCRows    = rows.filter(r => r.sub?.status === 'Attend C')
  const attendBRows    = rows.filter(r => r.sub?.status === 'Attend B')
  const overseasRows   = rows.filter(r => r.sub?.status === 'Overseas Leave')
  const grpName        = GROUPS.find(g => g.id === user.group_id)?.name ?? `Grp ${user.group_id}`

  // Build group report text (used for snapshot)
  const reportText = [
    'WITHOUT EQUAL',
    `${grpName} Group Daily Status`,
    `${new Date(today + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'short' })}, ${today.slice(8)}-${today.slice(5,7)}-${today.slice(2,4)} · 0830H`,
    '─────────────────────────',
    `Strength        : ${strength}`,
    `Reported        : ${reported}`,
    `Pending         : ${pending}`,
    '─────────────────────────',
    `Available       : ${available}`,
    `Attend B        : ${attendB}`,
    `Attend C        : ${attendC}`,
    `Local Leave     : ${localLeave}`,
    `Overseas Leave  : ${overseasLeave}`,
    `Time Off        : ${timeOff}`,
    `Duty / Course   : ${duty}`,
    ...(standDownCount > 0 ? [`Stand-Down      : ${standDownCount}`] : []),
    ...(malaysiaRows.length > 0 ? [`Malaysia (Infmd): ${malaysiaRows.length}`] : []),
    '─────────────────────────',
    ...(notReported.length > 0
      ? [`Not Reported    : ${notReported.map(r => lastName(r.user)).join(', ')}`]
      : ['Not Reported    : Nil']),
    ...(attendCRows.length > 0
      ? attendCRows.map(r => `  ⚠ Attend C: ${displayName(r.user)}${r.sub?.medical_end_date ? ` [MC until ${r.sub.medical_end_date}]` : ''}`)
      : []),
    ...(overseasRows.length > 0
      ? overseasRows.map(r => `  ✈ Overseas: ${displayName(r.user)}${r.leave ? ` [${r.leave.country}${!r.leave.contactable ? ' · NO CONTACT' : ''}]` : ''}`)
      : []),
    ...(malaysiaRows.length > 0
      ? [`  🇲🇾 Malaysia: ${malaysiaRows.map(r => displayName(r.user)).join(', ')}`]
      : []),
    '─────────────────────────',
    'WITHOUT EQUAL',
  ].join('\n')

  reportRef.current = reportText

  return (
    <div>
      {/* LIVE / SNAPSHOT TOGGLE */}
      <div style={{display:'flex',gap:6,marginBottom:12,alignItems:'center'}}>
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
        {snapshot && snapView === 'live' && (
          <span style={{fontSize:10,color:'var(--dim)',fontFamily:'var(--mono)'}}>
            CAA {new Date(snapshot.captured_at).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit',hour12:false})}H
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
                <div style={{fontSize:12,fontWeight:700,color:'var(--amber)'}}>0830 Snapshot · {grpName} · {today.slice(8)}-{today.slice(5,7)}-{today.slice(2,4)}</div>
                <div style={{fontSize:10,color:'var(--dim)',marginTop:2}}>
                  CAA {new Date(snapshot.captured_at).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit',hour12:false})}H — reflects group state at that moment
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
        {/* STRENGTH SUMMARY */}
        <div className="we-card">
          <div className="we-clabel">Group Readiness · {today}</div>
          <div className="g3" style={{marginBottom:10}}>
            <div className="we-stat"><div className="we-statval sv-white">{strength}</div><div className="we-statlbl">Total</div></div>
            <div className="we-stat"><div className={`we-statval ${pending>0?'sv-amber':'sv-green'}`}>{reported}</div><div className="we-statlbl">Reported</div></div>
            <div className="we-stat"><div className={`we-statval ${pending>0?'sv-red':'sv-dim'}`}>{pending}</div><div className="we-statlbl">Pending</div></div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--dim)',marginBottom:4}}>
            <span>Reporting rate</span>
            <span style={{color:rate>=90?'var(--green)':rate>=70?'var(--amber)':'var(--red)',fontWeight:700}}>{rate}%</span>
          </div>
          <div className="we-prog-wrap"><div className="we-prog-fill" style={{width:`${rate}%`,background:rate>=90?'var(--green)':rate>=70?'var(--amber)':'var(--red)'}}/></div>
        </div>

        {/* AVAILABILITY */}
        <div className="we-card">
          <div className="we-clabel">Availability</div>
          <div className="g4">
            <div className="we-stat"><div className="we-statval sv-green">{available}</div><div className="we-statlbl">Avail</div></div>
            <div className="we-stat"><div className={`we-statval ${attendB>0?'sv-red':'sv-dim'}`}>{attendB}</div><div className="we-statlbl">Att B</div></div>
            <div className="we-stat"><div className={`we-statval ${attendC>0?'sv-red':'sv-dim'}`}>{attendC}</div><div className="we-statlbl">Att C</div></div>
            <div className="we-stat"><div className="we-statval sv-blue">{duty}</div><div className="we-statlbl">Duty</div></div>
          </div>
          <div className="g3" style={{marginTop:6}}>
            <div className="we-stat"><div className={`we-statval ${localLeave>0?'sv-amber':'sv-dim'}`} style={{fontSize:18}}>{localLeave}</div><div className="we-statlbl">Local Lv</div></div>
            <div className="we-stat"><div className={`we-statval ${overseasLeave>0?'sv-purple':'sv-dim'}`} style={{fontSize:18}}>{overseasLeave}</div><div className="we-statlbl">Overseas</div></div>
            <div className="we-stat"><div className={`we-statval ${timeOff>0?'sv-amber':'sv-dim'}`} style={{fontSize:18}}>{timeOff}</div><div className="we-statlbl">Time Off</div></div>
          </div>
          {(standDownCount > 0 || malaysiaRows.length > 0) && (
            <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              {standDownCount > 0 && <span style={{fontSize:11,color:'var(--dim)'}}>🏖️ Stand-down: <strong>{standDownCount}</strong></span>}
              {malaysiaRows.length > 0 && <span style={{fontSize:11,color:'var(--teal,#0891B2)'}}>🇲🇾 Malaysia: <strong>{malaysiaRows.length}</strong></span>}
            </div>
          )}
        </div>

        {/* PERSONNEL TABLE */}
        <div className="we-card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div className="we-clabel" style={{marginBottom:0}}>Personnel Status</div>
            <span style={{fontSize:10,color:'var(--dim)'}}>Tap name to set schedule</span>
          </div>
          <div className="we-tablewrap">
            <table className="we-table">
              <thead><tr><th>Name</th><th>Status</th><th>Time</th></tr></thead>
              <tbody>
                {rows.map(r => {
                  const isAuto = r.sub?.is_auto
                  const sched  = (r.user as any).work_schedule ?? 'weekdays'
                  return (
                    <tr key={r.user.id}>
                      <td style={{cursor:'pointer'}} onClick={()=>setSchedEdit(r.user)}>
                        <div style={{fontWeight:600,fontSize:12}}>{lastName(r.user)}</div>
                        <div style={{fontSize:10,color:sched==='shift'?'var(--teal,#0891B2)':'var(--dim)'}}>
                          {sched==='shift'?'🔄 Shift':'📅 Mon–Fri'}
                        </div>
                      </td>
                      <td style={{textAlign:'left'}}>
                        {r.sub ? (
                          <div>
                            <span className="we-chip" style={{background:statusColor(r.sub.status)+'18',color:statusColor(r.sub.status),border:`1px solid ${statusColor(r.sub.status)}33`,fontSize:10}}>
                              {isAuto ? '🤖 ' : ''}{r.sub.status}
                            </span>
                            {LEAVE_STATUSES.includes(r.sub.status) && (() => {
                              const cp = (r.sub as any).covering_person ?? (r.leave as any)?.covering_person
                              return cp ? (
                                <div style={{fontSize:9,color:'var(--teal,#0891B2)',marginTop:3,whiteSpace:'nowrap'}}>
                                  👤 {cp.personnel_type==='Military'?cp.rank:cp.title} {cp.full_name}
                                </div>
                              ) : null
                            })()}
                          </div>
                        ) : (
                          <span className="we-chip" style={{background:'var(--red-bg)',color:'var(--red)',border:'1px solid rgba(220,53,69,.2)',fontSize:10}}>Pending</span>
                        )}
                      </td>
                      <td style={{color:'var(--dim)',fontSize:10}}>
                        {r.sub ? new Date(r.sub.submitted_at).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit',hour12:false})+'H' : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ATTEND C */}
        {attendCRows.length > 0 && (
          <div className="we-card red">
            <div className="we-clabel cl-red">⚠ Attend C Cases</div>
            {attendCRows.map(r => (
              <div className="we-row" key={r.user.id}>
                <div className="we-dot" style={{background:'var(--red)'}} />
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500}}>{displayName(r.user)}</div>
                  {r.sub?.medical_end_date && (
                    <div style={{fontSize:11,color:'var(--red)',fontWeight:600,marginTop:2}}>
                      🏥 {medicalDurationLabel(r.sub.medical_end_date)}
                    </div>
                  )}
                  {r.sub?.remarks && <div style={{fontSize:11,color:'var(--dim)',marginTop:2}}>{r.sub.remarks}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* OVERSEAS */}
        {overseasRows.length > 0 && (
          <div className="we-card purple">
            <div className="we-clabel cl-purple">✈️ Overseas Personnel</div>
            {overseasRows.map(r => {
              const leave = r.leave
              return (
                <div className="we-row" key={r.user.id}>
                  <div className="we-dot" style={{background:'var(--purple)'}} />
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500}}>{displayName(r.user)}</div>
                    {leave && (
                      <div style={{fontSize:11,color:'var(--dim)'}}>
                        {leave.city?leave.city+', ':''}{leave.country} · Returns {formatDate(leave.end_date)}
                        {!leave.contactable && <span style={{color:'var(--red)',marginLeft:4,fontWeight:600}}> · NOT CONTACTABLE</span>}
                      </div>
                    )}
                    {leave?.covering_person && (
                      <div style={{fontSize:11,marginTop:2}}>
                        <span style={{color:'var(--teal,#0891B2)'}}>👤 Covered by: </span>
                        <span style={{fontWeight:600}}>
                          {(leave.covering_person as any).personnel_type==='Military'?(leave.covering_person as any).rank:(leave.covering_person as any).title}{' '}
                          {(leave.covering_person as any).full_name}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="we-chip" style={{background:r.leave?.contactable?'var(--green-bg)':'var(--red-bg)',color:r.leave?.contactable?'var(--green)':'var(--red)',fontSize:9}}>
                    {r.leave?.contactable?'Contactable':'No Contact'}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* MALAYSIA */}
        {malaysiaRows.length > 0 && (
          <div className="we-card" style={{border:'1px solid rgba(8,145,178,0.25)',background:'rgba(8,145,178,0.04)'}}>
            <div className="we-clabel" style={{color:'var(--teal,#0891B2)'}}>🇲🇾 In Malaysia (Informed)</div>
            {malaysiaRows.map(r => (
              <div className="we-row" key={r.user.id}>
                <div style={{fontSize:18,flexShrink:0}}>🇲🇾</div>
                <div style={{flex:1,fontSize:13}}>{displayName(r.user)}</div>
                <span style={{fontSize:10,color:'var(--dim)'}}>No leave reqd</span>
              </div>
            ))}
          </div>
        )}

        {/* NOT REPORTED */}
        {notReported.length > 0 && (
          <div className="we-card red">
            <div className="we-clabel cl-red">Not Yet Reported</div>
            {notReported.map(r => (
              <div className="we-row" key={r.user.id}>
                <div className="we-dot" style={{background:'var(--red)'}} />
                <div style={{flex:1,fontSize:13}}>{displayName(r.user)}</div>
                <div style={{fontSize:11,color:'var(--dim)'}}>{r.user.personnel_type}</div>
              </div>
            ))}
          </div>
        )}

        {/* ATTEND B */}
        {attendBRows.length > 0 && (
          <div className="we-card">
            <div className="we-clabel cl-red">Attend B</div>
            {attendBRows.map(r => (
              <div className="we-row" key={r.user.id}>
                <div className="we-dot" style={{background:'#FF8080'}} />
                <div style={{flex:1}}>
                  <div style={{fontSize:13}}>{displayName(r.user)}</div>
                  {r.sub?.medical_end_date && (
                    <div style={{fontSize:11,color:'var(--amber)',marginTop:2}}>
                      🏥 {medicalDurationLabel(r.sub.medical_end_date)}
                    </div>
                  )}
                  {r.sub?.remarks && <div style={{fontSize:11,color:'var(--dim)',marginTop:2}}>{r.sub.remarks}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* REVIEW */}
        <div className="we-card" style={{textAlign:'center'}}>
          {review ? (
            <div>
              <div className="badge-green" style={{display:'inline-flex',marginBottom:6}}>✓ Reviewed</div>
              <div style={{fontSize:11,color:'var(--dim)',marginTop:6}}>
                {displayName(review.reviewer as any)} · {new Date(review.reviewed_at).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit',hour12:false})}H
              </div>
            </div>
          ) : (
            <div>
              <div style={{fontSize:13,color:'var(--dim)',marginBottom:12}}>Confirm you have reviewed today's group status</div>
              <button className="btn btn-green" onClick={doReview} style={{width:'100%'}}>✓ Mark Group as Reviewed</button>
            </div>
          )}
        </div>
      </div>}

      {/* WORK SCHEDULE EDIT MODAL */}
      {schedEdit && (
        <div style={{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>setSchedEdit(null)}>
          <div style={{background:'var(--surf)',border:'1px solid var(--border)',borderRadius:'14px 14px 0 0',padding:'20px 18px 40px',width:'100%',maxWidth:430}} onClick={e=>e.stopPropagation()}>
            <div style={{width:36,height:4,borderRadius:4,background:'var(--border)',margin:'0 auto 16px'}}/>
            <div style={{fontSize:14,fontWeight:700,marginBottom:2}}>{displayName(schedEdit)}</div>
            <div style={{fontSize:11,color:'var(--dim)',marginBottom:16}}>{schedEdit.appointment}</div>

            <div className="we-label" style={{marginBottom:10}}>Work Schedule</div>
            <div className="g2" style={{gap:8,marginBottom:20}}>
              {[
                { v:'weekdays', label:'📅 Mon–Fri',      desc:'No weekend or PH reporting' },
                { v:'shift',    label:'🔄 Shift / 24-7', desc:'Reports daily incl. weekends & PH' },
              ].map(opt => {
                const current = (schedEdit as any).work_schedule ?? 'weekdays'
                return (
                  <button key={opt.v} onClick={()=>saveSchedule(schedEdit, opt.v)} style={{
                    padding:'12px 14px', borderRadius:8, cursor:'pointer', textAlign:'left',
                    border:`1.5px solid ${current===opt.v?'var(--amber)':'var(--border)'}`,
                    background: current===opt.v?'rgba(232,160,32,0.1)':'var(--surf-hi)',
                    color: current===opt.v?'var(--text)':'var(--dim)',
                    fontFamily:'var(--sans)', width:'100%',
                  }}>
                    <div style={{fontSize:13,fontWeight:600}}>{opt.label}</div>
                    <div style={{fontSize:10,marginTop:3,opacity:0.7}}>{opt.desc}</div>
                    {current===opt.v && <div style={{fontSize:10,color:'var(--amber)',marginTop:4}}>✓ Current</div>}
                  </button>
                )
              })}
            </div>
            <button className="btn btn-secondary" style={{width:'100%'}} onClick={()=>setSchedEdit(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
