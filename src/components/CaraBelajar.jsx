import { useState } from 'react'

function Toggle({ icon, title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderRadius: 12, border: '1.5px solid #c8ddc8', background: '#fff',
          cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#2d6a4a',
        }}
      >
        <span>{icon} {title}</span>
        <span style={{ transition: 'transform .2s', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
      </button>
      {open && (
        <div style={{ background: '#fff', border: '1.5px solid #c8ddc8', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '14px 16px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function Step({ num, title, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
      <div style={{
        minWidth: 22, height: 22, borderRadius: '50%', background: '#d8eed8', color: '#2d6a4a',
        fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
      }}>{num}</div>
      <div>
        <b style={{ fontSize: 12, color: '#2d6a4a' }}>{title}</b>
        <div style={{ fontSize: 11, color: '#7aaa8a', lineHeight: 1.4 }}>{children}</div>
      </div>
    </div>
  )
}

export default function CaraBelajar() {
  return (
    <div style={{ margin: '28px auto 0', width: '100%', maxWidth: 480 }}>
      <Toggle icon="📖" title="Cara Belajar">
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7aaa8a', marginBottom: 10 }}>
          🌿 Manfaatin Immersion Harian
        </div>
        <Step num="1" title="Ambil dari konten beneran">
          Kata-kata di sini idealnya diambil pas kamu lagi nonton drama, dengerin podcast, baca manga, atau scroll medsos jepang — bukan dari list kosakata buku. Begitu nemu kata baru yang menarik/sering muncul, langsung catat di paket yang sesuai.
        </Step>
        <Step num="2" title="Pisah per sumber/konteks pakai paket">
          Satu paket = satu sumber (misal satu anime, satu buku, satu topik). Biar pas direview, konteksnya masih nyambung di kepala — bukan kata random lepas dari cerita.
        </Step>
        <Step num="3" title="Tandai hafal, jangan cuma ditebak-tebak">
          Setelah ngerti artinya, coba rangkai sendiri dalam kalimat baru sebelum dicentang hafal. Kata yang nggak dipake dalam kalimat susah nempel permanen.
        </Step>
        <Step num="4" title="Isi Jurnal Kalender tiap hari">
          Walau cuma 1 kata baru atau 10 menit nonton, catat di kalender. Yang penting konsisten kelihatan progress hariannya — biar termotivasi jagain streak-nya jalan.
        </Step>
      </Toggle>

      <Toggle icon="🌱" title="Fondasi">
        <div style={{ fontSize: 11, color: '#7aaa8a', marginBottom: 12, lineHeight: 1.5 }}>
          Ini yang bikin immersion harian kerasa ringan dan nggak gampang nyerah di tengah jalan.
        </div>
        <Step num="🧘" title="Meditasi & Afirmasi">
          Sebelum mulai nonton/dengerin konten Jepang, tarik napas dulu, ucapin afirmasi dengan yakin: "Aku makin lancar nangkep bahasa Jepang dari keseharian." Bikin otak lebih siap nyerap, bukan cuma denger lewat doang.
        </Step>
        <Step num="🔥" title="Jaga Streak, Jangan Maksa Banyak">
          Lebih bagus 5 menit tiap hari daripada 2 jam sekali seminggu. Konsistensi kecil yang dicatat di kalender lebih kerasa hasilnya buat kebiasaan jangka panjang.
        </Step>
        <Step num="🏃" title="Gerak Dulu, Baru Immersion">
          Jalan kaki atau olahraga ringan sebelum sesi immersion bikin otak lebih siap nyerap dan nyimpen kata-kata baru yang baru ketemu.
        </Step>
        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: '#f0f7f0', fontSize: 11, color: '#5a9a6a', lineHeight: 1.6 }}>
          ✨ <b style={{ color: '#2d6a4a' }}>Afirmasi contoh:</b><br />
          "Aku dengan mudah nangkep kosakata baru dari keseharianku."<br />
          "Tiap hari aku makin akrab sama bahasa Jepang."<br />
          "Belajar dari konten yang aku suka itu ringan dan menyenangkan."
        </div>
      </Toggle>
    </div>
  )
}
