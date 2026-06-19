'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@/types/database'
import { displayName } from '@/lib/constants'

type Screen = 'login' | 'forgot1' | 'forgot2' | 'forgot3' | 'register'

const MIL_RANKS = ['BG','COL','LTC','MAJ','CPT','LTA','2LT','ME6','ME5','ME4','ME3','ME2','ME1','MSG','SSG','3SG','CFC','CPL','LCP','PTE','REC']
const CIV_TITLES = ['Mr','Ms','Mdm','Dr']
const GROUPS = [{id:1,name:'Current'},{id:2,name:'Infor'},{id:3,name:'Civil'},{id:4,name:'Log'},{id:5,name:'Plans'}]

export default function LoginPage({ onLogin }: { onLogin: (u: User) => void }) {
  const [screen, setScreen] = useState<Screen>('login')
  const supabase = createClient()

  // LOGIN STATE
  const [cred, setCred]           = useState('')
  const [pass, setPass]           = useState('')
  const [loginErr, setLoginErr]   = useState('')
  const [loginLoading, setLoginL] = useState(false)

  // FORGOT STATE
  const [forgotCred, setForgotCred]   = useState('')
  const [forgotOtp, setForgotOtp]     = useState('')
  const [sentOtp, setSentOtp]         = useState('')
  const [foundEmail, setFoundEmail]   = useState('')
  const [newPass, setNewPass]         = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [forgotErr, setForgotErr]     = useState('')
  const [forgotMsg, setForgotMsg]     = useState('')

  // REGISTER STATE
  const [reg, setReg] = useState({
    type:'Military', rank:'MAJ', title:'Mr',
    name:'', groupId:1, appt:'', mobile:'', email:'', password:'', confirm:''
  })
  const [regErr, setRegErr] = useState('')
  const [regLoading, setRegL] = useState(false)
  const updateReg = (k: string, v: any) => setReg(r => ({...r, [k]:v}))

  const handleLogin = async () => {
    if (!cred.trim() || !pass) { setLoginErr('Enter mobile/email and password.'); return }
    setLoginL(true); setLoginErr('')
    // Look up email by mobile if numeric
    let email = cred.trim()
    if (/^\d+$/.test(email)) {
      const { data } = await supabase.from('users').select('id').eq('mobile', email).single()
      if (!data) { setLoginErr('No account found with that mobile number.'); setLoginL(false); return }
      // Get auth email from users table — we store it via auth
      const { data: authData } = await supabase.auth.admin?.getUserById ? 
        { data: null } : { data: null }
      // Use mobile as email prefix for Supabase auth
      email = email + '@we.internal'
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass })
    if (error || !data.user) { setLoginErr('Invalid credentials. Check mobile/email and password.'); setLoginL(false); return }
    const { data: u } = await supabase.from('users').select('*, group:groups(*)').eq('id', data.user.id).single()
    if (u) onLogin(u)
    setLoginL(false)
  }

  const handleForgotLookup = async () => {
    setForgotErr('')
    const { data: u } = await supabase.from('users').select('id,mobile').eq('mobile', forgotCred.trim()).single()
    if (!u) { setForgotErr('No account found.'); return }
    const code = String(Math.floor(100000 + Math.random() * 900000))
    setSentOtp(code)
    setFoundEmail(forgotCred.trim() + '@we.internal')
    setForgotMsg(`OTP sent. Demo code: ${code}`)
    setScreen('forgot2')
  }

  const handleOtpVerify = () => {
    if (forgotOtp.trim() !== sentOtp) { setForgotErr('Incorrect OTP.'); return }
    setForgotErr(''); setScreen('forgot3')
  }

  const handlePasswordReset = async () => {
    if (newPass.length < 6) { setForgotErr('Min 6 characters.'); return }
    if (newPass !== confirmPass) { setForgotErr('Passwords do not match.'); return }
    const { error } = await supabase.auth.updateUser({ password: newPass })
    if (error) { setForgotErr('Reset failed. Please try again.'); return }
    setScreen('login'); setForgotMsg('Password reset. Sign in.')
  }

  const handleRegister = async () => {
    if (!reg.name.trim()||!reg.mobile.trim()||!reg.email.trim()||!reg.password) { setRegErr('All fields required.'); return }
    if (reg.password !== reg.confirm) { setRegErr('Passwords do not match.'); return }
    if (reg.password.length < 6) { setRegErr('Min 6 characters.'); return }
    setRegL(true); setRegErr('')
    // Sign up with Supabase Auth
    const authEmail = reg.mobile.trim() + '@we.internal'
    const { data, error } = await supabase.auth.signUp({
      email: authEmail,
      password: reg.password,
      options: { emailRedirectTo: window.location.origin }
    })
    if (error || !data.user) { setRegErr(error?.message ?? 'Registration failed.'); setRegL(false); return }
    // Insert user profile
    const { error: profileErr } = await supabase.from('users').insert({
      id:             data.user.id,
      personnel_type: reg.type as any,
      rank:           reg.type === 'Military' ? reg.rank : undefined,
      title:          reg.type === 'Civilian' ? reg.title : undefined,
      full_name:      reg.name.trim(),
      group_id:       Number(reg.groupId),
      appointment:    reg.appt.trim(),
      mobile:         reg.mobile.trim(),
      role:           'personnel',
    })
    if (profileErr) { setRegErr('Profile creation failed: ' + profileErr.message); setRegL(false); return }
    setScreen('login')
    setRegL(false)
  }

  // ── RENDER LOGIN ──────────────────────────────────────────
  if (screen === 'login') return (
    <div className="we-center">
      <div className="we-login-brand">WITHOUT EQUAL</div>
      <div className="we-login-ttl">Daily Readiness</div>
      <div className="we-login-rule" />
      {forgotMsg && <div style={{color:'var(--green)',fontSize:12,textAlign:'center',marginBottom:12}}>{forgotMsg}</div>}
      <div className="fg"><label className="we-label">Mobile Number or Email</label>
        <input className="we-input" placeholder="e.g. 91234001" value={cred} onChange={e=>setCred(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()} /></div>
      <div className="fg"><label className="we-label">Password</label>
        <input className="we-input" type="password" placeholder="Password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()} /></div>
      <button className="btn btn-primary" onClick={handleLogin} disabled={loginLoading}>{loginLoading?'Signing in…':'Sign In'}</button>
      {loginErr && <div className="we-login-err">{loginErr}</div>}
      <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'center'}}>
        <button className="btn-sm" onClick={()=>{setForgotErr('');setForgotMsg('');setScreen('forgot1')}}>Forgot Password?</button>
        <button className="btn-sm" onClick={()=>{setRegErr('');setScreen('register')}}>Register</button>
      </div>
    </div>
  )

  // ── FORGOT STEP 1 ─────────────────────────────────────────
  if (screen === 'forgot1') return (
    <div className="we-center">
      <div className="we-login-brand">WITHOUT EQUAL</div>
      <div className="we-login-ttl">Reset Password</div>
      <div className="we-login-rule" />
      <div style={{fontSize:13,color:'var(--dim)',marginBottom:16,textAlign:'center',lineHeight:1.6}}>Enter your registered mobile number to receive an OTP.</div>
      <div className="fg"><label className="we-label">Mobile Number</label>
        <input className="we-input" placeholder="e.g. 91234001" value={forgotCred} onChange={e=>setForgotCred(e.target.value)} /></div>
      {forgotErr && <div className="we-login-err">{forgotErr}</div>}
      <button className="btn btn-primary" onClick={handleForgotLookup} disabled={!forgotCred.trim()}>Send OTP</button>
      <div style={{marginTop:12,textAlign:'center'}}><button className="btn-sm" onClick={()=>setScreen('login')}>← Back</button></div>
    </div>
  )

  // ── FORGOT STEP 2 ─────────────────────────────────────────
  if (screen === 'forgot2') return (
    <div className="we-center">
      <div className="we-login-brand">WITHOUT EQUAL</div>
      <div className="we-login-ttl">Enter OTP</div>
      <div className="we-login-rule" />
      {forgotMsg && <div className="we-otp-hint" style={{textAlign:'center',marginBottom:12}}>{forgotMsg}</div>}
      <div className="fg"><label className="we-label">6-Digit OTP</label>
        <input className="we-input" placeholder="Enter OTP" maxLength={6} value={forgotOtp} onChange={e=>setForgotOtp(e.target.value)} /></div>
      {forgotErr && <div className="we-login-err">{forgotErr}</div>}
      <button className="btn btn-primary" onClick={handleOtpVerify} disabled={forgotOtp.length<6}>Verify OTP</button>
      <div style={{marginTop:12,textAlign:'center'}}><button className="btn-sm" onClick={()=>setScreen('forgot1')}>← Back</button></div>
    </div>
  )

  // ── FORGOT STEP 3 ─────────────────────────────────────────
  if (screen === 'forgot3') return (
    <div className="we-center">
      <div className="we-login-brand">WITHOUT EQUAL</div>
      <div className="we-login-ttl">New Password</div>
      <div className="we-login-rule" />
      <div className="fg"><label className="we-label">New Password</label>
        <input className="we-input" type="password" placeholder="Min 6 characters" value={newPass} onChange={e=>setNewPass(e.target.value)} /></div>
      <div className="fg"><label className="we-label">Confirm Password</label>
        <input className="we-input" type="password" placeholder="Repeat password" value={confirmPass} onChange={e=>setConfirmPass(e.target.value)} /></div>
      {forgotErr && <div className="we-login-err">{forgotErr}</div>}
      <button className="btn btn-primary" onClick={handlePasswordReset} disabled={!newPass||!confirmPass}>Set New Password</button>
    </div>
  )

  // ── REGISTER ──────────────────────────────────────────────
  return (
    <div className="we-scroll">
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
        <button className="btn-sm" onClick={()=>setScreen('login')}>← Back</button>
        <div><div className="we-login-brand" style={{textAlign:'left'}}>WITHOUT EQUAL</div>
          <div style={{fontSize:15,fontWeight:700}}>First-Time Registration</div></div>
      </div>
      <div className="fg"><label className="we-label">Personnel Type</label>
        <div className="g2">{['Military','Civilian'].map(t=><button key={t} className="btn-sm" onClick={()=>updateReg('type',t)} style={{padding:10,borderColor:reg.type===t?'var(--amber)':'var(--border)',color:reg.type===t?'var(--amber)':'var(--dim)'}}>{t}</button>)}</div></div>
      {reg.type==='Military'
        ? <div className="fg"><label className="we-label">Rank</label><select className="we-input we-select" value={reg.rank} onChange={e=>updateReg('rank',e.target.value)}>{MIL_RANKS.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
        : <div className="fg"><label className="we-label">Title</label><select className="we-input we-select" value={reg.title} onChange={e=>updateReg('title',e.target.value)}>{CIV_TITLES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>}
      <div className="fg"><label className="we-label">Full Name</label><input className="we-input" placeholder="e.g. Wilson Low" value={reg.name} onChange={e=>updateReg('name',e.target.value)}/></div>
      <div className="fg"><label className="we-label">Group</label><select className="we-input we-select" value={reg.groupId} onChange={e=>updateReg('groupId',e.target.value)}>{GROUPS.map(g=><option key={g.id} value={g.id}>Grp {g.id} – {g.name}</option>)}</select></div>
      <div className="fg"><label className="we-label">Appointment</label><input className="we-input" placeholder="e.g. SO2 Current" value={reg.appt} onChange={e=>updateReg('appt',e.target.value)}/></div>
      <div className="fg"><label className="we-label">Mobile Number</label><input className="we-input" placeholder="e.g. 91234567" value={reg.mobile} onChange={e=>updateReg('mobile',e.target.value)}/></div>
      <div className="fg"><label className="we-label">Email</label><input className="we-input" placeholder="name@we.mil.sg" value={reg.email} onChange={e=>updateReg('email',e.target.value)}/></div>
      <div className="fg"><label className="we-label">Password</label><input className="we-input" type="password" placeholder="Min 6 characters" value={reg.password} onChange={e=>updateReg('password',e.target.value)}/></div>
      <div className="fg"><label className="we-label">Confirm Password</label><input className="we-input" type="password" placeholder="Repeat password" value={reg.confirm} onChange={e=>updateReg('confirm',e.target.value)}/></div>
      {regErr && <div className="we-login-err" style={{marginBottom:12}}>{regErr}</div>}
      <button className="btn btn-primary" onClick={handleRegister} disabled={regLoading}>{regLoading?'Registering…':'Register'}</button>
    </div>
  )
}
