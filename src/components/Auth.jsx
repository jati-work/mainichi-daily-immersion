import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const fn = mode === 'login'
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password })
    const { error } = await fn
    setLoading(false)
    if (error) setError(error.message)
    else if (mode === 'signup') setError('Cek email kamu buat konfirmasi akun, lalu login.')
  }

  return (
    <div className="cover">
      <div className="auth-box">
        <h2>🌿 Jurnal Immersion</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} required
          />
          <input
            type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)} required minLength={6}
          />
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Tunggu...' : mode === 'login' ? 'Masuk' : 'Daftar'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: '#7aaa8a', cursor: 'pointer' }}
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
          {mode === 'login' ? 'Belum punya akun? Daftar dulu' : 'Sudah punya akun? Masuk'}
        </div>
      </div>
    </div>
  )
}
