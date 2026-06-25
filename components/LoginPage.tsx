'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@/types/database'
import { MIL_RANKS, CIV_TITLES, GROUPS } from '@/lib/constants'

type Screen = 'login' | 'forgot' | 'register'

export default function LoginPage({ onLogin }: { onLogin:(u:User)=>void }) {
  const [screen, setScreen] = useState<Screen>('login')
  const supabase = createClient()
  const [msg, setMsg] = useState('')

  // LOGIN
  const [lemail, setLemail] = useState('')
  const [lpass,  setLpass]  = useState('')
  const [lerr,   setLerr]   = useState('')
  const [lload,  setLload]  = useState(false)

  // FORGOT
  const [femail, setFemail] = useState('')
  const [ferr,   setFerr]   = useState('')
  const [fsent,  setFsent]  = useState(false)
  const [fload,  setFload]  = useState(false)

  // REGISTER
  const [reg, setReg] = useState({
    type:'Military', rank:'MAJ', title:'Mr',
    name:'', groupId:1, appt:'', mobile:'', email:'', password:'', confirm:''
  })
  const [rerr,  setRerr]  = useState('')
  const [rload, setRload] = useState(false)
  const upd = (k:string, v:any) => setReg(r => ({...r,[k]:v}))

  const doLogin = async () => {
    if (!lemail.trim() || !lpass) { setLerr('Enter your email and password.'); return }
    setLload(true); setLerr('')
    const { data, error } = await supabase.auth.signInWithPassword({
      email: lemail.trim().toLowerCase(),
      password: lpass,
    })
    if (error || !data.user) {
      setLerr('Invalid email or password.')
      setLload(false); return
    }
    const { data: u } = await supabase
      .from('users').select('*,group:groups(*)')
      .eq('id', data.user.id).single()
    if (u) onLogin(u)
    setLload(false)
  }

  const doForgot = async () => {
    if (!femail.trim()) { setFerr('Enter your email address.'); return }
    setFload(true); setFerr('')
    const { error } = await supabase.auth.resetPasswordForEmail(
      femail.trim().toLowerCase(),
      { redirectTo: window.location.origin }
    )
    if (error) { setFerr('Error: ' + error.message); setFload(false); return }
    setFsent(true); setFload(false)
  }

  const doRegister = async () => {
    if (!reg.name.trim())                      { setRerr('Full name required.'); return }
    if (!reg.appt.trim())                      { setRerr('Appointment required.'); return }
    if (!reg.mobile.trim())                    { setRerr('Mobile number required.'); return }
    if (!reg.email.trim() || !reg.email.includes('@')) { setRerr('Valid email required.'); return }
    if (!reg.password)                         { setRerr('Password required.'); return }
    if (reg.password.length < 6)               { setRerr('Password must be at least 6 characters.'); return }
    if (reg.password !== reg.confirm)          { setRerr('Passwords do not match.'); return }
    setRload(true); setRerr('')

    // Sign up with Supabase Auth — pass profile data as metadata
    // The database trigger will create the profile automatically
    const { data, error } = await supabase.auth.signUp({
      email:    reg.email.trim().toLowerCase(),
      password: reg.password,
      options: {
        data: {
          full_name:      reg.name.trim(),
          personnel_type: reg.type,
          rank:           reg.type === 'Military' ? reg.rank : null,
          title:          reg.type === 'Civilian' ? reg.title : null,
          group_id:       Number(reg.groupId),
          appointment:    reg.appt.trim(),
          mobile:         reg.mobile.trim(),
        }
      }
    })

    if (error) {
      setRerr(error.message)
      setRload(false); return
    }

    if (!data.user) {
      setRerr('Registration failed. Please try again.')
      setRload(false); return
    }

    // Insert profile into public.users
    const { error: insertError } = await supabase.from('users').insert({
      id:             data.user.id,
      personnel_type: reg.type as any,
      rank:           reg.type === 'Military' ? reg.rank  : null,
      title:          reg.type === 'Civilian' ? reg.title : null,
      full_name:      reg.name.trim(),
      group_id:       Number(reg.groupId),
      appointment:    reg.appt.trim(),
      mobile:         reg.mobile.trim(),
      role:           'personnel',
    })

    if (insertError) {
      // Auth account created but profile insert failed
      if (insertError.message.includes('duplicate') || insertError.code === '23505') {
        setRerr('An account with this mobile number or email already exists.')
      } else {
        setRerr('Profile creation failed: ' + insertError.message)
      }
      setRload(false); return
    }

    setMsg('Registered successfully! Sign in with your email and password.')
    setScreen('login')
    setRload(false)
  }

  // ── LOGIN ──────────────────────────────────────────────────
  if (screen === 'login') return (
    <div className="we-center">
      <div className="we-login-brand">WITHOUT EQUAL</div>
      <div className="we-login-ttl">Daily Readiness</div>
      <div className="we-login-rule"/>
      {msg && (
        <div style={{color:'var(--green)',fontSize:12,textAlign:'center',marginBottom:16,
          padding:'10px 12px',background:'rgba(22,169,107,0.08)',borderRadius:8,
          border:'1px solid rgba(22,169,107,0.2)',lineHeight:1.6}}>
          {msg}
        </div>
      )}
      <div className="fg">
        <label className="we-label">Email Address</label>
        <input className="we-input" type="email" placeholder="e.g. wilsonlow@gmail.com"
          value={lemail} onChange={e=>setLemail(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&doLogin()}/>
      </div>
      <div className="fg">
        <label className="we-label">Password</label>
        <input className="we-input" type="password" placeholder="Password"
          value={lpass} onChange={e=>setLpass(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&doLogin()}/>
      </div>
      <button className="btn btn-primary" onClick={doLogin} disabled={lload}>
        {lload ? 'Signing in…' : 'Sign In'}
      </button>
      {lerr && <div className="we-login-err">{lerr}</div>}
      <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'center'}}>
        <button className="btn-sm" onClick={()=>{setFerr('');setFsent(false);setScreen('forgot')}}>Forgot Password?</button>
        <button className="btn-sm" onClick={()=>{setRerr('');setScreen('register')}}>Register</button>
      </div>
    </div>
  )

  // ── FORGOT ─────────────────────────────────────────────────
  if (screen === 'forgot') return (
    <div className="we-center">
      <div className="we-login-brand">WITHOUT EQUAL</div>
      <div className="we-login-ttl">Reset Password</div>
      <div className="we-login-rule"/>
      {fsent ? (
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:32,marginBottom:12}}>📧</div>
          <div style={{fontSize:14,fontWeight:600,color:'var(--green)',marginBottom:8}}>Reset email sent</div>
          <div style={{fontSize:13,color:'var(--dim)',lineHeight:1.6}}>
            Check your email for a password reset link.
          </div>
          <button className="btn-sm" style={{marginTop:20}} onClick={()=>setScreen('login')}>← Back to Sign In</button>
        </div>
      ) : (
        <>
          <div style={{fontSize:13,color:'var(--dim)',marginBottom:16,textAlign:'center',lineHeight:1.6}}>
            Enter your registered email. We'll send a reset link.
          </div>
          <div className="fg">
            <label className="we-label">Email Address</label>
            <input className="we-input" type="email" placeholder="e.g. wilsonlow@gmail.com"
              value={femail} onChange={e=>setFemail(e.target.value)}/>
          </div>
          {ferr && <div className="we-login-err">{ferr}</div>}
          <button className="btn btn-primary" onClick={doForgot} disabled={!femail.trim()||fload}>
            {fload ? 'Sending…' : 'Send Reset Link'}
          </button>
          <div style={{marginTop:12,textAlign:'center'}}>
            <button className="btn-sm" onClick={()=>setScreen('login')}>← Back</button>
          </div>
        </>
      )}
    </div>
  )

  // ── REGISTER ───────────────────────────────────────────────
  return (
    <div className="we-scroll">
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
        <button className="btn-sm" onClick={()=>setScreen('login')}>← Back</button>
        <div>
          <div className="we-login-brand" style={{textAlign:'left'}}>WITHOUT EQUAL</div>
          <div style={{fontSize:15,fontWeight:700}}>First-Time Registration</div>
        </div>
      </div>

      <div className="fg">
        <label className="we-label">Personnel Type</label>
        <div className="g2">
          {['Military','Civilian'].map(t => (
            <button key={t} className="btn-sm" onClick={()=>upd('type',t)}
              style={{padding:10,borderColor:reg.type===t?'var(--amber)':'var(--border)',
                color:reg.type===t?'var(--amber)':'var(--dim)'}}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {reg.type === 'Military'
        ? <div className="fg"><label className="we-label">Rank</label>
            <select className="we-input we-select" value={reg.rank} onChange={e=>upd('rank',e.target.value)}>
              {MIL_RANKS.map(r=><option key={r} value={r}>{r}</option>)}
            </select></div>
        : <div className="fg"><label className="we-label">Title</label>
            <select className="we-input we-select" value={reg.title} onChange={e=>upd('title',e.target.value)}>
              {CIV_TITLES.map(t=><option key={t} value={t}>{t}</option>)}
            </select></div>
      }

      <div className="fg">
        <label className="we-label">Full Name</label>
        <input className="we-input" placeholder="e.g. Wilson Low"
          value={reg.name} onChange={e=>upd('name',e.target.value)}/>
      </div>

      <div className="fg">
        <label className="we-label">Group</label>
        <select className="we-input we-select" value={reg.groupId} onChange={e=>upd('groupId',e.target.value)}>
          {GROUPS.map(g=><option key={g.id} value={g.id}>Grp {g.id} – {g.name}</option>)}
        </select>
      </div>

      <div className="fg">
        <label className="we-label">Appointment</label>
        <input className="we-input" placeholder="e.g. SO2 Current"
          value={reg.appt} onChange={e=>upd('appt',e.target.value)}/>
      </div>

      <div className="fg">
        <label className="we-label">Mobile Number</label>
        <input className="we-input" placeholder="e.g. 91234567" inputMode="numeric"
          value={reg.mobile} onChange={e=>upd('mobile',e.target.value)}/>
      </div>

      <div className="fg">
        <label className="we-label">Email Address</label>
        <input className="we-input" type="email" placeholder="e.g. name@gmail.com"
          value={reg.email} onChange={e=>upd('email',e.target.value)}/>
      </div>

      <div className="fg">
        <label className="we-label">Password</label>
        <input className="we-input" type="password" placeholder="Min 6 characters"
          value={reg.password} onChange={e=>upd('password',e.target.value)}/>
      </div>

      <div className="fg">
        <label className="we-label">Confirm Password</label>
        <input className="we-input" type="password" placeholder="Repeat password"
          value={reg.confirm} onChange={e=>upd('confirm',e.target.value)}/>
      </div>

      {rerr && <div className="we-login-err" style={{marginBottom:12}}>{rerr}</div>}

      <button className="btn btn-primary" onClick={doRegister} disabled={rload}>
        {rload ? 'Registering…' : 'Register'}
      </button>
    </div>
  )
}
