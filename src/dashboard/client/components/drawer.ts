/**
 * Right slide-out drawer (480px) with scrim and Escape-to-close.
 * Uses #drawer-overlay and #drawer elements from HTML.
 * Per D-37, D-38, UI-SPEC interaction contract.
 */

import { icons } from '../lib/icons.js';

let escapeHandler: ((e: KeyboardEvent) => void) | null = null;

function getElements(): { overlay: HTMLElement; drawer: HTMLElement } {
  const overlay = document.getElementById('drawer-overlay')!;
  const drawer = document.getElementById('drawer')!;
  return { overlay, drawer };
}

export function openDrawer(title: string, content: HTMLElement | string): void {
  const { overlay, drawer } = getElements();

  // Build drawer content
  drawer.innerHTML = '';

  // Header with title and close button
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '16px';

  const titleEl = document.createElement('h2');
  titleEl.textContent = title;
  titleEl.style.fontSize = '18px';
  titleEl.style.fontWeight = '600';
  titleEl.style.margin = '0';
  header.appendChild(titleEl);

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = icons.close;
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.color = 'var(--color-text-muted)';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.padding = '4px';
  closeBtn.setAttribute('aria-label', 'Close drawer');
  closeBtn.addEventListener('click', closeDrawer);
  header.appendChild(closeBtn);

  drawer.appendChild(header);

  // Body content
  const body = document.createElement('div');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else {
    body.appendChild(content);
  }
  drawer.appendChild(body);

  // Open
  overlay.classList.add('open');
  drawer.classList.add('open');

  // Click scrim to close
  overlay.addEventListener('click', closeDrawer, { once: true });

  // Escape key to close
  escapeHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeDrawer();
    }
  };
  document.addEventListener('keydown', escapeHandler);
}

export function closeDrawer(): void {
  const { overlay, drawer } = getElements();

  overlay.classList.remove('open');
  drawer.classList.remove('open');

  // Clean up Escape handler
  if (escapeHandler) {
    document.removeEventListener('keydown', escapeHandler);
    escapeHandler = null;
  }
}
