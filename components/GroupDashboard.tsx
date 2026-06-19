'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { User, DailySubmission, LeavePeriod, GroupReview } from '@/types/database'
import { displayName, lastName, statusColor, todayStr, tomorrowStr, formatDate, AVAILABLE_STATUSES } from '@/lib/constants'

interface PersonnelRow {
  user: User
  sub: DailySubmission | null
  leave: LeavePeriod | null
}

export default function GroupDashboard({ user, showToast }: { user: User; showToast: (m:string)=>void }) {
  const [rows,    setRows]    = useState<PersonnelRow[]>([])
  const [review,  setReview]  = useState<GroupReview|null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const today    = todayStr()
  const tomorrow = tomorrowStr()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)

    const [{ data: members }, { data: subs }, { data: leaves }, { data: rev }] = await Promise.all([
      supabase.from('users').select('*').eq('group_id', user.group_id).eq('is_active', true).neq('role','admin').order('full_name'),
      supabase.from('daily_submissions').select('*').eq('submission_date', today).in('user_id', []),
      supabase.from('leave_periods').select('*').eq('status','approved').lte('start_date',today).gte('end_date',today),
      supabase.from('group_reviews').select('*, reviewer:users(*)').eq('group_id', user.group_id).eq('review_date', today).single(),
    ])

    // Re-fetch subs now that we have member IDs
    const memberIds = (members ?? []).map(m => m.id)
    const { data: todaySubs } = await supabase
      .from('daily_submissions').select('*').eq('submission_date', today).in('user_id', memberIds)

    const combined: PersonnelRow[] = (members ?? []).map(m => ({
      user: m,
      sub:  (todaySubs ?? []).find(s => s.user_id === m.id) ?? null,
      leave:(leaves ?? []).find(l => l.user_id === m.id) ?? null,
    }))

    setRows(combined)
    setReview(rev)
    setLoading(false)
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

  if (loading) return <div style={{padding:24,color:'var(--dim)',fontSize:13}}>Loading…</div>

  const strength      = rows.length
  const reported      = rows.filter(r => r.sub !== null).length
  const pending       = strength - reported
  const available     = rows.filter(r => r.sub && AVAILABLE_STATUSES.includes(r.sub.status)).length
  const attendB       = rows.filter(r => r.sub?.status === 'Attend B').length
  const attendC       = rows.filter(r => r.sub?.status === 'Attend C').length
  const localLeave    = rows.filter(r => r.sub?.status === 'Local Leave').length
  const overseasLeave = rows.filter(r => r.sub?.status === 'Overseas Leave').length
  const timeOff       = rows.filter(r => r.sub?.status === 'Time Off').length
  const duty          = rows.filter(r => r.sub && ['Duty','Course','Exercise','Official Travel'].includes(r.sub.status)).length
  const rate          = strength ? Math.round(reported/strength*100) : 0
  const notReported   = rows.filter(r => !r.sub)
  const attendCRows   = rows.filter(r => r.sub?.status === 'Attend C')
  const attendBRows   = rows.filter(r => r.sub?.status === 'Attend B')
  const overseasRows  = rows.filter(r => r.sub?.status === 'Overseas Leave')

  // Returning tomorrow
  const { data: returningTomorrow } = { data: [] as LeavePeriod[] } // placeholder

  return (
    <div>
      {/* STRENGTH SUMMARY */}
      <div className="we-card">
        <div className="we-clabel">Group Readiness · {today}</div>
        <div className="g3" style={{marginBottom:10}}>
          <div className="we-stat"><div className={`we-statval sv-white`}>{strength}</div><div className="we-statlbl">Total</div></div>
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
      </div>

      {/* PERSONNEL TABLE */}
      <div className="we-card">
        <div className="we-clabel">Personnel Status</div>
        <div className="we-tablewrap">
          <table className="we-table">
            <thead><tr><th>Name</th><th>Status</th><th>Time</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const isAuto = r.sub?.is_auto
                return (
                  <tr key={r.user.id}>
                    <td>
                      <div style={{fontWeight:600,fontSize:12}}>{lastName(r.user)}</div>
                      <div style={{fontSize:10,color:'var(--dim)'}}>{r.user.rank||r.user.title}</div>
                    </td>
                    <td style={{textAlign:'left'}}>
                      {r.sub ? (
                        <span className="we-chip" style={{background:statusColor(r.sub.status)+'18',color:statusColor(r.sub.status),border:`1px solid ${statusColor(r.sub.status)}33`,fontSize:10}}>
                          {isAuto ? '🤖 ' : ''}{r.sub.status}
                        </span>
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
                {r.sub?.remarks && <div style={{fontSize:11,color:'var(--dim)'}}>{r.sub.remarks}</div>}
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
                  {leave && <div style={{fontSize:11,color:'var(--dim)'}}>
                    {leave.city?leave.city+', ':''}{leave.country} · Returns {formatDate(leave.end_date)}
                    {!leave.contactable && <span style={{color:'var(--red)',marginLeft:4,fontWeight:600}}> · NOT CONTACTABLE</span>}
                  </div>}
                </div>
                <span className="we-chip" style={{background:r.leave?.contactable?'var(--green-bg)':'var(--red-bg)',color:r.leave?.contactable?'var(--green)':'var(--red)',fontSize:9}}>
                  {r.leave?.contactable?'Contactable':'No Contact'}
                </span>
              </div>
            )
          })}
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
              <div style={{flex:1,fontSize:13}}>{displayName(r.user)}</div>
              {r.sub?.remarks && <div style={{fontSize:11,color:'var(--dim)'}}>{r.sub.remarks}</div>}
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
    </div>
  )
}
