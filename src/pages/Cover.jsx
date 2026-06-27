import { supabase } from '../supabaseClient'

export default function Cover({ goTo, jumlahPaket, jumlahKata, jumlahHariJurnal }) {
  function kunciUlang() {
    localStorage.removeItem('immersion-unlocked')
    window.location.reload()
  }

  return (
    <div className="cover">
      <div className="cover-inner">
        <div className="cover-head">
          <div className="cover-emoji">🌿</div>
          <div>
            <div className="cover-title">Jurnal Immersion Harian</div>
            <div className="cover-sub">kosakata dari keseharian + tracking belajar</div>
          </div>
        </div>

        <div className="nav-card" onClick={() => goTo('jurnal')}>
          <div className="nav-icon">📅</div>
          <div className="nav-info">
            <div className="nav-title">Jurnal Kalender</div>
            <div className="nav-desc">
              {jumlahHariJurnal ? `${jumlahHariJurnal} hari sudah dicatat` : 'tandai tiap hari kamu belajar'}
            </div>
          </div>
        </div>

        <div className="nav-card" onClick={() => goTo('paket')}>
          <div className="nav-icon">📚</div>
          <div className="nav-info">
            <div className="nav-title">Kosakata Immersion</div>
            <div className="nav-desc">
              {jumlahPaket ? `${jumlahPaket} paket · ${jumlahKata} kata` : 'kosakata dari keseharian'}
            </div>
          </div>
        </div>

        <button
          onClick={kunciUlang}
          style={{
            marginTop: 18, width: '100%', padding: '9px 10px', borderRadius: 10,
            border: '1.5px solid #c8ddc8', background: '#fff', cursor: 'pointer',
            fontSize: 11.5, fontWeight: 600, color: '#2d6a4a',
          }}
        >
          🔒 Kunci Ulang
        </button>
      </div>
    </div>
  )
}
