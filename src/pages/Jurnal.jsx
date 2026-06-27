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
  const [entries, setEntries] = useState({}) // {tanggal: catatan}
  const [editKey, setEditKey] = useState(null)
  const [editText, setEditText] = useState('')

  async function muat() {
    const { data } = await supabase.from('jurnal').select('tanggal, catatan')
    const map = {}
    ;(data || []).forEach(r => { map[r.tanggal] = r.catatan })
    setEntries(map)
  }
  useEffect(() => { muat() }, [])

  function geser(dir) {
    let m = month + dir, y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setMonth(m); setYear(y)
  }

  async function simpan() {
    const text = editText.trim()
    if (text) {
      await supabase.from('jurnal').upsert({ tanggal: editKey, catatan: text }, { onConflict: 'tanggal' })
    } else {
      await supabase.from('jurnal').delete().eq('tanggal', editKey)
    }
    setEditKey(null)
    muat()
  }

  const firstDow = new Date(year, month, 1).getDay()
  const totalDays = new Date(year, month + 1, 0).getDate()
  const isThisMonth = now.getFullYear() === year && now.getMonth() === month
  const sel = Array.from({ length: totalDays }, (_, i) => i + 1)
  const filledCount = sel.filter(d => entries[dateKey(year, month, d)]).length

  function hitungStreak() {
    let streak = 0
    let d = new Date()
    while (true) {
      const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate())
      if (entries[key]) { streak++; d.setDate(d.getDate() - 1) } else break
    }
    return streak
  }

  return (
    <div>
      <div className="header-bar">
        <button className="icon-btn" onClick={() => goTo('cover')} title="Kembali">←</button>
        <div className="title">📅 Jurnal Kalender</div>
        <div className="stats">{filledCount}/{totalDays} hari terisi bulan ini</div>
      </div>

      <div className="cal-wrap">
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => geser(-1)}>←</button>
          <div style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, color: '#2d6a4a' }}>
            {NAMA_BULAN[month]} {year}
          </div>
          <button className="icon-btn" onClick={() => geser(1)}>→</button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#8aaf8a', marginBottom: 10 }}>
          {hitungStreak() > 0 ? `🔥 Streak ${hitungStreak()} hari berturut-turut` : 'Belum ada streak — mulai hari ini!'}
        </div>
        <div className="cal-grid">
          {NAMA_HARI.map(h => <div key={h} className="cal-dow">{h}</div>)}
          {Array.from({ length: firstDow }).map((_, i) => <div key={'e' + i} />)}
          {sel.map(d => {
            const key = dateKey(year, month, d)
            const isToday = isThisMonth && d === now.getDate()
            const hasNote = !!entries[key]
            return (
              <div
                key={key}
                className={`cal-cell ${hasNote ? 'filled' : ''} ${isToday ? 'today' : ''}`}
                title={hasNote ? entries[key] : 'Klik untuk isi catatan'}
                onClick={() => { setEditKey(key); setEditText(entries[key] || '') }}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>{d}</div>
                {hasNote && <div className="dot" />}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, fontSize: 10.5, color: '#9abaa8' }}>
          <span className="dot" style={{ position: 'static' }} /> ada catatan belajar — klik kotak buat isi/ubah
        </div>
      </div>

      <div className={`modal-overlay ${editKey ? 'open' : ''}`}>
        <div className="modal-box" style={{ maxWidth: 380 }}>
          <div style={{ fontSize: 11, color: '#7aaa8a', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
            {editKey}
          </div>
          <div className="modal-title" style={{ marginBottom: 10 }}>Catatan belajar hari ini</div>
          <textarea
            rows={4} value={editText} onChange={e => setEditText(e.target.value)}
            placeholder="Contoh: nonton drama 20 menit, hafal 8 kata baru..."
          />
          <div className="modal-btns">
            <button onClick={() => setEditKey(null)}>Batal</button>
            <button className="confirm" onClick={simpan}>Simpan</button>
          </div>
        </div>
      </div>
    </div>
  )
}
