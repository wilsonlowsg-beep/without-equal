'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@/types/database'
import { displayName, lastName, GROUPS } from '@/lib/constants'
import SubmitStatus from './SubmitStatus'
import MyHistory from './MyHistory'
import GroupDashboard from './GroupDashboard'
import FormationDashboard from './FormationDashboard'
import TrendsView from './TrendsView'
import AdminDashboard from './AdminDashboard'
import LeaveManager from './LeaveManager'

type Tab = 'status' | 'history' | 'leave' | 'group' | 'formation' | 'trends' | 'admin'

const ROLE_TABS: Record<string, {key:Tab;label:string}[]> = {
  personnel: [{key:'status',label:'My Status'},{key:'leave',label:'My Leave'},{key:'history',label:'History'}],
  grouphead: [{key:'group',label:'My Group'},{key:'status',label:'My Status'},{key:'leave',label:'My Leave'},{key:'history',label:'History'}],
  ac3:       [{key:'formation',label:'Formation'},{key:'trends',label:'Trends'}],
  admin:     [{key:'admin',label:'Admin'},{key:'formation',label:'Dashboard'}],
}

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const i = setInterval(()=>setNow(new Date()),1000); return()=>clearInterval(i) }, [])
  const hh = String(now.getHours()).padStart(2,'0')
  const mm = String(now.getMinutes()).padStart(2,'0')
  const ss = String(now.getSeconds()).padStart(2,'0')
  return <span className="we-clock">{hh}{mm}:{ss}H</span>
}

function Toast({ msg, onDone }: { msg: string; onDone: ()=>void }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return ()=>clearTimeout(t) }, [])
  return <div className="we-toast-wrap"><div className="we-toast">{msg}</div></div>
}

const MOTIVATIONS = [
  { quote: 'Dismissed. Rest well — report sharp tomorrow.', sub: 'The formation stands as one.' },
  { quote: 'Fall out. Well done today.', sub: 'Without Equal — because average is never enough.' },
  { quote: 'Discipline is the soul of an army.', sub: 'See you on parade tomorrow.' },
  { quote: 'The strength of the unit is each individual member.', sub: 'Thank you for doing your part.' },
  { quote: 'Excellence is a habit, not an act.', sub: 'Another day, another standard upheld.' },
  { quote: 'A team above self.', sub: 'Rest well. The formation counts on you.' },
  { quote: 'Those who serve, serve with honour.', sub: 'Fall out — you\'ve earned it.' },
  { quote: 'Signed off. Until tomorrow.', sub: 'WITHOUT EQUAL — Hold the line.' },
]

function MotivationScreen({ name, onDone }: { name: string; onDone: ()=>void }) {
  const [m]       = useState(() => MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)])
  const [opacity, setOpacity] = useState(0)

  useEffect(() => {
    // Fade in
    const t1 = setTimeout(() => setOpacity(1), 50)
    // Auto-dismiss after 4.5s
    const t2 = setTimeout(() => onDone(), 4500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <div style={{
      position:'fixed', inset:0, background:'var(--bg)',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:32, textAlign:'center', opacity, transition:'opacity 0.6s ease', zIndex:9999,
    }}>
      <div style={{fontFamily:'var(--mono)',fontSize:9,letterSpacing:'0.25em',color:'var(--faint)',textTransform:'uppercase',marginBottom:32}}>
        WITHOUT EQUAL · DAILY READINESS
      </div>
      <div style={{fontSize:22,fontWeight:700,color:'var(--amber)',lineHeight:1.3,marginBottom:16,maxWidth:280}}>
        "{m.quote}"
      </div>
      <div style={{fontSize:13,color:'var(--dim)',marginBottom:40}}>{m.sub}</div>
      <div style={{fontSize:11,color:'var(--faint)',fontFamily:'var(--mono)'}}>Good {new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}, {name}.</div>
      <button
        onClick={onDone}
        style={{marginTop:32,fontSize:12,padding:'8px 24px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--dim)',cursor:'pointer',fontFamily:'var(--sans)'}}
      >
        Back to Login
      </button>
    </div>
  )
}

export default function AppShell({ user, onLogout }: { user: User; onLogout: ()=>void }) {
  const [toast,        setToast]    = useState<string|null>(null)
  const [showMotivation, setShowM]  = useState(false)
  const supabase = createClient()
  const defaultTab = ROLE_TABS[user.role]?.[0]?.key ?? 'status'
  const [activeTab, setTab] = useState<Tab>(defaultTab)
  const tabs = ROLE_TABS[user.role] ?? []

  const showToast = (msg: string) => { setToast(null); setTimeout(()=>setToast(msg),10) }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setShowM(true)
  }

  if (showMotivation) return (
    <MotivationScreen name={user.full_name.split(' ').pop() ?? user.full_name} onDone={onLogout} />
  )

  const grpName = GROUPS.find(g=>g.id===user.group_id)?.name ?? ''

  const renderContent = () => {
    switch(activeTab) {
      case 'status':    return <SubmitStatus   user={user} showToast={showToast} />
      case 'history':   return <MyHistory      user={user} />
      case 'leave':     return <LeaveManager   user={user} showToast={showToast} />
      case 'group':     return <GroupDashboard user={user} showToast={showToast} />
      case 'formation': return <FormationDashboard showToast={showToast} />
      case 'trends':    return <TrendsView />
      case 'admin':     return <AdminDashboard showToast={showToast} />
      default:          return null
    }
  }

  return (
    <div className="we-root">
      {/* TOPBAR */}
      <div className="we-topbar">
        <div className="we-brand">WITHOUT EQUAL</div>
        <div className="we-toprow">
          <div className="we-title">Daily Readiness</div>
          <Clock />
        </div>
        <div className="we-rule" />
        <div className="we-userline">{displayName(user)} · {grpName} · {user.appointment}</div>
      </div>

      {/* NAV */}
      <nav className="we-nav">
        {tabs.map(t => (
          <button key={t.key} className={`we-navbtn${activeTab===t.key?' active':''}`} onClick={()=>setTab(t.key)}>
            {t.label}
          </button>
        ))}
        <button className="we-navbtn" onClick={handleLogout} style={{flex:'0 0 auto',paddingLeft:14,paddingRight:14}}>
          Sign Out
        </button>
      </nav>

      {/* BODY */}
      <div className="we-body">{renderContent()}</div>

      {toast && <Toast msg={toast} onDone={()=>setToast(null)} />}
    </div>
  )
}
