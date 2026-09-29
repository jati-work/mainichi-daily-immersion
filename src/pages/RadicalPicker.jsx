import { useState } from 'react'

// Bushu/radikal dikelompokkan berdasarkan tema (bukan jumlah coretan).
// Kombinasi kayak 水/氵 sengaja DIPECAH jadi 2 entri terpisah (masing-masing
// tombol sendiri) biar pas ngetik jawaban tes nggak ambigu mau pilih yang mana.
const KATEGORI = [
  {
    nama: 'Alam & Elemen', emoji: '🌍', item: [
      { char: '水', baca: 'sui', arti: 'air' },
      { char: '氵', baca: 'sui', arti: 'air' },
      { char: '火', baca: 'ka', arti: 'api' },
      { char: '灬', baca: 'ka', arti: 'api' },
      { char: '木', baca: 'moku', arti: 'pohon/kayu' },
      { char: '土', baca: 'do', arti: 'tanah' },
      { char: '山', baca: 'san', arti: 'gunung' },
      { char: '石', baca: 'seki', arti: 'batu' },
      { char: '田', baca: 'den', arti: 'sawah' },
      { char: '谷', baca: 'koku', arti: 'lembah' },
      { char: '里', baca: 'ri', arti: 'desa/jarak' },
      { char: '气', baca: 'ki', arti: 'uap/udara' },
      { char: '雨', baca: 'u', arti: 'hujan' },
      { char: '風', baca: 'fuu', arti: 'angin' },
      { char: '金', baca: 'kin', arti: 'emas/logam' },
      { char: '西', baca: 'nishi', arti: 'barat' },
      { char: '日', baca: 'nichi', arti: 'matahari/hari' },
      { char: '月', baca: 'getsu', arti: 'bulan' },
      { char: '冫', baca: 'hyou', arti: 'es' },
      { char: '厂', baca: 'gan', arti: 'tebing' },
    ],
  },
  {
    nama: 'Tubuh Manusia', emoji: '👤', item: [
      { char: '人', baca: 'jin', arti: 'orang' },
      { char: '亻', baca: 'jin', arti: 'orang' },
      { char: '儿', baca: 'jin', arti: 'kaki manusia/anak' },
      { char: '心', baca: 'shin', arti: 'hati' },
      { char: '忄', baca: 'shin', arti: 'hati' },
      { char: '手', baca: 'shu', arti: 'tangan' },
      { char: '扌', baca: 'shu', arti: 'tangan' },
      { char: '口', baca: 'kou', arti: 'mulut' },
      { char: '目', baca: 'moku', arti: 'mata' },
      { char: '耳', baca: 'ji', arti: 'telinga' },
      { char: '足', baca: 'soku', arti: 'kaki' },
      { char: '身', baca: 'shin', arti: 'badan' },
      { char: '首', baca: 'shu', arti: 'leher/kepala' },
      { char: '面', baca: 'men', arti: 'wajah' },
      { char: '血', baca: 'ketsu', arti: 'darah' },
      { char: '骨', baca: 'kotsu', arti: 'tulang' },
      { char: '毛', baca: 'mou', arti: 'bulu/rambut' },
      { char: '皮', baca: 'hi', arti: 'kulit' },
      { char: '牙', baca: 'ga', arti: 'taring' },
      { char: '爪', baca: 'sou', arti: 'cakar' },
      { char: '自', baca: 'ji', arti: 'diri sendiri/hidung' },
      { char: '舌', baca: 'zetsu', arti: 'lidah' },
      { char: '氏', baca: 'shi', arti: 'marga/keluarga' },
    ],
  },
  {
    nama: 'Hewan', emoji: '🐾', item: [
      { char: '犬', baca: 'ken', arti: 'anjing' },
      { char: '犭', baca: 'ken', arti: 'anjing' },
      { char: '牛', baca: 'gyuu', arti: 'sapi' },
      { char: '馬', baca: 'ba', arti: 'kuda' },
      { char: '羊', baca: 'you', arti: 'domba' },
      { char: '魚', baca: 'gyo', arti: 'ikan' },
      { char: '鳥', baca: 'chou', arti: 'burung' },
      { char: '隹', baca: 'sui', arti: 'burung (pendek)' },
      { char: '虫', baca: 'chuu', arti: 'serangga' },
      { char: '羽', baca: 'u', arti: 'bulu/sayap' },
      { char: '角', baca: 'kaku', arti: 'sudut/tanduk' },
    ],
  },
  {
    nama: 'Tumbuhan', emoji: '🌱', item: [
      { char: '艹', baca: 'kusa', arti: 'rumput/tanaman' },
      { char: '禾', baca: 'ka', arti: 'padi' },
      { char: '竹', baca: 'chiku', arti: 'bambu' },
      { char: '米', baca: 'bei', arti: 'beras' },
      { char: '豆', baca: 'tou', arti: 'kacang' },
    ],
  },
  {
    nama: 'Bangunan & Tempat', emoji: '🏠', item: [
      { char: '宀', baca: 'u-kanmuri', arti: 'atap' },
      { char: '广', baca: 'gen', arti: 'bangunan/atap' },
      { char: '戸', baca: 'ko', arti: 'pintu' },
      { char: '門', baca: 'mon', arti: 'pintu gerbang' },
      { char: '囗', baca: 'i', arti: 'kotak/pagar' },
      { char: '穴', baca: 'ketsu', arti: 'lubang/gua' },
      { char: '冖', baca: 'waku', arti: 'tutup' },
    ],
  },
  {
    nama: 'Aksi/Gerakan', emoji: '✋', item: [
      { char: '辶', baca: "shin'nyou", arti: 'berjalan' },
      { char: '走', baca: 'sou', arti: 'lari' },
      { char: '攵', baca: 'boku', arti: 'memukul/tindakan' },
      { char: '力', baca: 'ryoku', arti: 'tenaga' },
      { char: '廾', baca: 'kyou', arti: 'kedua tangan' },
      { char: '彳', baca: 'gyou', arti: 'melangkah' },
      { char: '癶', baca: 'hatsu', arti: 'kaki melangkah' },
      { char: '行', baca: 'gyou', arti: 'jalan/pergi' },
      { char: '入', baca: 'nyuu', arti: 'masuk' },
      { char: '止', baca: 'shi', arti: 'berhenti' },
    ],
  },
  {
    nama: 'Makanan', emoji: '🍚', item: [
      { char: '食', baca: 'shoku', arti: 'makan' },
      { char: '飠', baca: 'shoku', arti: 'makan' },
      { char: '香', baca: 'kou', arti: 'harum' },
      { char: '酉', baca: 'yuu', arti: 'anggur/waktu senja (zodiak)' },
      { char: '皿', baca: 'sara', arti: 'piring' },
    ],
  },
  {
    nama: 'Pakaian & Benda', emoji: '👗', item: [
      { char: '衣', baca: 'i', arti: 'baju' },
      { char: '衤', baca: 'i', arti: 'baju' },
      { char: '糸', baca: 'shi', arti: 'benang' },
      { char: '刀', baca: 'tou', arti: 'pisau/pedang' },
      { char: '刂', baca: 'tou', arti: 'pisau/pedang' },
      { char: '弓', baca: 'kyuu', arti: 'busur panah' },
      { char: '矢', baca: 'shi', arti: 'anak panah' },
      { char: '斤', baca: 'kin', arti: 'kapak' },
      { char: '戈', baca: 'ka', arti: 'senjata/tombak' },
      { char: '車', baca: 'sha', arti: 'mobil/roda' },
      { char: '舟', baca: 'shuu', arti: 'perahu' },
      { char: '巾', baca: 'kin', arti: 'kain' },
    ],
  },
  {
    nama: 'Abstrak, Angka & Lainnya', emoji: '🔤', item: [
      { char: '一', baca: 'ichi', arti: 'satu' },
      { char: '十', baca: 'juu', arti: 'sepuluh' },
      { char: '八', baca: 'hachi', arti: 'delapan/belah' },
      { char: '乙', baca: 'otsu', arti: 'kedua/urutan' },
      { char: '丶', baca: 'ten', arti: 'titik' },
      { char: '丨', baca: 'bou', arti: 'garis tegak' },
      { char: '言', baca: 'gen', arti: 'kata/bicara' },
      { char: '見', baca: 'ken', arti: 'melihat' },
      { char: '音', baca: 'on', arti: 'suara' },
      { char: '色', baca: 'shoku', arti: 'warna' },
      { char: '方', baca: 'hou', arti: 'arah' },
      { char: '士', baca: 'shi', arti: 'pejabat/kesatria' },
      { char: '寸', baca: 'sun', arti: 'ukuran/sedikit' },
      { char: '卜', baca: 'boku', arti: 'ramalan' },
      { char: '又', baca: 'yuu', arti: 'tangan/lagi' },
      { char: '己', baca: 'ki', arti: 'diri sendiri' },
      { char: '卩', baca: 'setsu', arti: 'segel/lutut' },
      { char: '匕', baca: 'hi', arti: 'sendok/pisau kecil' },
      { char: '厶', baca: 'shi', arti: 'pribadi/diri sendiri' },
      { char: '非', baca: 'hi', arti: 'bukan/salah' },
      { char: '至', baca: 'shi', arti: 'sampai' },
      { char: '高', baca: 'kou', arti: 'tinggi' },
      { char: '貝', baca: 'bai', arti: 'kerang/uang' },
      { char: '辛', baca: 'shin', arti: 'pedas/berat' },
      { char: '鬼', baca: 'ki', arti: 'hantu/setan' },
      { char: '長', baca: 'chou', arti: 'panjang' },
      { char: '斉', baca: 'sei', arti: 'rata/sejajar' },
      { char: '青', baca: 'sei', arti: 'biru/hijau' },
      { char: '頁', baca: 'ketsu', arti: 'halaman/kepala' },
      { char: '飛', baca: 'hi', arti: 'terbang' },
      { char: '小', baca: 'shou', arti: 'kecil' },
      { char: '少', baca: 'shou', arti: 'sedikit' },
      { char: '大', baca: 'dai', arti: 'besar' },
      { char: '夕', baca: 'seki', arti: 'senja/malam' },
      { char: '女', baca: 'jo', arti: 'perempuan' },
      { char: '子', baca: 'shi', arti: 'anak' },
      { char: '父', baca: 'fu', arti: 'ayah' },
      { char: '母', baca: 'bo', arti: 'ibu' },
      { char: '曰', baca: 'etsu', arti: 'berkata' },
      { char: '欠', baca: 'ketsu', arti: 'kurang/menguap' },
      { char: '歹', baca: 'tai', arti: 'kematian/buruk' },
      { char: '殳', baca: 'shu', arti: 'tombak/memukul' },
      { char: '立', baca: 'ritsu', arti: 'berdiri' },
      { char: '尸', baca: 'shi', arti: 'mayat/atap' },
      { char: '疒', baca: 'byou', arti: 'penyakit' },
      { char: '疋', baca: 'hiki', arti: 'kaki' },
      { char: '白', baca: 'haku', arti: 'putih' },
      { char: '罒', baca: 'mou', arti: 'jaring' },
      { char: '匚', baca: 'hou', arti: 'kotak' },
      { char: '几', baca: 'ki', arti: 'meja' },
      { char: '工', baca: 'kou', arti: 'kerja/pertukangan' },
      { char: '巛', baca: 'sen', arti: 'sungai' },
      { char: '干', baca: 'kan', arti: 'kering/perisai' },
      { char: '彡', baca: 'san', arti: 'bulu/hiasan' },
      { char: '冂', baca: 'kei', arti: 'bingkai/batas' },
      { char: '阝', baca: 'kozato', arti: 'bukit (kiri)' },
      { char: '阝', baca: 'oozato', arti: 'kota/wilayah (kanan)' },
    ],
  },
]

// dipakai sebagai key React yang unik, soalnya beberapa char (kayak 阝)
// muncul dua kali dengan arti berbeda
const kunci = (it, i) => `${it.char}-${it.arti}-${i}`

// variant="panel": komponen ini render tombol keyboard-nya SENDIRI + panel
// dropdown-nya. Kontrak propnya sengaja dijaga sama kayak versi lama biar
// nggak perlu ubah PaketDetail.jsx: variant, open, onToggle, onClose, onPilih.
export default function RadicalPicker({ variant = 'panel', open, onToggle, onClose, onPilih }) {
  const [tab, setTab] = useState(0)

  return (
    <div style={{ position: 'relative', display: 'inline-block', marginBottom: 8 }}>
      <button
        type="button"
        className={`act-btn ${open ? 'active' : ''}`}
        onClick={onToggle}
        style={{ fontSize: 12 }}
      >⌨️ Bushu/Radikal</button>

      {open && (
        <div
          style={{
            position: variant === 'panel' ? 'absolute' : 'fixed',
            top: variant === 'panel' ? '110%' : 0,
            left: variant === 'panel' ? 0 : 0,
            right: variant === 'panel' ? undefined : 0,
            bottom: variant === 'panel' ? undefined : 0,
            display: variant === 'panel' ? 'block' : 'flex',
            alignItems: variant === 'panel' ? undefined : 'center',
            justifyContent: variant === 'panel' ? undefined : 'center',
            background: variant === 'panel' ? 'transparent' : 'rgba(0,0,0,.35)',
            zIndex: 60,
          }}
          onClick={variant === 'panel' ? undefined : onClose}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', border: '1.5px solid #b8d8b8', borderRadius: 12,
              boxShadow: '0 8px 24px rgba(0,0,0,.18)', padding: 10, width: 300, maxHeight: 320,
              display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#2d6a4a', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Bushu / Radikal
              </div>
              <button className="icon-btn" onClick={onClose} style={{ width: 22, height: 22, fontSize: 11 }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
              {KATEGORI.map((k, i) => (
                <button
                  key={k.nama}
                  type="button"
                  className={`act-btn ${tab === i ? 'active' : ''}`}
                  onClick={() => setTab(i)}
                  style={{ flexShrink: 0, fontSize: 11, padding: '4px 8px', whiteSpace: 'nowrap' }}
                >{k.emoji} {k.nama}</button>
              ))}
            </div>

            <div
              style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))', gap: 6,
                overflowY: 'auto', paddingRight: 2,
              }}
            >
              {KATEGORI[tab].item.map((it, i) => (
                <button
                  key={kunci(it, i)}
                  type="button"
                  onClick={() => onPilih(it.char)}
                  style={{
                    padding: '8px 2px', borderRadius: 8, border: '1.5px solid #e5efe5',
                    background: '#f7fbf7', cursor: 'pointer',
                    fontFamily: "'Noto Serif JP', serif", fontSize: 18, lineHeight: 1,
                  }}
                >{it.char}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
