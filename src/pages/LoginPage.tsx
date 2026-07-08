import { useState, type FormEvent } from 'react'
import { TrendingUp, LogIn, UserPlus } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [signupSuccess, setSignupSuccess] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result =
      mode === 'login'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password)

    setLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    if (mode === 'signup') {
      setSignupSuccess(true)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-surface-950 via-surface-900 to-brand-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/30">
            <TrendingUp className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Trade Journal</h1>
          <p className="mt-2 text-sm text-slate-400">
            登录后可在任意设备同步你的交易数据
          </p>
        </div>

        <div className="rounded-2xl border border-surface-700 bg-surface-900/80 p-6 shadow-xl backdrop-blur-sm sm:p-8">
          {signupSuccess ? (
            <div className="text-center">
              <p className="text-green-400 font-medium">注册成功！</p>
              <p className="mt-2 text-sm text-slate-400">
                请查收邮件确认账号（如 Supabase 开启了邮件验证），然后登录。
              </p>
              <button
                type="button"
                onClick={() => {
                  setSignupSuccess(false)
                  setMode('login')
                }}
                className="mt-4 text-sm text-brand-400 hover:text-brand-300"
              >
                返回登录
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6 flex rounded-lg bg-surface-800 p-1">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${
                    mode === 'login'
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <LogIn className="h-4 w-4" />
                  登录
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${
                    mode === 'signup'
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserPlus className="h-4 w-4" />
                  注册
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                    邮箱
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2.5 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="your@email.com"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                    密码
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2.5 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="至少 6 位"
                  />
                </div>

                {error && (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
                >
                  {loading ? '请稍候…' : mode === 'login' ? '登录' : '注册'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          免费云端存储 · 多设备实时同步
        </p>
      </div>
    </div>
  )
}
