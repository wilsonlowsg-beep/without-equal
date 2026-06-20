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
  // LOYALTY TO COUNTRY
  { quote: "Singapore's security begins with our readiness.", sub: "Loyalty to Country." },
  { quote: "Duty to nation comes before convenience.", sub: "Loyalty to Country." },
  { quote: "Every task contributes to our nation's defence.", sub: "Loyalty to Country." },
  { quote: "Serve with pride. Protect with purpose.", sub: "Loyalty to Country." },
  { quote: "Readiness honours the trust of our nation.", sub: "Loyalty to Country." },
  { quote: "Our commitment safeguards Singapore's future.", sub: "Loyalty to Country." },
  { quote: "The mission matters because Singapore matters.", sub: "Loyalty to Country." },
  { quote: "National security starts with personal responsibility.", sub: "Loyalty to Country." },
  { quote: "The flag reminds us who we serve.", sub: "Loyalty to Country." },
  { quote: "Prepared today. Trusted by the nation tomorrow.", sub: "Loyalty to Country." },
  // LEADERSHIP
  { quote: "Leadership starts with personal example.", sub: "Leadership." },
  { quote: "People follow actions before words.", sub: "Leadership." },
  { quote: "Set the standard. Others will follow.", sub: "Leadership." },
  { quote: "A leader creates clarity amid uncertainty.", sub: "Leadership." },
  { quote: "Influence is earned through trust.", sub: "Leadership." },
  { quote: "The team reflects its leader.", sub: "Leadership." },
  { quote: "Lead with conviction and humility.", sub: "Leadership." },
  { quote: "Good leaders develop other leaders.", sub: "Leadership." },
  { quote: "Leadership is service, not privilege.", sub: "Leadership." },
  { quote: "Ownership inspires confidence.", sub: "Leadership." },
  // DISCIPLINE
  { quote: "Discipline turns standards into habits.", sub: "Discipline." },
  { quote: "Do the right thing every time.", sub: "Discipline." },
  { quote: "Consistency is discipline in action.", sub: "Discipline." },
  { quote: "Small habits produce big outcomes.", sub: "Discipline." },
  { quote: "Discipline remains when motivation fades.", sub: "Discipline." },
  { quote: "Attention to detail reflects discipline.", sub: "Discipline." },
  { quote: "High standards require daily effort.", sub: "Discipline." },
  { quote: "Professional excellence begins with discipline.", sub: "Discipline." },
  { quote: "Reliability is earned through discipline.", sub: "Discipline." },
  { quote: "Train hard. Maintain standards.", sub: "Discipline." },
  // PROFESSIONALISM
  { quote: "Competence builds confidence.", sub: "Professionalism." },
  { quote: "Master your craft before it is needed.", sub: "Professionalism." },
  { quote: "Preparation is the mark of a professional.", sub: "Professionalism." },
  { quote: "Know your role. Know it well.", sub: "Professionalism." },
  { quote: "Professional pride drives excellence.", sub: "Professionalism." },
  { quote: "Never stop learning.", sub: "Professionalism." },
  { quote: "Excellence is a professional obligation.", sub: "Professionalism." },
  { quote: "Competence inspires trust.", sub: "Professionalism." },
  { quote: "Prepared professionals perform under pressure.", sub: "Professionalism." },
  { quote: "Train beyond the minimum standard.", sub: "Professionalism." },
  // FIGHTING SPIRIT
  { quote: "Challenges reveal our resolve.", sub: "Fighting Spirit." },
  { quote: "Persist when others would quit.", sub: "Fighting Spirit." },
  { quote: "Adversity tests character and commitment.", sub: "Fighting Spirit." },
  { quote: "Stay focused under pressure.", sub: "Fighting Spirit." },
  { quote: "Resilience is strength in action.", sub: "Fighting Spirit." },
  { quote: "Every setback is a lesson.", sub: "Fighting Spirit." },
  { quote: "Maintain momentum despite obstacles.", sub: "Fighting Spirit." },
  { quote: "The mission continues despite difficulty.", sub: "Fighting Spirit." },
  { quote: "Courage is action despite uncertainty.", sub: "Fighting Spirit." },
  { quote: "Never underestimate determined people.", sub: "Fighting Spirit." },
  // ETHICS
  { quote: "Integrity matters when nobody is watching.", sub: "Ethics." },
  { quote: "Trust is built through ethical conduct.", sub: "Ethics." },
  { quote: "Choose what is right, not easy.", sub: "Ethics." },
  { quote: "Character is revealed through decisions.", sub: "Ethics." },
  { quote: "Values guide actions under pressure.", sub: "Ethics." },
  { quote: "Honour your commitments.", sub: "Ethics." },
  { quote: "Integrity creates credibility.", sub: "Ethics." },
  { quote: "Ethics remain constant in changing circumstances.", sub: "Ethics." },
  // CARE FOR SOLDIERS
  { quote: "People are our greatest strength.", sub: "Care for Soldiers." },
  { quote: "Strong teams are built on trust.", sub: "Care for Soldiers." },
  { quote: "Take care of your people.", sub: "Care for Soldiers." },
  { quote: "Mission success starts with caring leaders.", sub: "Care for Soldiers." },
  { quote: "Know your people. Support your people.", sub: "Care for Soldiers." },
  { quote: "Trust grows through genuine care.", sub: "Care for Soldiers." },
  { quote: "Every soldier deserves respect and dignity.", sub: "Care for Soldiers." },
  { quote: "Caring leaders build resilient teams.", sub: "Care for Soldiers." },
  { quote: "Invest in people before you need them.", sub: "Care for Soldiers." },
  { quote: "Strong teams care for one another.", sub: "Care for Soldiers." },
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

  const handleLogout = () => {
    // Show motivation first — sign out only after it's dismissed
    setShowM(true)
  }

  if (showMotivation) return (
    <MotivationScreen
      name={user.full_name.split(' ').pop() ?? user.full_name}
      onDone={async () => {
        await supabase.auth.signOut()
        onLogout()
      }}
    />
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
