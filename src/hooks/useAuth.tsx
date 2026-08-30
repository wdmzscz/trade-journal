import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { getSupabase, isCloudEnabled } from '../lib/supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isCloudEnabled())

  useEffect(() => {
    if (!isCloudEnabled()) {
      setLoading(false)
      return
    }

    let cancelled = false
    const timeouts: ReturnType<typeof setTimeout>[] = []
    const supabase = getSupabase()

    // 只监听 onAuthStateChange（会发 INITIAL_SESSION）。
    // 回调期间 supabase-js 会持有 auth lock，立刻打 PostgREST 会永久挂起。
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      const timer = setTimeout(() => {
        if (cancelled) return
        setSession(s)
        setUser(s?.user ?? null)
        setLoading(false)
      }, 0)
      timeouts.push(timer)
    })

    return () => {
      cancelled = true
      timeouts.forEach(clearTimeout)
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signUp({ email, password })
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut()
  }, [])

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
