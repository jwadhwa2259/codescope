/**
 * Bottom status bar renderer (per D-17).
 * Shows node/edge/community counts, bootstrap date, readiness grade.
 */

import { formatNumber, formatTimeAgo, formatGrade } from '../lib/format.js';

export interface StatusData {
  nodeCount: number;
  edgeCount: number;
  communityCount: number;
  bootstrapDate: string | null;
  readinessGrade: string | null;
}

export function renderStatusBar(
  container: HTMLElement,
): { update: (data: StatusData) => void } {
  // Create status bar inner elements
  const nodeSpan = document.createElement('span');
  const divider1 = document.createElement('span');
  divider1.className = 'status-divider';
  const edgeSpan = document.createElement('span');
  const divider2 = document.createElement('span');
  divider2.className = 'status-divider';
  const communitySpan = document.createElement('span');
  const divider3 = document.createElement('span');
  divider3.className = 'status-divider';
  const bootstrapSpan = document.createElement('span');
  const divider4 = document.createElement('span');
  divider4.className = 'status-divider';
  const gradeSpan = document.createElement('span');

  container.appendChild(nodeSpan);
  container.appendChild(divider1);
  container.appendChild(edgeSpan);
  container.appendChild(divider2);
  container.appendChild(communitySpan);
  container.appendChild(divider3);
  container.appendChild(bootstrapSpan);
  container.appendChild(divider4);
  container.appendChild(gradeSpan);

  function update(data: StatusData): void {
    nodeSpan.textContent = `${formatNumber(data.nodeCount)} nodes`;
    edgeSpan.textContent = `${formatNumber(data.edgeCount)} edges`;
    communitySpan.textContent = `${formatNumber(data.communityCount)} communities`;
    bootstrapSpan.textContent = data.bootstrapDate
      ? `Bootstrap: ${formatTimeAgo(data.bootstrapDate)}`
      : 'Bootstrap: never';
    gradeSpan.textContent = data.readinessGrade
      ? `Grade: ${data.readinessGrade}`
      : 'Grade: --';
  }

  // Initialize with zero values
  update({
    nodeCount: 0,
    edgeCount: 0,
    communityCount: 0,
    bootstrapDate: null,
    readinessGrade: null,
  });

  return { update };
}
