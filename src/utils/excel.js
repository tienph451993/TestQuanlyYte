import * as XLSX from 'xlsx';

/**
 * Đọc file Excel nhập kho Cty.
 * Cột chấp nhận (không phân biệt hoa/thường/dấu):
 *   - Mã thuốc / Barcode
 *   - Tên thuốc
 *   - Phân loại
 *   - Đơn vị (optional)
 *   - Số lượng (dự kiến mua)
 */
export async function parseCompanyImportExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  return rows
    .map((r, idx) => {
      const code = pick(r, ['ma_thuoc', 'ma', 'code', 'barcode']);
      const name = pick(r, ['ten_thuoc', 'ten', 'name']);
      const cat  = pick(r, ['phan_loai', 'phan_loai_thuoc', 'category', 'loai']);
      const unit = pick(r, ['don_vi', 'unit']);
      const qty  = Number(pick(r, ['so_luong', 'sl', 'quantity']));
      return {
        row: idx + 2,
        code: String(code).trim(),
        name: String(name).trim(),
        category: String(cat).trim(),
        unit: String(unit).trim(),
        planned_quantity: qty
      };
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
