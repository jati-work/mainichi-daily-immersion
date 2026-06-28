import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Cover from './pages/Cover'
import PaketList from './pages/PaketList'
import PaketDetail from './pages/PaketDetail'
import Jurnal from './pages/Jurnal'

const GATE_PASSWORD = import.meta.env.VITE_APP_PASSWORD || 'ganbatte'
const UNLOCK_KEY = 'immersion-unlocked'

function PasswordGate({ onUnlock }) {
  const [input, setInput] = useState('')
  const [salah, setSalah] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (input === GATE_PASSWORD) {
      localStorage.setItem(UNLOCK_KEY, '1')
      onUnlock()
    } else {
      setSalah(true)
      setInput('')
    }
  }

  return (
    <div className="cover">
      <div className="auth-box">
        <h2>🌿 Jurnal Immersion</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="password" placeholder="Kata sandi" value={input} autoFocus
            onChange={e => { setInput(e.target.value); setSalah(false) }}
          />
          {salah && <div className="auth-error">Kata sandinya salah, coba lagi.</div>}
          <button type="submit">Masuk</button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(UNLOCK_KEY) === '1')
  const [page, setPage] = useState('cover')
  const [activePaketId, setActivePaketId] = useState(null)
  const [ringkasan, setRingkasan] = useState({ jumlahPaket: 0, jumlahKata: 0, jumlahHariJurnal: 0 })

  useEffect(() => {
    if (!unlocked) return
    async function muatRingkasan() {
      const { count: jumlahPaket } = await supabase.from('paket').select('*', { count: 'exact', head: true })
      const { count: jumlahKata } = await supabase.from('kata').select('*', { count: 'exact', head: true })
      const { count: jumlahHariJurnal } = await supabase.from('jurnal').select('*', { count: 'exact', head: true })
      setRingkasan({ jumlahPaket: jumlahPaket || 0, jumlahKata: jumlahKata || 0, jumlahHariJurnal: jumlahHariJurnal || 0 })
    }
    muatRingkasan()
  }, [unlocked, page])

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />
  }

  function goTo(target) {
    setPage(target)
  }
  function openPaket(id) {
    setActivePaketId(id)
    setPage('paket-detail')
  }

  if (page === 'paket') {
    return <PaketList goTo={goTo} openPaket={openPaket} />
  }
  if (page === 'paket-detail') {
    return <PaketDetail paketId={activePaketId} goTo={goTo} />
  }
  if (page === 'jurnal') {
    return <Jurnal goTo={goTo} />
  }
  return (
    <Cover
      goTo={goTo}
      openPaket={openPaket}
      jumlahPaket={ringkasan.jumlahPaket}
      jumlahKata={ringkasan.jumlahKata}
      jumlahHariJurnal={ringkasan.jumlahHariJurnal}
    />
  )
}
