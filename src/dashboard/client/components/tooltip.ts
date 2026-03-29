/**
 * Positioned tooltip with text content and 200ms show delay.
 * Creates/reuses a single .tooltip DOM element.
 * Per D-25, UI-SPEC interaction contract.
 */

let tooltipEl: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;

function getTooltipElement(): HTMLElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    tooltipEl.style.display = 'none';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

/**
 * Show a tooltip positioned relative to the target element.
 * Appears after 200ms delay. Positioned above or below depending on available space.
 */
export function showTooltip(target: HTMLElement, text: string): void {
  // Cancel any pending timer
  if (showTimer !== null) {
    clearTimeout(showTimer);
  }

  showTimer = setTimeout(() => {
    showTimer = null;
    const tip = getTooltipElement();
    tip.textContent = text;
    tip.style.display = 'block';

    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    // Default: position to the right of the target (for sidebar icons)
    let left = rect.right + 8;
    let top = rect.top + (rect.height - tipRect.height) / 2;

    // If tooltip would overflow right edge, position above
    if (left + tipRect.width > window.innerWidth) {
      left = rect.left + (rect.width - tipRect.width) / 2;
      top = rect.top - tipRect.height - 4;
    }

    // If tooltip would overflow top, position below
    if (top < 0) {
      top = rect.bottom + 4;
    }

    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${Math.max(0, top)}px`;
  }, 200);
}

/**
 * Hide the tooltip and cancel any pending show timer.
 */
export function hideTooltip(): void {
  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }

  if (tooltipEl) {
    tooltipEl.style.display = 'none';
  }
}
