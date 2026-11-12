import { STATUS_LABEL } from '../utils.js';

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{STATUS_LABEL[status] || status}</span>;
}
