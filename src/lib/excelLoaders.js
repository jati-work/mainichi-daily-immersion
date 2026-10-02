// Loader library Excel dari cdnjs, dipakai bareng sama fitur import/export
// Excel di kotoba (ImportExcel.jsx) maupun radikal (ImportExcelRadikal.jsx).

// dipakai buat BACA file .xlsx pas import
export async function loadXLSX() {
  if (window.XLSX) return window.XLSX
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = resolve
    s.onerror = () => reject(new Error('Gagal load library Excel (cek koneksi internet)'))
    document.body.appendChild(s)
  })
  return window.XLSX
}

// dipakai khusus buat BIKIN file (template/export) -- SheetJS versi gratis
// nggak bisa nulis warna sel, jadi buat header yang di-stabilo pakai ExcelJS
export async function loadExcelJS() {
  if (window.ExcelJS) return window.ExcelJS
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'
    s.onload = resolve
    s.onerror = () => reject(new Error('Gagal load library Excel (cek koneksi internet)'))
    document.body.appendChild(s)
  })
  return window.ExcelJS
}
