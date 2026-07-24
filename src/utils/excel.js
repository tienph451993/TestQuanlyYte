import * as XLSX from 'xlsx';

/** Sinh file mẫu Excel cho chuyên viên tải về điền */
export function downloadImportTemplate() {
  const wb = XLSX.utils.book_new();
  const header = [['Mã thuốc (barcode)', 'Tên thuốc', 'Phân loại', 'Đơn vị', 'Số lượng dự kiến mua']];
  const sample = [
    ['MED_001', 'Paracetamol 500mg', 'Thuốc', 'Vỉ', 20],
    ['MED_016', 'Băng cuộn 5cm', 'Vật tư băng bó', 'Cuộn', 30]
  ];
  const ws = XLSX.utils.aoa_to_sheet([...header, ...sample]);
  ws['!cols'] = [{ wch: 22 }, { wch: 32 }, { wch: 20 }, { wch: 12 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws, 'NhapKhoCty');
  XLSX.writeFile(wb, 'MauNhapKhoCongTy.xlsx');
}

/** Xuất lại danh sách kèm cột "Trạng thái" để chuyên viên biết dòng nào lỗi */
export function downloadImportWithStatus(rows) {
  const wb = XLSX.utils.book_new();
  const header = [['Mã thuốc (barcode)', 'Tên thuốc', 'Phân loại', 'Đơn vị', 'Số lượng dự kiến mua', 'Trạng thái']];
  const data = rows.map((r) => [
    r.code, r.name, r.category, r.unit, r.planned_quantity,
    r.problem ? `❌ ${r.problem}` : '✅ Hợp lệ'
  ]);
  const ws = XLSX.utils.aoa_to_sheet([...header, ...data]);
  ws['!cols'] = [{ wch: 22 }, { wch: 32 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(wb, ws, 'NhapKhoCty_Loi');
  XLSX.writeFile(wb, 'NhapKhoCongTy_DanhSachLoi.xlsx');
}

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
  const entries = Object.keys(row).map((k) => [normalize(k), row[k]]);
  // Exact match trước
  for (const k of keys) {
    const hit = entries.find(([kn]) => kn === k);
    if (hit && hit[1] !== '' && hit[1] != null) return hit[1];
  }
  // Fallback: header chứa key
  for (const k of keys) {
    const hit = entries.find(([kn]) => kn.includes(k));
    if (hit && hit[1] !== '' && hit[1] != null) return hit[1];
  }
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
