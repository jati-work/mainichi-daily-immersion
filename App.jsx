import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './components/Auth'
import Cover from './pages/Cover'
import PaketList from './pages/PaketList'
import PaketDetail from './pages/PaketDetail'
import Jurnal from './pages/Jurnal'

export default function App() {
  const [session, setSession] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [page, setPage] = useState('cover') // 'cover' | 'paket' | 'paket-detail' | 'jurnal'
  const [activePaketId, setActivePaketId] = useState(null)
  const [ringkasan, setRingkasan] = useState({ jumlahPaket: 0, jumlahKata: 0, jumlahHariJurnal: 0 })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoadingSession(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    async function muatRingkasan() {
      const userId = session.user.id
      const { count: jumlahPaket } = await supabase.from('paket').select('*', { count: 'exact', head: true }).eq('user_id', userId)
      const { count: jumlahKata } = await supabase.from('kata').select('*', { count: 'exact', head: true }).eq('user_id', userId)
      const { count: jumlahHariJurnal } = await supabase.from('jurnal').select('*', { count: 'exact', head: true }).eq('user_id', userId)
      setRingkasan({ jumlahPaket: jumlahPaket || 0, jumlahKata: jumlahKata || 0, jumlahHariJurnal: jumlahHariJurnal || 0 })
    }
    muatRingkasan()
  }, [session, page])

  if (loadingSession) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#9abaa8' }}>Memuat...</div>
  }

  if (!session) return <Auth />

  const userId = session.user.id

  function goTo(target) {
    setPage(target)
  }
  function openPaket(id) {
    setActivePaketId(id)
    setPage('paket-detail')
  }

  if (page === 'paket') {
    return <PaketList goTo={goTo} openPaket={openPaket} userId={userId} />
  }
  if (page === 'paket-detail') {
    return <PaketDetail paketId={activePaketId} goTo={goTo} userId={userId} />
  }
  if (page === 'jurnal') {
    return <Jurnal goTo={goTo} userId={userId} />
  }
  return (
    <Cover
      goTo={goTo}
      jumlahPaket={ringkasan.jumlahPaket}
      jumlahKata={ringkasan.jumlahKata}
      jumlahHariJurnal={ringkasan.jumlahHariJurnal}
    />
  )
}
