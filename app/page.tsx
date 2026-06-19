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
    const timeout = setTimeout(() => {
      setLoading(false)
    }, 4000)

    const loadUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data, error } = await supabase
            .from('users')
            .select('*, group:groups(*)')
            .eq('id', session.user.id)
            .single()
          if (error || !data) {
            // Profile not found — sign out and go to login
            await supabase.auth.signOut()
            setUser(null)
          } else {
            setUser(data)
          }
        }
      } catch(e) {
        await supabase.auth.signOut()
        setUser(null)
      } finally {
        clearTimeout(timeout)
        setLoading(false)
      }
    }

    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') { setUser(null); return }
        if (event === 'SIGNED_IN' && session?.user) {
          const { data, error } = await supabase
            .from('users')
            .select('*, group:groups(*)')
            .eq('id', session.user.id)
            .single()
          if (error || !data) {
            await supabase.auth.signOut()
            setUser(null)
          } else {
            setUser(data)
          }
        }
      }
    )

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  if (loading) return (
    <div style={{
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      minHeight:'100dvh', background:'#08111C', gap:16,
    }}>
      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,
        letterSpacing:'.22em',textTransform:'uppercase',color:'#3A5470'}}>
        WITHOUT EQUAL
      </div>
      <div style={{fontFamily:"'JetBrains Mono',monospace",
        fontSize:12,color:'#7A9AB8',letterSpacing:'.1em'}}>
        LOADING…
      </div>
      <button
        onClick={async () => {
          await supabase.auth.signOut()
          setLoading(false)
        }}
        style={{
          marginTop:8, color:'#E8A020', background:'none',
          border:'none', cursor:'pointer', fontSize:11,
          textDecoration:'underline', fontFamily:'inherit',
        }}>
        Taking too long? Click here
      </button>
    </div>
  )

  if (!user) return <LoginPage onLogin={setUser} />
  return <AppShell user={user} onLogout={() => setUser(null)} />
}
