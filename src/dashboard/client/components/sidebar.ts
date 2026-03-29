/**
 * Navigation sidebar with 5 icon buttons, active indicator, keyboard binding.
 * Per D-13, D-14, D-15 -- sidebar is 56px wide, icons vertically stacked,
 * keyboard shortcuts 1-5 switch panels.
 */

import { icons, icon } from '../lib/icons.js';
import { showTooltip, hideTooltip } from './tooltip.js';

export type PanelId = 'graph' | 'heatmap' | 'trends' | 'blast' | 'command';

interface PanelDef {
  id: PanelId;
  name: string;
  iconKey: keyof typeof icons;
}

const PANELS: PanelDef[] = [
  { id: 'graph', name: 'Graph', iconKey: 'graph' },
  { id: 'heatmap', name: 'Heatmap', iconKey: 'heatmap' },
  { id: 'trends', name: 'Trends', iconKey: 'trends' },
  { id: 'blast', name: 'Blast Radius', iconKey: 'blastRadius' },
  { id: 'command', name: 'Command Center', iconKey: 'command' },
];

const KEY_TO_INDEX: Record<string, number> = {
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
};

export function renderSidebar(
  container: HTMLElement,
  onSwitch: (panel: PanelId) => void,
): { setActive: (panel: PanelId) => void } {
  const buttons: HTMLButtonElement[] = [];

  for (const panel of PANELS) {
    const btn = document.createElement('button');
    btn.className = 'sidebar-btn';
    btn.setAttribute('aria-label', panel.name);
    btn.dataset.panel = panel.id;
    btn.innerHTML = icon(panel.iconKey, 20);

    btn.addEventListener('click', () => {
      onSwitch(panel.id);
    });

    btn.addEventListener('mouseenter', () => {
      showTooltip(btn, panel.name);
    });

    btn.addEventListener('mouseleave', () => {
      hideTooltip();
    });

    container.appendChild(btn);
    buttons.push(btn);
  }

  // Keyboard shortcuts: keys 1-5 switch panels (only when no input is focused)
  function handleKeydown(e: KeyboardEvent): void {
    if (
      document.activeElement?.tagName === 'INPUT' ||
      document.activeElement?.tagName === 'TEXTAREA'
    ) {
      return;
    }

    const index = KEY_TO_INDEX[e.key];
    if (index !== undefined) {
      onSwitch(PANELS[index].id);
    }
  }

  document.addEventListener('keydown', handleKeydown);

  function setActive(panel: PanelId): void {
    for (const btn of buttons) {
      if (btn.dataset.panel === panel) {
        btn.setAttribute('aria-current', 'true');
      } else {
        btn.removeAttribute('aria-current');
      }
    }
  }

  return { setActive };
}
