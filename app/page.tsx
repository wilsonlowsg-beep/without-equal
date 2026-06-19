'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@/types/database'
import LoginPage from '@/components/LoginPage'
import AppShell from '@/components/AppShell'

export default function Home() {
  const [user,    setUser]    = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // Timeout — never hang on loading longer than 5 seconds
    const timeout = setTimeout(() => setLoading(false), 5000)

    const loadUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data } = await supabase
            .from('users')
            .select('*, group:groups(*)')
            .eq('id', session.user.id)
            .single()
          setUser(data ?? null)
        }
      } catch(e) {
        // Session error — go to login
      } finally {
        clearTimeout(timeout)
        setLoading(false)
      }
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
        setUser(data ?? null)
      }
    })

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  if (loading) return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      minHeight:'100dvh', background:'#08111C', gap:16,
    }}>
      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,letterSpacing:'.22em',textTransform:'uppercase',color:'#3A5470'}}>
        WITHOUT EQUAL
      </div>
      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:'#7A9AB8',letterSpacing:'.1em'}}>
        LOADING…
      </div>
      <div style={{fontSize:11,color:'#3A5470',marginTop:8}}>
        Taking too long?{' '}
        <button onClick={()=>setLoading(false)} style={{color:'#E8A020',background:'none',border:'none',cursor:'pointer',fontSize:11,textDecoration:'underline'}}>
          Go to login
        </button>
      </div>
    </div>
  )

  if (!user) return <LoginPage onLogin={setUser} />
  return <AppShell user={user} onLogout={() => setUser(null)} />
}
