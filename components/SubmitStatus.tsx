'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { User, DailySubmission, LeavePeriod } from '@/types/database'
import { STATUS_CATS, statusColor, todayStr, tomorrowStr, isPastCutoff, LEAVE_STATUSES, formatDate, PRE_REPORT_HOUR, MEDICAL_STATUSES, WEEKEND_STATUS, PUBLIC_HOLIDAY_STATUS, MALAYSIA_STATUS, STANDDOWN_STATUSES, isWeekend, isStandDown, standDownLabel } from '@/lib/constants'

export default function SubmitStatus({ user, showToast }: { user: User; showToast: (m:string)=>void }) {
  const [todaySub,    setTodaySub]  = useState<DailySubmission|null>(null)
  const [tomorrowSub, setTomSub]    = useState<DailySubmission|null>(null)
  const [autoLeave,   setAutoLeave] = useState<LeavePeriod|null>(null)
  const [selected,    setSelected]  = useState<string|null>(null)
  const [remarks,     setRemarks]   = useState('')
  const [amendMode,   setAmendMode] = useState(false)
  const [amendReason, setAmendR]    = useState('')
  const [loading,     setLoading]   = useState(true)
  const [saving,      setSaving]    = useState(false)
  const [preReport,    setPreReport]  = useState(false) // true = submitting for tomorrow
  const [weekendOverride, setWkdOvr] = useState(false) // weekday staff opting to report on weekend
  const [medEndDate,   setMedEnd]   = useState('')    // MC/medical expiry date
  const [coverPerson,  setCoverP]   = useState('')    // covering person ID for leave
  const [personnel,    setPersonnel] = useState<User[]>([])
  const supabase = createClient()
  const today    = todayStr()
  const tomorrow = tomorrowStr()
  const pastCutoff   = isPastCutoff()
  const canPreReport = new Date().getHours() >= PRE_REPORT_HOUR  // after 1800
  const targetDate   = preReport ? tomorrow : today

  useEffect(() => {
    loadData()
    // Fetch personnel list for covering person dropdown
    supabase.from('users').select('id, full_name, rank, title, personnel_type')
      .eq('is_active', true).neq('role', 'admin').neq('id', user.id).order('full_name')
      .then(({ data }) => setPersonnel(data ?? []))
  }, [])

  const loadData = async () => {
    setLoading(true)
    // Load today's submission
    const { data: sub } = await supabase
      .from('daily_submissions')
      .select('*')
      .eq('user_id', user.id)
      .eq('submission_date', today)
      .single()

    // Load tomorrow's submission (for pre-report display)
    const { data: tomSub } = await supabase
      .from('daily_submissions')
      .select('*')
      .eq('user_id', user.id)
      .eq('submission_date', tomorrow)
      .single()

    // Check if on approved leave today
    const { data: leaves } = await supabase
      .from('leave_periods')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today)

    const activeleave = leaves?.[0] ?? null
    setAutoLeave(activeleave)

    // Stale auto-leave submission: leave was cancelled but submission still exists — clean it up
    let cleanedSub = sub
    if (sub && sub.is_auto && LEAVE_STATUSES.includes(sub.status) && !activeleave) {
      await supabase.from('daily_submissions').delete().eq('id', sub.id)
      cleanedSub = null
    }

    setTodaySub(cleanedSub)
    setTomSub(tomSub)
    if (cleanedSub) { setSelected(cleanedSub.status); setRemarks(cleanedSub.remarks ?? ''); setMedEnd(cleanedSub.medical_end_date ?? ''); setCoverP(cleanedSub.covering_person_id ?? '') }

    // Auto-mark weekday staff as Weekend/Public Holiday on stand-down days
    if (!sub && isStandDown() && user.work_schedule === 'weekdays') {
      const standStatus  = isWeekend() ? WEEKEND_STATUS : PUBLIC_HOLIDAY_STATUS
      const standReason  = isWeekend() ? 'Auto: weekday schedule — weekend' : 'Auto: weekday schedule — public holiday'
      const { data: wkSub } = await supabase.from('daily_submissions').upsert({
        user_id: user.id, submission_date: todayStr(),
        status: standStatus, submitted_at: new Date().toISOString(),
        is_auto: true, auto_reason: standReason,
        is_amended: false,
      }, { onConflict: 'user_id,submission_date' }).select().single()
      if (wkSub) setTodaySub(wkSub)
    }

    setLoading(false)
  }

  const submit = async () => {
    setSaving(true)
    const now = new Date()
    const isMedical = MEDICAL_STATUSES.includes(selected!)
    const { data, error } = await supabase
      .from('daily_submissions')
      .upsert({
        user_id: user.id,
        submission_date: targetDate,
        status: selected!,
        remarks,
        submitted_at: now.toISOString(),
        is_amended: false,
        is_auto: false,
        medical_end_date:   isMedical && medEndDate ? medEndDate : null,
        covering_person_id: LEAVE_STATUSES.includes(selected!) && coverPerson ? coverPerson : null,
      }, { onConflict: 'user_id,submission_date' })
      .select()
      .single()

    if (!error) {
      if (preReport) { setTomSub(data); showToast(`Pre-report for ${tomorrow} submitted ✓`) }
      else           { setTodaySub(data); showToast('Status submitted ✓') }
      setSelected(null); setRemarks(''); setMedEnd(''); setCoverP('')
    } else showToast('Error: ' + error.message)
    setSaving(false)
  }

  const submitAmend = async () => {
    if (!amendReason.trim()) return
    setSaving(true)
    const now = new Date()
    const isMedical = MEDICAL_STATUSES.includes(selected!)
    const { data, error } = await supabase
      .from('daily_submissions')
      .upsert({
        user_id: user.id,
        submission_date: today,
        status: selected!,
        remarks,
        submitted_at: now.toISOString(),
        is_amended: true,
        amend_reason: amendReason,
        amended_at: now.toISOString(),
        is_auto: false,
        medical_end_date:   isMedical && medEndDate ? medEndDate : null,
        covering_person_id: LEAVE_STATUSES.includes(selected!) && coverPerson ? coverPerson : null,
      }, { onConflict: 'user_id,submission_date' })
      .select().single()

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: user.id, action: 'LATE_AMENDMENT',
      table_name: 'daily_submissions', record_id: data?.id,
      new_value: { status: selected, amend_reason: amendReason }
    })

    if (!error) { setTodaySub(data); setAmendMode(false); showToast('Amendment submitted ✓') }
    else showToast('Error: ' + error.message)
    setSaving(false)
  }

  if (loading) return <div style={{padding:24,color:'var(--dim)',fontSize:13}}>Loading…</div>

  // ── STAND-DOWN — WEEKDAY STAFF (weekends + public holidays) ─────────
  if (isStandDown() && user.work_schedule === 'weekdays' && !weekendOverride) {
    const label     = standDownLabel()
    const isPH      = label === 'Public Holiday'
    const isMalaysia       = todaySub?.status === MALAYSIA_STATUS
    const isAlreadyWorking = todaySub && !STANDDOWN_STATUSES.includes(todaySub.status)

    const submitMalaysia = async () => {
      setSaving(true)
      const { data, error } = await supabase.from('daily_submissions').upsert({
        user_id: user.id, submission_date: today,
        status: MALAYSIA_STATUS,
        submitted_at: new Date().toISOString(),
        is_auto: false, is_amended: false,
      }, { onConflict: 'user_id,submission_date' }).select().single()
      if (!error) { setTodaySub(data); showToast('🇲🇾 Commander informed ✓') }
      setSaving(false)
    }

    return (
      <div>
        <div className="we-card green" style={{textAlign:'center',padding:'24px 20px'}}>
          <div style={{fontSize:28,marginBottom:12}}>{isPH ? '🎉' : '🏖️'}</div>
          <div style={{fontSize:16,fontWeight:700,color:'var(--green)',marginBottom:6}}>{label} — Stand Down</div>
          <div style={{fontSize:13,color:'var(--dim)',lineHeight:1.6}}>
            No reporting required today.<br/>Your status has been auto-marked.
          </div>
        </div>

        {isMalaysia ? (
          <div className="we-card" style={{border:'1px solid rgba(8,145,178,0.3)',background:'rgba(8,145,178,0.06)',textAlign:'center',padding:'20px 16px'}}>
            <div style={{fontSize:28,marginBottom:8}}>🇲🇾</div>
            <div style={{fontSize:13,fontWeight:700,color:'var(--teal,#0891B2)'}}>In Malaysia — Commander Informed</div>
            <div style={{fontSize:11,color:'var(--dim)',marginTop:4}}>No leave application required. Have a good trip!</div>
          </div>
        ) : isAlreadyWorking ? (
          <div className="we-card green">
            <div className="we-clabel cl-green">Status Submitted</div>
            <div className="we-row">
              <div className="we-dot" style={{background:'var(--green)'}}/>
              <div style={{flex:1,fontSize:13,fontWeight:500,color:statusColor(todaySub!.status)}}>{todaySub!.status}</div>
              <div style={{fontSize:11,color:'var(--dim)',fontFamily:'var(--mono)'}}>
                {new Date(todaySub!.submitted_at).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit',hour12:false})}H
              </div>
            </div>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10,paddingTop:4}}>
            <button
              onClick={submitMalaysia}
              disabled={saving}
              style={{
                display:'flex',flexDirection:'column',alignItems:'center',
                padding:'14px 20px', borderRadius:10, cursor:'pointer',
                border:'1.5px solid rgba(8,145,178,0.35)',
                background:'rgba(8,145,178,0.07)',
                color:'var(--teal,#0891B2)',
                fontFamily:'var(--sans)', textAlign:'center',
              }}
            >
              <div style={{fontSize:22,marginBottom:4}}>🇲🇾</div>
              <div style={{fontSize:13,fontWeight:600}}>I'm in Malaysia today</div>
              <div style={{fontSize:10,color:'var(--dim)',marginTop:3}}>No leave needed — tap to inform your commander</div>
            </button>
            <button
              onClick={() => setWkdOvr(true)}
              style={{fontSize:12,color:'var(--dim)',background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'8px 20px',cursor:'pointer',fontFamily:'var(--sans)'}}
            >
              💼 I'm working today — submit my status
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── AUTO-LEAVE STATE ─────────────────────────────────────
  if (autoLeave && (!todaySub || todaySub.is_auto)) {
    const isOverseas = autoLeave.leave_type === 'Overseas Leave'
    return (
      <div>
        <div className="we-notif-auto">
          <div style={{fontSize:20,flexShrink:0}}>{isOverseas ? '✈️' : '🏖️'}</div>
          <div>
            <div style={{fontSize:13,fontWeight:600}}>Auto – Leave Period</div>
            <div style={{fontSize:11,color:'var(--dim)',marginTop:2}}>{autoLeave.leave_type} · No daily submission required</div>
          </div>
        </div>
        <div className="we-card purple">
          <div className="we-clabel cl-purple">Current Leave Details</div>
          <div className="we-row">
            <div className="we-dot" style={{background:'var(--purple)'}} />
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600}}>{autoLeave.leave_type}</div>
              <div style={{fontSize:11,color:'var(--dim)'}}>{formatDate(autoLeave.start_date)} → {formatDate(autoLeave.end_date)}</div>
            </div>
          </div>
          {isOverseas && autoLeave.country && (
            <div style={{marginTop:10,padding:'8px 10px',background:'var(--bg)',borderRadius:6}}>
              <div style={{fontSize:11,color:'var(--dim)',marginBottom:4}}>Location</div>
              <div style={{fontSize:13}}>{autoLeave.city ? `${autoLeave.city}, ` : ''}{autoLeave.country}</div>
              <div style={{fontSize:11,color:'var(--dim)',marginTop:6}}>
                Contactable: <span style={{color:autoLeave.contactable?'var(--green)':'var(--red)',fontWeight:600}}>{autoLeave.contactable?'Yes':'No'}</span>
              </div>
              {autoLeave.emergency_contact && (
                <div style={{fontSize:11,color:'var(--dim)',marginTop:4}}>Emergency: {autoLeave.emergency_contact}</div>
              )}
            </div>
          )}
          {autoLeave.remarks && <div style={{fontSize:11,color:'var(--dim)',marginTop:8}}>Remarks: {autoLeave.remarks}</div>}
        </div>
        <div style={{fontSize:11,color:'var(--faint)',textAlign:'center',padding:'8px 0'}}>
          System has auto-marked your status. No action needed.
        </div>
      </div>
    )
  }

  // ── SUBMITTED STATE ──────────────────────────────────────
  if (todaySub && !amendMode) {
    return (
      <div>
        <div className={`we-card ${todaySub.is_auto?'purple':'green'}`} style={{marginBottom:10}}>
          <div className="we-success">
            <div className="we-success-icon">{todaySub.is_auto?'🤖':'✅'}</div>
            <div className="we-success-ttl" style={{color:todaySub.is_auto?'var(--purple)':'var(--green)'}}>
              {todaySub.is_auto ? 'Auto-Submitted' : 'Status Submitted'}
            </div>
            <div style={{marginTop:12}}>
              <span className="we-chip" style={{background:statusColor(todaySub.status)+'22',color:statusColor(todaySub.status),border:`1px solid ${statusColor(todaySub.status)}44`,fontSize:13,padding:'4px 14px'}}>
                {todaySub.status}
              </span>
            </div>
            {todaySub.remarks && <div className="we-success-sub" style={{marginTop:8}}>"{todaySub.remarks}"</div>}
            <div className="we-success-sub" style={{marginTop:10,fontFamily:'var(--mono)',fontSize:11}}>
              {new Date(todaySub.submitted_at).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit',hour12:false})}H · {today}
              {todaySub.is_amended && ' · AMENDED'}
              {todaySub.is_auto && ' · AUTO'}
            </div>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => {
          if (pastCutoff) setAmendMode(true)
          else { setTodaySub(null); setSelected(todaySub.status); setRemarks(todaySub.remarks??'') }
        }}>
          {pastCutoff ? 'Request Amendment (Post Cut-off)' : 'Update Status'}
        </button>
      </div>
    )
  }

  // ── AMEND MODE ───────────────────────────────────────────
  if (amendMode) return (
    <div>
      <div className="we-card amber">
        <div className="we-clabel cl-amber">Late Amendment · Post 0830H Cut-off</div>
        <div style={{fontSize:13,color:'var(--dim)',marginBottom:12,lineHeight:1.5}}>This amendment will be recorded in the audit trail.</div>
        <div className="fg"><label className="we-label">Reason <span style={{color:'var(--red)'}}>*</span></label>
          <input className="we-input" placeholder="State reason for amendment…" value={amendReason} onChange={e=>setAmendR(e.target.value)} /></div>
      </div>
      {STATUS_CATS.map(cat => (
        <div key={cat.cat} style={{marginBottom:14}}>
          <div className="we-clabel" style={{color:cat.color}}>{cat.cat}</div>
          <div className="we-statusgrid">
            {cat.items.map(item => (
              <button key={item} className={`we-sb${selected===item?' sel':''}`} style={{'--cat-color':cat.color} as any} onClick={()=>setSelected(item)}>{item}</button>
            ))}
          </div>
          {cat.cat === 'Leave' && selected && LEAVE_STATUSES.includes(selected) && (
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:8,padding:'8px 12px',background:'var(--surf-hi)',borderRadius:8,border:'1px solid var(--border)'}}>
              <span style={{fontSize:12,color:'var(--dim)',whiteSpace:'nowrap',flexShrink:0}}>👤 Covered by</span>
              <select
                value={coverPerson}
                onChange={e => setCoverP(e.target.value)}
                style={{flex:1,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,color:coverPerson?'var(--text)':'var(--dim)',fontSize:12,padding:'5px 8px',fontFamily:'var(--sans)'}}
              >
                <option value="">— Optional —</option>
                {personnel.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.personnel_type === 'Military' ? p.rank : p.title} {p.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ))}
      {selected && MEDICAL_STATUSES.includes(selected) && (
        <div style={{background:'rgba(220,53,69,0.06)',border:'1px solid rgba(220,53,69,0.2)',borderRadius:8,padding:'10px 14px',marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--red)',marginBottom:8,fontFamily:'var(--mono)',letterSpacing:'0.05em'}}>MEDICAL DETAILS</div>
          <label style={{fontSize:12,color:'var(--dim)',display:'block',marginBottom:6}}>MC / Medical until</label>
          <input
            type="date"
            value={medEndDate}
            min={today}
            onChange={e => setMedEnd(e.target.value)}
            style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:13,padding:'6px 10px',fontFamily:'var(--mono)',width:'100%'}}
          />
        </div>
      )}
      <div className="fg"><label className="we-label">Remarks</label>
        <textarea className="we-input we-textarea" value={remarks} onChange={e=>setRemarks(e.target.value)} /></div>
      <div style={{display:'flex',gap:8}}>
        <button className="btn btn-secondary" style={{flex:1}} onClick={()=>setAmendMode(false)}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={!selected||!amendReason.trim()||saving} onClick={submitAmend}>
          {saving?'Saving…':'Submit Amendment'}
        </button>
      </div>
    </div>
  )

  // ── FRESH SUBMISSION ─────────────────────────────────────
  return (
    <div>
      {/* Tomorrow pre-report status banner */}
      {canPreReport && tomorrowSub && (
        <div className="we-card" style={{background:'var(--teal-bg,#042830)',border:'1px solid rgba(8,145,178,0.2)',marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{fontSize:16}}>🌙</div>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--teal,#0891B2)'}}>Tomorrow pre-reported</div>
              <div style={{fontSize:11,color:'var(--dim)',marginTop:2}}>{tomorrowSub.status} · {tomorrow}</div>
            </div>
            <button
              onClick={()=>{ setPreReport(true); setSelected(tomorrowSub.status); setRemarks(tomorrowSub.remarks??'') }}
              style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(8,145,178,0.3)',background:'rgba(8,145,178,0.1)',color:'var(--teal,#0891B2)',cursor:'pointer'}}
            >Edit</button>
          </div>
        </div>
      )}

      {/* Today's banner OR pre-report toggle */}
      {!preReport && (
        <div className="we-notif">
          <div style={{fontSize:18,flexShrink:0}}>{pastCutoff ? '⚠️' : '🔔'}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600}}>
              {pastCutoff ? 'Submission window closed' : 'Daily Status Required'}
            </div>
            <div style={{fontSize:11,color:'var(--dim)',marginTop:2}}>
              {pastCutoff ? 'Use "Request Amendment" below if needed' : 'Submit by 0830H · Takes under 10 seconds'}
            </div>
          </div>
          {canPreReport && !tomorrowSub && (
            <button
              onClick={()=>{ setPreReport(true); setSelected(null); setRemarks('') }}
              style={{fontSize:11,padding:'5px 10px',borderRadius:6,border:'1px solid rgba(8,145,178,0.4)',background:'rgba(8,145,178,0.1)',color:'var(--teal,#0891B2)',cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}
            >🌙 Pre-report for Tomorrow</button>
          )}
        </div>
      )}

      {preReport && (
        <div style={{background:'rgba(8,145,178,0.08)',border:'1px solid rgba(8,145,178,0.25)',borderRadius:10,padding:'10px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}>
          <div style={{fontSize:16}}>🌙</div>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--teal,#0891B2)'}}>Pre-reporting for Tomorrow · {tomorrow}</div>
            <div style={{fontSize:11,color:'var(--dim)',marginTop:2}}>Status will be saved for tomorrow's parade state.</div>
          </div>
          <button
            onClick={()=>{ setPreReport(false); setSelected(null); setRemarks('') }}
            style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--dim)',cursor:'pointer'}}
          >Cancel</button>
        </div>
      )}

      {STATUS_CATS.map(cat => (
        <div key={cat.cat} style={{marginBottom:14}}>
          <div className="we-clabel" style={{color:cat.color}}>{cat.cat}</div>
          <div className="we-statusgrid">
            {cat.items.map(item => (
              <button key={item} className={`we-sb${selected===item?' sel':''}`} style={{'--cat-color':cat.color} as any} onClick={()=>setSelected(item)}>{item}</button>
            ))}
          </div>
          {/* Leave panel + Covered By — injected inline right below the Leave buttons */}
          {cat.cat === 'Leave' && selected && LEAVE_STATUSES.includes(selected) && (
            <div className="we-leave-panel" style={{padding:'10px 14px',marginTop:8}}>
              {selected !== 'Time Off' && (
                <div style={{marginBottom:10}}>
                  <div className="we-leave-panel-title" style={{marginBottom:4}}>Multi-day leave?</div>
                  <div style={{fontSize:12,color:'var(--dim)'}}>Use the <strong style={{color:'var(--amber)'}}>My Leave</strong> tab — you won't need to report daily during that period.</div>
                </div>
              )}
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:12,color:'var(--dim)',whiteSpace:'nowrap',flexShrink:0}}>👤 Covered by</span>
                <select
                  value={coverPerson}
                  onChange={e => setCoverP(e.target.value)}
                  style={{flex:1,background:'var(--surf-hi)',border:'1px solid var(--border)',borderRadius:6,color:coverPerson?'var(--text)':'var(--dim)',fontSize:12,padding:'5px 8px',fontFamily:'var(--sans)'}}
                >
                  <option value="">— Optional —</option>
                  {personnel.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.personnel_type === 'Military' ? p.rank : p.title} {p.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      ))}

      {selected && MEDICAL_STATUSES.includes(selected) && (
        <div style={{background:'rgba(220,53,69,0.06)',border:'1px solid rgba(220,53,69,0.2)',borderRadius:8,padding:'10px 14px',marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--red)',marginBottom:8,fontFamily:'var(--mono)',letterSpacing:'0.05em'}}>MEDICAL DETAILS</div>
          <label style={{fontSize:12,color:'var(--dim)',display:'block',marginBottom:6}}>MC / Medical until <span style={{color:'var(--red)'}}>*</span></label>
          <input
            type="date"
            value={medEndDate}
            min={today}
            onChange={e => setMedEnd(e.target.value)}
            style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:13,padding:'6px 10px',fontFamily:'var(--mono)',width:'100%'}}
          />
          {medEndDate && (
            <div style={{fontSize:11,color:'var(--dim)',marginTop:6}}>
              {(() => {
                const days = Math.round((new Date(medEndDate).getTime() - new Date(today).getTime()) / 86400000)
                if (days === 0) return '⚠ Expires today'
                if (days === 1) return '1 day'
                return `${days} days`
              })()}
            </div>
          )}
        </div>
      )}

      {selected === 'Night Shift' && !preReport && (
        <div style={{background:'rgba(8,145,178,0.08)',border:'1px solid rgba(8,145,178,0.2)',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:12,color:'var(--teal,#0891B2)'}}>
          💡 On Night Shift tomorrow? Use <strong>Pre-report for Tomorrow</strong> (above) before you start your shift.
        </div>
      )}

      <div className="fg" style={{marginTop:4}}>
        <label className="we-label">Remarks (optional)</label>
        <textarea className="we-input we-textarea" placeholder="e.g. MINDEF meeting, Clinic review, Night shift 2000–0600…" value={remarks} onChange={e=>setRemarks(e.target.value)} />
      </div>

      <button className="btn btn-primary" disabled={!selected||saving} onClick={submit}>
        {saving ? 'Submitting…' : selected ? `Submit · ${selected}${preReport ? ` (${tomorrow})` : ''}` : 'Select your status above'}
      </button>
    </div>
  )
}
