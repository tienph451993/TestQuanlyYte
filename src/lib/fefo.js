// FEFO helpers – shared between UI and business logic

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function daysUntil(dateStr) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.floor((d - t) / MS_PER_DAY);
}

export function getExpiryStatus(expiryDate) {
  const days = daysUntil(expiryDate);
  if (days < 0)   return { status: 'expired',         label: 'Đã hết hạn',        color: '#C0392B', badgeClass: 'badge-danger',  days };
  if (days <= 3)  return { status: 'final_check',     label: `Còn ${days} ngày`,  color: '#E74C3C', badgeClass: 'badge-danger',  days };
  if (days <= 30) return { status: 'urgent',          label: `Còn ${days} ngày`,  color: '#E74C3C', badgeClass: 'badge-danger',  days };
  if (days <= 60) return { status: 'action_required', label: `Còn ${days} ngày`,  color: '#E67E22', badgeClass: 'badge-warning', days };
  if (days <= 90) return { status: 'watch',           label: `Còn ${days} ngày`,  color: '#F1C40F', badgeClass: 'badge-caution', days };
  return             { status: 'ok',              label: 'Còn hạn',            color: '#27AE60', badgeClass: 'badge-success', days };
}

/**
 * FEFO ordering – earliest expiry first, up to quantityNeeded.
 * batches: array of stock_batches rows (must include quantity, expiry_date)
 */
export function getFefoOrder(batches, quantityNeeded) {
  const today = new Date();
  const available = batches
    .filter(b => b.quantity > 0 && new Date(b.expiry_date) >= today)
    .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));

  const result = [];
  let remaining = quantityNeeded;
  for (const batch of available) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    result.push({ ...batch, suggested_quantity: take });
    remaining -= take;
  }
  return { batches: result, is_fulfilled: remaining <= 0, shortage: Math.max(0, remaining) };
}

/** Trả về status DB mới từ số ngày còn lại. */
export function getStatusFromDays(days) {
  if (days < 0)   return 'expired';
  if (days <= 3)  return 'final_check';
  if (days <= 30) return 'urgent';
  if (days <= 60) return 'action_required';
  if (days <= 90) return 'watch';
  return 'ok';
}
