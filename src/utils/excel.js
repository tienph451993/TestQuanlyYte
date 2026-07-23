import * as XLSX from 'xlsx';

/**
 * Đọc file Excel nhập kho Cty.
 * Chấp nhận các cột: "Mã thuốc", "Tên thuốc", "Số lượng", "Phân loại"
 * (không phân biệt hoa/thường, dấu; hỗ trợ 1 vài alias)
 */
export async function parseCompanyImportExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  return rows
    .map((r, idx) => {
      const code = pick(r, ['ma_thuoc', 'ma', 'code']);
      const name = pick(r, ['ten_thuoc', 'ten', 'name']);
      const qty  = Number(pick(r, ['so_luong', 'sl', 'quantity']));
      const cat  = pick(r, ['phan_loai', 'phan_loai_thuoc', 'category', 'loai']);
      return { row: idx + 2, code: String(code).trim(), name: String(name).trim(), quantity: qty, category: String(cat).trim() };
    })
    .filter((r) => r.code || r.name);
}

function pick(row, keys) {
  const norm = {};
  for (const k of Object.keys(row)) norm[normalize(k)] = row[k];
  for (const k of keys) if (norm[k] != null && norm[k] !== '') return norm[k];
  return '';
}

function normalize(s) {
  return s
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
