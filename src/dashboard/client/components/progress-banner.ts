/**
 * Non-blocking progress banner for WebSocket bootstrap/orient events.
 * Shows at the top of the panel container with stage name, progress bar,
 * and dismiss button.
 *
 * VIZ-06, D-35.
 */

let bannerEl: HTMLElement | null = null;
let stageEl: HTMLElement | null = null;
let barFillEl: HTMLElement | null = null;

/**
 * Show the progress banner at the top of the given container.
 * Creates the banner element if it doesn't exist, or reuses existing.
 */
export function showProgressBanner(
  container: HTMLElement,
  stage: string,
  percentage: number,
): void {
  if (!bannerEl) {
    bannerEl = document.createElement('div');
    bannerEl.className = 'progress-banner';
    bannerEl.style.position = 'absolute';
    bannerEl.style.top = '0';
    bannerEl.style.left = '0';
    bannerEl.style.right = '0';
    bannerEl.style.zIndex = '100';
    bannerEl.style.display = 'flex';
    bannerEl.style.alignItems = 'center';
    bannerEl.style.gap = '12px';
    bannerEl.style.padding = '8px 16px';
    bannerEl.style.background = 'var(--color-bg-secondary)';
    bannerEl.style.borderBottom = '1px solid var(--color-accent)';
    bannerEl.style.transition = 'opacity 0.3s ease';
    bannerEl.style.opacity = '1';

    // Stage name
    stageEl = document.createElement('span');
    stageEl.style.fontSize = '12px';
    stageEl.style.color = 'var(--color-text-primary)';
    stageEl.style.whiteSpace = 'nowrap';
    stageEl.style.fontWeight = '600';
    bannerEl.appendChild(stageEl);

    // Progress bar
    const barWrapper = document.createElement('div');
    barWrapper.className = 'progress-bar';
    barWrapper.style.flex = '1';
    barWrapper.style.height = '6px';
    barWrapper.style.borderRadius = '3px';
    barWrapper.style.background = 'var(--color-bg-tertiary)';
    barWrapper.style.overflow = 'hidden';

    barFillEl = document.createElement('div');
    barFillEl.className = 'progress-bar-fill';
    barFillEl.style.height = '100%';
    barFillEl.style.borderRadius = '3px';
    barFillEl.style.background = 'var(--color-accent)';
    barFillEl.style.transition = 'width 0.3s ease';
    barFillEl.style.width = '0%';
    barWrapper.appendChild(barFillEl);
    bannerEl.appendChild(barWrapper);

    // Percentage label
    const pctLabel = document.createElement('span');
    pctLabel.className = 'progress-pct';
    pctLabel.style.fontSize = '12px';
    pctLabel.style.fontFamily = 'Fira Code, monospace';
    pctLabel.style.color = 'var(--color-accent)';
    pctLabel.style.minWidth = '36px';
    pctLabel.style.textAlign = 'right';
    bannerEl.appendChild(pctLabel);

    // Dismiss button (X icon)
    const dismissBtn = document.createElement('button');
    dismissBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    dismissBtn.style.background = 'none';
    dismissBtn.style.border = 'none';
    dismissBtn.style.color = 'var(--color-text-muted)';
    dismissBtn.style.cursor = 'pointer';
    dismissBtn.style.padding = '4px';
    dismissBtn.style.display = 'flex';
    dismissBtn.style.alignItems = 'center';
    dismissBtn.setAttribute('aria-label', 'Dismiss progress banner');
    dismissBtn.addEventListener('click', () => {
      hideProgressBanner();
    });
    bannerEl.appendChild(dismissBtn);

    // Ensure container has relative positioning for absolute banner
    const currentPosition = getComputedStyle(container).position;
    if (currentPosition === 'static') {
      container.style.position = 'relative';
    }

    container.appendChild(bannerEl);
  }

  // Update content
  updateProgressBanner(stage, percentage);
  bannerEl.style.opacity = '1';
  bannerEl.style.display = 'flex';
}

/**
 * Update the progress banner's stage text and progress bar.
 */
export function updateProgressBanner(stage: string, percentage: number): void {
  if (stageEl) {
    stageEl.textContent = stage;
  }
  if (barFillEl) {
    barFillEl.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
  }
  // Update percentage label
  if (bannerEl) {
    const pctLabel = bannerEl.querySelector('.progress-pct') as HTMLElement;
    if (pctLabel) {
      pctLabel.textContent = `${Math.round(Math.max(0, Math.min(100, percentage)))}%`;
    }
  }
}

/**
 * Hide the progress banner with a fade-out effect, then remove it.
 */
export function hideProgressBanner(): void {
  if (!bannerEl) return;

  bannerEl.style.opacity = '0';
  setTimeout(() => {
    if (bannerEl) {
      bannerEl.remove();
      bannerEl = null;
      stageEl = null;
      barFillEl = null;
    }
  }, 300);
}
