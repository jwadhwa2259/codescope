/**
 * Number formatting, grade display, time formatting helpers.
 */

/**
 * Adds commas to a number (e.g., 1234 -> "1,234").
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Returns letter grade from a percentage.
 * A (>=90), B (>=75), C (>=60), D (>=45), F (<45).
 * Appends + if within 5% of next tier boundary.
 */
export function formatGrade(percent: number): string {
  if (percent >= 90) return 'A';
  if (percent >= 85) return 'B+';
  if (percent >= 75) return 'B';
  if (percent >= 70) return 'C+';
  if (percent >= 60) return 'C';
  if (percent >= 55) return 'D+';
  if (percent >= 45) return 'D';
  return 'F';
}

/**
 * Formats an ISO date string as a relative time ("2h ago", "5m ago", "just now").
 */
export function formatTimeAgo(isoDate: string): string {
  const date = new Date(isoDate);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Formats a number as a percentage string (e.g., 78 -> "78%").
 */
export function formatPercent(n: number): string {
  return `${Math.round(n)}%`;
}

/**
 * Returns a compliance color based on percentage.
 * >80 green, 50-80 yellow, <50 red.
 */
export function complianceColor(percent: number): 'green' | 'yellow' | 'red' {
  if (percent > 80) return 'green';
  if (percent >= 50) return 'yellow';
  return 'red';
}
