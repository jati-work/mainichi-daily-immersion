import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const NAMA_HARI = ['Min','Sen','Sel','Rab','Kam','Jum','Sab']

function pad2(n) { return n < 10 ? '0' + n : '' + n }
function dateKey(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}` }

export default function Jurnal({ goTo }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [aktivitasSet, setAktivitasSet] = useState(new Set())

  async function muat() {
    const { data } = await supabase.from('aktivitas_harian').select('tanggal')
    setAktivitasSet(new Set((data || []).map(a => a.tanggal)))
  }
  useEffect(() => { muat() }, [])

  function geser(dir) {
    let m = month + dir, y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setMonth(m); setYear(y)
  }

  const firstDow = new Date(year, month, 1).getDay()
  const totalDays = new Date(year, month + 1, 0).getDate()
  const isThisMonth = now.getFullYear() === year && now.getMonth() === month
  const sel = Array.from({ length: totalDays }, (_, i) => i + 1)
  const filledCount = sel.filter(d => aktivitasSet.has(dateKey(year, month, d))).length

  function hitungStreak() {
    let d = new Date()
    const keyHariIni = dateKey(d.getFullYear(), d.getMonth(), d.getDate())
    const aktifHariIni = aktivitasSet.has(keyHariIni)
    if (!aktifHariIni) d.setDate(d.getDate() - 1)
    let streak = 0
    while (true) {
      const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate())
      if (aktivitasSet.has(key)) { streak++; d.setDate(d.getDate() - 1) } else break
    }
    return { streak, aktifHariIni }
  }

  return (
    <div>
      <div className="header-bar">
        <div className="title">📅 Kalender Aktivitas</div>
        <div className="stats">{filledCount}/{totalDays} hari aktif bulan ini</div>
        <button className="icon-btn" onClick={() => goTo('cover')} title="Kembali">←</button>
      </div>

      <div className="cal-wrap">
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => geser(-1)}>←</button>
          <div style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, color: '#2d6a4a' }}>
            {NAMA_BULAN[month]} {year}
          </div>
          <button className="icon-btn" onClick={() => geser(1)}>→</button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, marginBottom: 10 }}>
          {(() => {
            const { streak, aktifHariIni } = hitungStreak()
            if (streak === 0) return <span style={{ color: '#8aaf8a' }}>Belum ada streak — mulai hari ini!</span>
            return (
              <span style={{ color: aktifHariIni ? '#8aaf8a' : '#9a9a9a' }}>
                <span style={{ filter: aktifHariIni ? 'none' : 'grayscale(100%)' }}>🔥</span> Streak {streak} hari berturut-turut
                {!aktifHariIni && ' — ayo belajar!'}
              </span>
            )
          })()}
        </div>
        <div className="cal-grid">
          {NAMA_HARI.map(h => <div key={h} className="cal-dow">{h}</div>)}
          {Array.from({ length: firstDow }).map((_, i) => <div key={'e' + i} />)}
          {sel.map(d => {
            const key = dateKey(year, month, d)
            const isToday = isThisMonth && d === now.getDate()
            const adaAktivitas = aktivitasSet.has(key)
            return (
              <div
                key={key}
                className={`cal-cell ${adaAktivitas ? 'filled' : ''} ${isToday ? 'today' : ''}`}
                title={adaAktivitas ? 'Ada aktivitas belajar hari ini' : 'Belum ada aktivitas'}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>{d}</div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, fontSize: 10.5, color: '#9abaa8' }}>
          🟩 ada aktivitas belajar (kata yang ditandain hafal)
        </div>
      </div>
    </div>
  )
}
