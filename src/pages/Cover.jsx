import CaraBelajar from '../components/CaraBelajar'

export default function Cover({ goTo, jumlahPaket, jumlahKata, jumlahHariJurnal }) {
  function kunciUlang() {
    if (!confirm('Keluar dan minta kata sandi lagi waktu buka app berikutnya?')) return
    localStorage.removeItem('immersion-unlocked')
    window.location.reload()
  }

  return (
    <div className="cover">
      <button
        onClick={kunciUlang}
        title="Keluar (minta kata sandi lagi pas buka app berikutnya)"
        style={{
          position: 'fixed', top: 20, right: 20, width: 32, height: 32, borderRadius: '50%',
          border: '1.5px solid #b8d8b8', background: '#fff', cursor: 'pointer', color: '#7aaa8a',
          fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}
      >
        🔒
      </button>

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
            <div className="nav-desc">kosakata dari keseharian</div>
          </div>
        </div>

        <CaraBelajar />
      </div>
    </div>
  )
}
