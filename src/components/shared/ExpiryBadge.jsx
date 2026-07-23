import { getExpiryStatus } from '../../lib/fefo.js';
import { fmtDate } from '../../utils/format.js';

export default function ExpiryBadge({ date, withDate = false }) {
  if (!date) return null;
  const s = getExpiryStatus(date);
  return (
    <span className={`badge ${s.badgeClass}`} title={fmtDate(date)}>
      {withDate ? `${fmtDate(date)} · ${s.label}` : s.label}
    </span>
  );
}
