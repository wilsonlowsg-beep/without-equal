'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@/types/database'
import LoginPage from '@/components/LoginPage'
import AppShell from '@/components/AppShell'

export default function Home() {
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const loadUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data } = await supabase
          .from('users')
          .select('*, group:groups(*)')
          .eq('id', session.user.id)
          .single()
        setUser(data)
      }
      setLoading(false)
    }
    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') { setUser(null); return }
      if (session?.user) {
        const { data } = await supabase
          .from('users')
          .select('*, group:groups(*)')
          .eq('id', session.user.id)
          .single()
        setUser(data)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div className="we-loading">
      <div>
        <div style={{fontFamily:'var(--mono)',fontSize:9,letterSpacing:'.22em',textTransform:'uppercase',color:'var(--faint)',textAlign:'center',marginBottom:8}}>WITHOUT EQUAL</div>
        <div className="we-loading-text">LOADING…</div>
      </div>
    </div>
  )

  if (!user) return <LoginPage onLogin={setUser} />
  return <AppShell user={user} onLogout={() => setUser(null)} />
}
