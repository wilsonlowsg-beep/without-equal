'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@/types/database'

type Screen = 'login' | 'forgot1' | 'forgot2' | 'forgot3' | 'register'

const MIL_RANKS = ['BG','COL','LTC','MAJ','CPT','LTA','2LT','ME6','ME5','ME4','ME3','ME2','ME1','MSG','SSG','3SG','CFC','CPL','LCP','PTE','REC']
const CIV_TITLES = ['Mr','Ms','Mdm','Dr']
const GROUPS = [
  {id:0,name:'AC3'},
  {id:1,name:'Current'},
  {id:2,name:'Infor'},
  {id:3,name:'Civil'},
  {id:4,name:'Log'},
  {id:5,name:'Plans'},
]

// Convert mobile to internal email for Supabase Auth
// We use a fixed domain so it's always valid
function mobileToEmail(mobile: string): string {
  return `${mobile.trim()}@without-equal.app`
}

export default function LoginPage({ onLogin }: { onLogin: (u: User) => void }) {
  const [screen, setScreen] = useState<Screen>('login')
  const supabase = createClient()

  // LOGIN
  const [mobile,    setMobile]    = useState('')
  const [pass,      setPass]      = useState('')
  const [loginErr,  setLoginErr]  = useState('')
  const [loginLoad, setLoginLoad] = useState(false)
  const [successMsg,setSuccessMsg]= useState('')

  // FORGOT
  const [forgotMobile, setForgotMobile] = useState('')
  const [forgotOtp,    setForgotOtp]    = useState('')
  const [sentOtp,      setSentOtp]      = useState('')
  const [newPass,      setNewPass]      = useState('')
  const [confirmPass,  setConfirmPass]  = useState('')
  const [forgotErr,    setForgotErr]    = useState('')
  const [forgotMsg,    setForgotMsg]    = useState('')

  // REGISTER
  const [reg, setReg] = useState({
    type:'Military', rank:'MAJ', title:'Mr',
    name:'', groupId:1, appt:'', mobile:'', password:'', confirm:''
  })
  const [regErr,  setRegErr]  = useState('')
  const [regLoad, setRegLoad] = useState(false)
  const updateReg = (k: string, v: any) => setReg(r => ({...r,[k]:v}))

  // ── LOGIN ──────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!mobile.trim() || !pass) { setLoginErr('Enter your mobile number and password.'); return }
    setLoginLoad(true); setLoginErr('')

    const email = mobileToEmail(mobile)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass })

    if (error || !data.user) {
      setLoginErr('Invalid mobile number or password.')
      setLoginLoad(false); return
    }

    const { data: u } = await supabase
      .from('users')
      .select('*, group:groups(*)')
      .eq('id', data.user.id)
      .single()

    if (u) onLogin(u)
    setLoginLoad(false)
  }

  // ── FORGOT ─────────────────────────────────────────────────
  const handleForgotLookup = async () => {
    setForgotErr('')
    const { data: u } = await supabase
      .from('users')
      .select('id, mobile')
      .eq('mobile', forgotMobile.trim())
      .single()

    if (!u) { setForgotErr('No account found with that mobile number.'); return }
    const code = String(Math.floor(100000 + Math.random() * 900000))
    setSentOtp(code)
    setForgotMsg(`OTP generated. In production this is sent via SMS. Demo code: ${code}`)
    setScreen('forgot2')
  }

  const handleOtpVerify = () => {
    if (forgotOtp.trim() !== sentOtp) { setForgotErr('Incorrect OTP.'); return }
    setForgotErr(''); setScreen('forgot3')
  }

  const handlePasswordReset = async () => {
    if (newPass.length < 6)       { setForgotErr('Min 6 characters.'); return }
    if (newPass !== confirmPass)   { setForgotErr('Passwords do not match.'); return }
    const { error } = await supabase.auth.updateUser({ password: newPass })
    if (error) { setForgotErr('Reset failed. Try signing in again.'); return }
    setSuccessMsg('Password reset. Sign in with your new password.')
    setScreen('login')
  }

  // ── REGISTER ───────────────────────────────────────────────
  const handleRegister = async () => {
    if (!reg.name.trim())   { setRegErr('Full name is required.'); return }
    if (!reg.appt.trim())   { setRegErr('Appointment is required.'); return }
    if (!reg.mobile.trim()) { setRegErr('Mobile number is required.'); return }
    if (!/^\d{8}$/.test(reg.mobile.trim())) { setRegErr('Enter a valid 8-digit Singapore mobile number.'); return }
    if (!reg.password)      { setRegErr('Password is required.'); return }
    if (reg.password.length < 6)  { setRegErr('Password must be at least 6 characters.'); return }
    if (reg.password !== reg.confirm) { setRegErr('Passwords do not match.'); return }

    setRegLoad(true); setRegErr('')

    // Check for duplicate mobile
    const { data: dup } = await supabase
      .from('users').select('id').eq('mobile', reg.mobile.trim()).single()
    if (dup) { setRegErr('This mobile number is already registered.'); setRegLoad(false); return }

    // Sign up using mobile-as-email pattern
    const authEmail = mobileToEmail(reg.mobile)
    const { data, error } = await supabase.auth.signUp({
      email:    authEmail,
      password: reg.password,
    })

    if (error || !data.user) {
      setRegErr(error?.message ?? 'Registration failed. Please try again.')
      setRegLoad(false); return
    }

    // Confirm immediately (no email needed)
    // Insert user profile
    const { error: profileErr } = await supabase.from('users').insert({
      id:             data.user.id,
      personnel_type: reg.type as any,
      rank:           reg.type === 'Military' ? reg.rank  : null,
      title:          reg.type === 'Civilian' ? reg.title : null,
      full_name:      reg.name.trim(),
      group_id:       Number(reg.groupId),
      appointment:    reg.appt.trim(),
      mobile:         reg.mobile.trim(),
      email:          authEmail,
      role:           'personnel',
    })

    if (profileErr) {
      setRegErr('Profile error: ' + profileErr.message)
      setRegLoad(false); return
    }

    setSuccessMsg(`Registered! Sign in with mobile ${reg.mobile.trim()} and your password.`)
    setScreen('login')
    setRegLoad(false)
  }

  // ── RENDER LOGIN ───────────────────────────────────────────
  if (screen === 'login') return (
    <div className="we-center">
      <div className="we-login-brand">WITHOUT EQUAL</div>
      <div className="we-login-ttl">Daily Readiness</div>
      <div className="we-login-rule" />
      {successMsg && (
        <div style={{color:'var(--green)',fontSize:12,textAlign:'center',marginBottom:16,lineHeight:1.6,padding:'10px 12px',background:'rgba(22,169,107,0.08)',borderRadius:8,border:'1px solid rgba(22,169,107,0.2)'}}>
          {successMsg}
        </div>
      )}
      <div className="fg">
        <label className="we-label">Mobile Number</label>
        <input className="we-input" placeholder="e.g. 97761277" inputMode="numeric"
          value={mobile} onChange={e=>setMobile(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()} />
      </div>
      <div className="fg">
        <label className="we-label">Password</label>
        <input className="we-input" type="password" placeholder="Password"
          value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()} />
      </div>
      <button className="btn btn-primary" onClick={handleLogin} disabled={loginLoad}>
        {loginLoad ? 'Signing in…' : 'Sign In'}
      </button>
      {loginErr && <div className="we-login-err">{loginErr}</div>}
      <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'center'}}>
        <button className="btn-sm" onClick={()=>{setForgotErr('');setForgotMsg('');setScreen('forgot1')}}>Forgot Password?</button>
        <button className="btn-sm" onClick={()=>{setRegErr('');setScreen('register')}}>Register</button>
      </div>
      <div style={{marginTop:20,fontSize:11,color:'var(--faint)',textAlign:'center',lineHeight:1.6}}>
        Sign in with your mobile number and password.<br/>No email required.
      </div>
    </div>
  )

  // ── FORGOT STEP 1 ──────────────────────────────────────────
  if (screen === 'forgot1') return (
    <div className="we-center">
      <div className="we-login-brand">WITHOUT EQUAL</div>
      <div className="we-login-ttl">Reset Password</div>
      <div className="we-login-rule" />
      <div style={{fontSize:13,color:'var(--dim)',marginBottom:16,textAlign:'center',lineHeight:1.6}}>
        Enter your registered mobile number.
      </div>
      <div className="fg">
        <label className="we-label">Mobile Number</label>
        <input className="we-input" placeholder="e.g. 97761277" inputMode="numeric"
          value={forgotMobile} onChange={e=>setForgotMobile(e.target.value)} />
      </div>
      {forgotErr && <div className="we-login-err">{forgotErr}</div>}
      <button className="btn btn-primary" onClick={handleForgotLookup} disabled={!forgotMobile.trim()}>Send OTP</button>
      <div style={{marginTop:12,textAlign:'center'}}><button className="btn-sm" onClick={()=>setScreen('login')}>← Back</button></div>
    </div>
  )

  // ── FORGOT STEP 2 ──────────────────────────────────────────
  if (screen === 'forgot2') return (
    <div className="we-center">
      <div className="we-login-brand">WITHOUT EQUAL</div>
      <div className="we-login-ttl">Enter OTP</div>
      <div className="we-login-rule" />
      {forgotMsg && (
        <div className="we-otp-hint" style={{textAlign:'center',marginBottom:16,lineHeight:1.6}}>{forgotMsg}</div>
      )}
      <div className="fg">
        <label className="we-label">6-Digit OTP</label>
        <input className="we-input" placeholder="Enter OTP" maxLength={6} inputMode="numeric"
          value={forgotOtp} onChange={e=>setForgotOtp(e.target.value)} />
      </div>
      {forgotErr && <div className="we-login-err">{forgotErr}</div>}
      <button className="btn btn-primary" onClick={handleOtpVerify} disabled={forgotOtp.length<6}>Verify OTP</button>
      <div style={{marginTop:12,textAlign:'center'}}><button className="btn-sm" onClick={()=>setScreen('forgot1')}>← Back</button></div>
    </div>
  )

  // ── FORGOT STEP 3 ──────────────────────────────────────────
  if (screen === 'forgot3') return (
    <div className="we-center">
      <div className="we-login-brand">WITHOUT EQUAL</div>
      <div className="we-login-ttl">New Password</div>
      <div className="we-login-rule" />
      <div className="fg">
        <label className="we-label">New Password</label>
        <input className="we-input" type="password" placeholder="Min 6 characters"
          value={newPass} onChange={e=>setNewPass(e.target.value)} />
      </div>
      <div className="fg">
        <label className="we-label">Confirm Password</label>
        <input className="we-input" type="password" placeholder="Repeat password"
          value={confirmPass} onChange={e=>setConfirmPass(e.target.value)} />
      </div>
      {forgotErr && <div className="we-login-err">{forgotErr}</div>}
      <button className="btn btn-primary" onClick={handlePasswordReset} disabled={!newPass||!confirmPass}>
        Set New Password
      </button>
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
            <button key={t} className="btn-sm" onClick={()=>updateReg('type',t)}
              style={{padding:10,borderColor:reg.type===t?'var(--amber)':'var(--border)',color:reg.type===t?'var(--amber)':'var(--dim)'}}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {reg.type === 'Military'
        ? <div className="fg"><label className="we-label">Rank</label>
            <select className="we-input we-select" value={reg.rank} onChange={e=>updateReg('rank',e.target.value)}>
              {MIL_RANKS.map(r=><option key={r} value={r}>{r}</option>)}
            </select></div>
        : <div className="fg"><label className="we-label">Title</label>
            <select className="we-input we-select" value={reg.title} onChange={e=>updateReg('title',e.target.value)}>
              {CIV_TITLES.map(t=><option key={t} value={t}>{t}</option>)}
            </select></div>
      }

      <div className="fg"><label className="we-label">Full Name</label>
        <input className="we-input" placeholder="e.g. Wilson Low" value={reg.name}
          onChange={e=>updateReg('name',e.target.value)} /></div>

      <div className="fg"><label className="we-label">Group</label>
        <select className="we-input we-select" value={reg.groupId} onChange={e=>updateReg('groupId',e.target.value)}>
          {GROUPS.map(g=><option key={g.id} value={g.id}>Grp {g.id} – {g.name}</option>)}
        </select></div>

      <div className="fg"><label className="we-label">Appointment</label>
        <input className="we-input" placeholder="e.g. SO2 Current" value={reg.appt}
          onChange={e=>updateReg('appt',e.target.value)} /></div>

      <div className="fg"><label className="we-label">Mobile Number</label>
        <input className="we-input" placeholder="8-digit Singapore number e.g. 91234567"
          inputMode="numeric" value={reg.mobile} onChange={e=>updateReg('mobile',e.target.value)} /></div>

      <div style={{background:'var(--surf-hi)',borderRadius:8,padding:'10px 12px',marginBottom:12,fontSize:11,color:'var(--dim)',lineHeight:1.6}}>
        ℹ️ No email needed. Your mobile number is your login ID.
      </div>

      <div className="fg"><label className="we-label">Password</label>
        <input className="we-input" type="password" placeholder="Min 6 characters" value={reg.password}
          onChange={e=>updateReg('password',e.target.value)} /></div>

      <div className="fg"><label className="we-label">Confirm Password</label>
        <input className="we-input" type="password" placeholder="Repeat password" value={reg.confirm}
          onChange={e=>updateReg('confirm',e.target.value)} /></div>

      {regErr && <div className="we-login-err" style={{marginBottom:12}}>{regErr}</div>}

      <button className="btn btn-primary" onClick={handleRegister} disabled={regLoad}>
        {regLoad ? 'Registering…' : 'Register'}
      </button>
    </div>
  )
}
