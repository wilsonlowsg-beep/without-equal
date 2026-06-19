'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@/types/database'
import { displayName, isProfileComplete, normalizeRole, userMetaLine } from '@/lib/constants'
import SubmitStatus from './SubmitStatus'
import MyHistory from './MyHistory'
import GroupDashboard from './GroupDashboard'
import FormationDashboard from './FormationDashboard'
import TrendsView from './TrendsView'
import AdminDashboard from './AdminDashboard'
import LeaveManager from './LeaveManager'
import ProfileCompletion from './ProfileCompletion'

type Tab = 'status' | 'history' | 'leave' | 'group' | 'formation' | 'trends' | 'admin'

const ROLE_TABS: Record<string, {key:Tab;label:string}[]> = {
  user:      [{key:'status',label:'My Status'},{key:'leave',label:'My Leave'},{key:'history',label:'History'}],
  commander: [{key:'group',label:'My Group'},{key:'formation',label:'Formation'},{key:'trends',label:'Trends'},{key:'status',label:'My Status'},{key:'leave',label:'My Leave'},{key:'history',label:'History'}],
  admin:     [{key:'admin',label:'Admin'},{key:'formation',label:'Dashboard'},{key:'trends',label:'Trends'}],
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

export default function AppShell({ user, onLogout, onUserUpdate }: { user: User; onLogout: ()=>void; onUserUpdate:(user:User)=>void }) {
  const [toast, setToast]   = useState<string|null>(null)
  const supabase = createClient()
  const appRole = normalizeRole(user.role)
  const defaultTab = ROLE_TABS[appRole]?.[0]?.key ?? 'status'
  const [activeTab, setTab] = useState<Tab>(defaultTab)
  const tabs = ROLE_TABS[appRole] ?? []

  const showToast = (msg: string) => { setToast(null); setTimeout(()=>setToast(msg),10) }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    onLogout()
  }

  if (!isProfileComplete(user)) {
    return <ProfileCompletion user={user} onComplete={onUserUpdate} onLogout={handleLogout} />
  }

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
        <div className="we-userline">{displayName(user)} · {userMetaLine(user)}</div>
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
