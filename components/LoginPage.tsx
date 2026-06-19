'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { loadOrCreateUserProfile, logSessionResult, logUserResult } from '@/lib/user-profile'
import type { User } from '@/types/database'

type Screen = 'login' | 'forgot' | 'register'

const MIL_RANKS  = ['BG','COL','LTC','MAJ','CPT','LTA','2LT','ME6','ME5','ME4','ME3','ME2','ME1','MSG','SSG','3SG','CFC','CPL','LCP','PTE','REC']
const CIV_TITLES = ['Mr','Ms','Mdm','Dr']
const GROUPS     = [{id:0,name:'AC3'},{id:1,name:'Current'},{id:2,name:'Infor'},{id:3,name:'Civil'},{id:4,name:'Log'},{id:5,name:'Plans'}]

export default function LoginPage({ onLogin }: { onLogin:(u:User)=>void }) {
  const [screen, setScreen] = useState<Screen>('login')
  const supabase = createClient()
  const [msg, setMsg] = useState('')

  // LOGIN
  const [email, setEmail]       = useState('')
  const [pass,  setPass]        = useState('')
  const [lerr,  setLerr]        = useState('')
  const [lload, setLload]       = useState(false)

  // FORGOT
  const [femail, setFemail]     = useState('')
  const [ferr,   setFerr]       = useState('')
  const [fsent,  setFsent]      = useState(false)
  const [fload,  setFload]      = useState(false)

  // REGISTER
  const [reg, setReg] = useState({
    type:'Military', rank:'MAJ', title:'Mr',
    name:'', groupId:1, appt:'', mobile:'', email:'', password:'', confirm:''
  })
  const [rerr,  setRerr]  = useState('')
  const [rload, setRload] = useState(false)
  const upd = (k:string,v:any) => setReg(r=>({...r,[k]:v}))

  const doLogin = async () => {
    if (!email.trim()||!pass) { setLerr('Enter your email and password.'); return }
    setLload(true); setLerr('')
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email:email.trim().toLowerCase(), password:pass })
      console.info('[auth] login: signInWithPassword result', { hasUser: Boolean(data.user), userId: data.user?.id, error })
      if (error||!data.user) { setLerr('Invalid email or password.'); return }

      const userResult = await supabase.auth.getUser()
      logUserResult('login', userResult.data.user, userResult.error)

      const sessionResult = await supabase.auth.getSession()
      logSessionResult('login', sessionResult.data.session, sessionResult.error)

      const { user: profile, error: profileError } = await loadOrCreateUserProfile(supabase, data.user, 'login')
      if (profileError || !profile) {
        setLerr(`Signed in, but profile setup failed: ${profileError ?? 'missing profile'}`)
        return
      }

      console.info('[auth] login: redirect execution', { target: 'dashboard', userId: profile.id })
      onLogin(profile)
    } catch (e) {
      console.error('[auth] login: unexpected error', e)
      setLerr('Sign in failed. Please try again.')
    } finally {
      setLload(false)
    }
  }

  const doForgot = async () => {
    if (!femail.trim()) { setFerr('Enter your email address.'); return }
    setFload(true); setFerr('')
    const { error } = await supabase.auth.resetPasswordForEmail(femail.trim().toLowerCase(), {
      redirectTo: window.location.origin + '/?reset=true'
    })
    if (error) { setFerr('Error: '+error.message); setFload(false); return }
    setFsent(true); setFload(false)
  }

  const doRegister = async () => {
    if (!reg.name.trim())   { setRerr('Full name required.'); return }
    if (!reg.appt.trim())   { setRerr('Appointment required.'); return }
    if (!reg.mobile.trim()) { setRerr('Mobile number required.'); return }
    if (!reg.email.trim()||!reg.email.includes('@')) { setRerr('Valid email required.'); return }
    if (!reg.password)      { setRerr('Password required.'); return }
    if (reg.password.length<6) { setRerr('Password must be at least 6 characters.'); return }
    if (reg.password!==reg.confirm) { setRerr('Passwords do not match.'); return }
    setRload(true); setRerr('')

    const { data:dup } = await supabase.from('users').select('id').eq('mobile',reg.mobile.trim()).maybeSingle()
    if (dup) { setRerr('Mobile number already registered.'); setRload(false); return }

    const { data, error } = await supabase.auth.signUp({
      email:    reg.email.trim().toLowerCase(),
      password: reg.password,
      options:  { emailRedirectTo: window.location.origin }
    })
    if (error||!data.user) { setRerr(error?.message??'Registration failed.'); setRload(false); return }

    await supabase.from('users').insert({
      id:             data.user.id,
      personnel_type: reg.type as any,
      rank:           reg.type==='Military' ? reg.rank  : null,
      title:          reg.type==='Civilian' ? reg.title : null,
      full_name:      reg.name.trim(),
      group_id:       Number(reg.groupId),
      appointment:    reg.appt.trim(),
      mobile:         reg.mobile.trim(),
      email:          reg.email.trim().toLowerCase(),
      role:           'personnel',
    })

    setMsg('Registered! Check your email to confirm, then sign in.')
    setScreen('login')
    setRload(false)
  }

  // ── LOGIN ──────────────────────────────────────────────────
  if (screen==='login') return (
    <div className="we-center">
      <div className="we-login-brand">WITHOUT EQUAL</div>
      <div className="we-login-ttl">Daily Readiness</div>
      <div className="we-login-rule"/>
      {msg && <div style={{color:'var(--green)',fontSize:12,textAlign:'center',marginBottom:16,padding:'10px 12px',background:'rgba(22,169,107,0.08)',borderRadius:8,border:'1px solid rgba(22,169,107,0.2)',lineHeight:1.6}}>{msg}</div>}
      <div className="fg">
        <label className="we-label">Email</label>
        <input className="we-input" placeholder="e.g. wilsonlow@gmail.com" type="email"
          value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLogin()}/>
      </div>
      <div className="fg">
        <label className="we-label">Password</label>
        <input className="we-input" type="password" placeholder="Password"
          value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLogin()}/>
      </div>
      <button className="btn btn-primary" onClick={doLogin} disabled={lload}>
        {lload?'Signing in…':'Sign In'}
      </button>
      {lerr && <div className="we-login-err">{lerr}</div>}
      <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'center'}}>
        <button className="btn-sm" onClick={()=>{setFerr('');setFsent(false);setScreen('forgot')}}>Forgot Password?</button>
        <button className="btn-sm" onClick={()=>{setRerr('');setScreen('register')}}>Register</button>
      </div>
    </div>
  )

  // ── FORGOT ─────────────────────────────────────────────────
  if (screen==='forgot') return (
    <div className="we-center">
      <div className="we-login-brand">WITHOUT EQUAL</div>
      <div className="we-login-ttl">Reset Password</div>
      <div className="we-login-rule"/>
      {fsent ? (
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:32,marginBottom:12}}>📧</div>
          <div style={{fontSize:14,fontWeight:600,color:'var(--green)',marginBottom:8}}>Reset email sent</div>
          <div style={{fontSize:13,color:'var(--dim)',lineHeight:1.6}}>Check your email for a password reset link. Click the link to set a new password.</div>
          <button className="btn-sm" style={{marginTop:20}} onClick={()=>setScreen('login')}>← Back to Sign In</button>
        </div>
      ) : (
        <>
          <div style={{fontSize:13,color:'var(--dim)',marginBottom:16,textAlign:'center',lineHeight:1.6}}>
            Enter your registered email. We'll send a reset link.
          </div>
          <div className="fg">
            <label className="we-label">Email Address</label>
            <input className="we-input" type="email" placeholder="e.g. wilsonlow@gmail.com" value={femail} onChange={e=>setFemail(e.target.value)}/>
          </div>
          {ferr && <div className="we-login-err">{ferr}</div>}
          <button className="btn btn-primary" onClick={doForgot} disabled={!femail.trim()||fload}>
            {fload?'Sending…':'Send Reset Link'}
          </button>
          <div style={{marginTop:12,textAlign:'center'}}><button className="btn-sm" onClick={()=>setScreen('login')}>← Back</button></div>
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

      <div className="fg"><label className="we-label">Personnel Type</label>
        <div className="g2">{['Military','Civilian'].map(t=>(
          <button key={t} className="btn-sm" onClick={()=>upd('type',t)}
            style={{padding:10,borderColor:reg.type===t?'var(--amber)':'var(--border)',color:reg.type===t?'var(--amber)':'var(--dim)'}}>
            {t}</button>))}</div></div>

      {reg.type==='Military'
        ?<div className="fg"><label className="we-label">Rank</label><select className="we-input we-select" value={reg.rank} onChange={e=>upd('rank',e.target.value)}>{MIL_RANKS.map(r=><option key={r}>{r}</option>)}</select></div>
        :<div className="fg"><label className="we-label">Title</label><select className="we-input we-select" value={reg.title} onChange={e=>upd('title',e.target.value)}>{CIV_TITLES.map(t=><option key={t}>{t}</option>)}</select></div>
      }

      <div className="fg"><label className="we-label">Full Name</label>
        <input className="we-input" placeholder="e.g. Wilson Low" value={reg.name} onChange={e=>upd('name',e.target.value)}/></div>

      <div className="fg"><label className="we-label">Group</label>
        <select className="we-input we-select" value={reg.groupId} onChange={e=>upd('groupId',e.target.value)}>
          {GROUPS.map(g=><option key={g.id} value={g.id}>Grp {g.id} – {g.name}</option>)}
        </select></div>

      <div className="fg"><label className="we-label">Appointment</label>
        <input className="we-input" placeholder="e.g. SO2 Current" value={reg.appt} onChange={e=>upd('appt',e.target.value)}/></div>

      <div className="fg"><label className="we-label">Mobile Number</label>
        <input className="we-input" placeholder="e.g. 91234567" inputMode="numeric" value={reg.mobile} onChange={e=>upd('mobile',e.target.value)}/></div>

      <div className="fg"><label className="we-label">Email Address</label>
        <input className="we-input" type="email" placeholder="e.g. wilsonlow@gmail.com" value={reg.email} onChange={e=>upd('email',e.target.value)}/></div>

      <div className="fg"><label className="we-label">Password</label>
        <input className="we-input" type="password" placeholder="Min 6 characters" value={reg.password} onChange={e=>upd('password',e.target.value)}/></div>

      <div className="fg"><label className="we-label">Confirm Password</label>
        <input className="we-input" type="password" placeholder="Repeat password" value={reg.confirm} onChange={e=>upd('confirm',e.target.value)}/></div>

      {rerr && <div className="we-login-err" style={{marginBottom:12}}>{rerr}</div>}

      <button className="btn btn-primary" onClick={doRegister} disabled={rload}>
        {rload?'Registering…':'Register'}
      </button>

      <div style={{marginTop:12,fontSize:11,color:'var(--faint)',textAlign:'center',lineHeight:1.6}}>
        After registering, check your email to confirm your account before signing in.
      </div>
    </div>
  )
}
