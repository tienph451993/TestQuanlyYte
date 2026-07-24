export function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

export function fmtNumber(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('vi-VN').format(n);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Hiển thị số lượng kèm đơn vị. Nếu có pack_size + base_unit → thêm phụ chú:
 *   fmtQty(5, {unit:'Vỉ', pack_size:10, base_unit:'Viên'}) → "5 Vỉ (~50 Viên)"
 *   fmtQty(3, {unit:'Cuộn'})                                → "3 Cuộn"
 */
export function fmtQty(quantity, medicine, opts = {}) {
  const { compact = false } = opts;
  if (quantity == null) return '—';
  const unit = medicine?.unit || '';
  const parts = [`${fmtNumber(quantity)} ${unit}`.trim()];
  if (medicine?.pack_size && medicine?.base_unit) {
    const total = quantity * medicine.pack_size;
    parts.push(compact ? `(${fmtNumber(total)} ${medicine.base_unit})` : `(~${fmtNumber(total)} ${medicine.base_unit})`);
  }
  return parts.join(' ');
}
