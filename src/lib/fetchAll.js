// Ambil SEMUA baris dari query Supabase dengan paginasi .range().
// Supabase/PostgREST memotong hasil di max-rows (default 1000) tanpa error,
// jadi query tanpa paginasi diam-diam kehilangan baris setelah ke-1000.
//
// Pakai: pass FUNGSI yang mengembalikan query baru (query builder sekali pakai).
//   const { data, error } = await fetchAll(() =>
//     supabase.from('kata').select('id, jp').eq('hafal', true).order('id'))
//
// Wajib ada .order() yang stabil (unik, mis. 'id') supaya halaman tidak
// tumpang tindih / bolong. pageSize harus <= max-rows server (default 1000).
export async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    if (data && data.length) rows.push(...data)
    if (!data || data.length < pageSize) break
  }
  return { data: rows, error: null }
}
