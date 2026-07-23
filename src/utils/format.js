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
