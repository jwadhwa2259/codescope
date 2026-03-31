/**
 * Command center panel.
 * 4 action cards: Run Review, Predict Impact, Refresh Graph, Export Screenshot.
 * Each card triggers an action and shows results in drawers or cross-panel navigation.
 *
 * VIZ-07, D-36 through D-39, D-41.
 */

import type { ApiClient, ReviewApiResponse, ImpactApiResponse } from '../lib/api-client.js';
import type { WebSocketClient } from '../lib/ws-client.js';
import { renderSearch } from '../components/search.js';
import { openDrawer } from '../components/drawer.js';
import { icons, icon } from '../lib/icons.js';

interface PanelContext {
  container: HTMLElement;
  api: ApiClient;
  ws: WebSocketClient;
  onSelectFile: (filePath: string) => void;
}

interface PanelInstance {
  destroy: () => void;
}

interface CardDef {
  title: string;
  icon: string;
  description: string;
  buttonLabel: string;
  action: (card: HTMLElement, button: HTMLButtonElement) => void;
}

/** DOM elements created by buildCommandDom. */
interface CommandDom {
  wrapper: HTMLElement;
  grid: HTMLElement;
}

/** Mutable state for the command panel. */
interface CommandState {
  fileList: string[];
  searchInstances: Array<{ destroy: () => void }>;
}

// ---- Module-private helpers ----

function buildCommandDom(container: HTMLElement): CommandDom {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.height = '100%';
  wrapper.style.overflow = 'auto';
  wrapper.style.padding = '24px';
  container.appendChild(wrapper);

  const title = document.createElement('h2');
  title.textContent = 'Command Center';
  title.style.fontSize = '18px';
  title.style.fontWeight = '600';
  title.style.marginBottom = '24px';
  title.style.color = 'var(--color-text-primary)';
  wrapper.appendChild(title);

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
  grid.style.gap = '24px';
  grid.style.maxWidth = '800px';
  wrapper.appendChild(grid);

  return { wrapper, grid };
}

function createActionCard(def: CardDef): HTMLElement {
  const card = document.createElement('div');
  card.style.background = 'var(--color-bg-tertiary)';
  card.style.borderRadius = '8px';
  card.style.padding = '24px';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.gap = '16px';
  card.style.transition = 'border-color var(--transition-fast)';
  card.style.border = '1px solid transparent';

  card.addEventListener('mouseenter', () => {
    card.style.borderColor = 'var(--color-bg-tertiary)';
    card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
  });
  card.addEventListener('mouseleave', () => {
    card.style.borderColor = 'transparent';
    card.style.boxShadow = 'none';
  });

  const iconEl = document.createElement('div');
  iconEl.innerHTML = def.icon;
  iconEl.style.color = 'var(--color-accent)';
  const svgEl = iconEl.querySelector('svg');
  if (svgEl) {
    svgEl.setAttribute('width', '32');
    svgEl.setAttribute('height', '32');
  }
  card.appendChild(iconEl);

  const titleEl = document.createElement('div');
  titleEl.textContent = def.title;
  titleEl.style.fontSize = '16px';
  titleEl.style.fontWeight = '600';
  titleEl.style.color = 'var(--color-text-primary)';
  card.appendChild(titleEl);

  const desc = document.createElement('p');
  desc.textContent = def.description;
  desc.style.fontSize = '13px';
  desc.style.color = 'var(--color-text-muted)';
  desc.style.lineHeight = '1.5';
  desc.style.margin = '0';
  card.appendChild(desc);

  const button = document.createElement('button');
  button.textContent = def.buttonLabel;
  button.style.padding = '8px 16px';
  button.style.borderRadius = '6px';
  button.style.border = '1px solid var(--color-accent)';
  button.style.background = 'transparent';
  button.style.color = 'var(--color-accent)';
  button.style.cursor = 'pointer';
  button.style.fontSize = '13px';
  button.style.fontWeight = '600';
  button.style.transition = 'all var(--transition-fast)';
  button.style.marginTop = 'auto';

  button.addEventListener('mouseenter', () => {
    button.style.background = 'var(--color-accent)';
    button.style.color = '#000';
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = 'transparent';
    button.style.color = 'var(--color-accent)';
  });

  button.addEventListener('click', () => {
    def.action(card, button);
  });

  card.appendChild(button);
  return card;
}

function executeReview(
  api: ApiClient,
  card: HTMLElement,
  button: HTMLButtonElement,
  state: CommandState,
): void {
  showFileSearch(card, button, state, async (filePath) => {
    setCardLoading(button, true);
    try {
      const result = await api.postReview([filePath]);
      showReviewDrawer(filePath, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Review failed';
      showReviewDrawer(filePath, { status: 'error', error: message });
    } finally {
      setCardLoading(button, false);
    }
  });
}

function executeImpact(
  api: ApiClient,
  card: HTMLElement,
  button: HTMLButtonElement,
  onSelectFile: (filePath: string) => void,
  state: CommandState,
): void {
  showFileSearch(card, button, state, async (filePath) => {
    setCardLoading(button, true);
    try {
      const result = await api.postImpact([filePath]);
      showImpactBadge(card, result);
      onSelectFile(filePath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Impact prediction failed';
      showImpactBadge(card, { status: 'error', error: message });
    } finally {
      setCardLoading(button, false);
    }
  });
}

function setCardLoading(button: HTMLButtonElement, loading: boolean): void {
  if (loading) {
    button.disabled = true;
    button.style.opacity = '0.6';
    button.style.cursor = 'wait';
  } else {
    button.disabled = false;
    button.style.opacity = '1';
    button.style.cursor = 'pointer';
  }
}

function showFileSearch(
  card: HTMLElement,
  button: HTMLButtonElement,
  state: CommandState,
  onSelect: (file: string) => void,
): void {
  const existingSearch = card.querySelector('.card-search');
  if (existingSearch) {
    existingSearch.remove();
    return;
  }

  const searchContainer = document.createElement('div');
  searchContainer.className = 'card-search';
  searchContainer.style.marginTop = '8px';

  const instance = renderSearch(searchContainer, state.fileList, (item) => {
    searchContainer.remove();
    onSelect(item);
  });
  state.searchInstances.push(instance);

  card.insertBefore(searchContainer, button);
}

function showReviewDrawer(filePath: string, result: ReviewApiResponse): void {
  const content = document.createElement('div');

  if (result.error) {
    const errEl = document.createElement('p');
    errEl.textContent = `Error: ${result.error}`;
    errEl.style.color = 'var(--color-danger)';
    content.appendChild(errEl);
    openDrawer(`Review: ${filePath}`, content);
    return;
  }

  const data: Record<string, unknown> = result.data || (result as unknown as Record<string, unknown>);

  if (data.risk_summary || data.riskSummary) {
    const section = createDrawerSection('Risk Summary');
    const summary = data.risk_summary || data.riskSummary;
    const p = document.createElement('p');
    p.textContent = typeof summary === 'string' ? summary : JSON.stringify(summary, null, 2);
    p.style.color = 'var(--color-text-muted)';
    p.style.whiteSpace = 'pre-wrap';
    p.style.fontFamily = 'Fira Code, monospace';
    p.style.fontSize = '12px';
    section.appendChild(p);
    content.appendChild(section);
  }

  if (data.files || data.file_risks) {
    const section = createDrawerSection('File Risk Assessment');
    const items = data.files || data.file_risks;
    if (Array.isArray(items)) {
      for (const item of items) {
        const el = document.createElement('div');
        el.style.padding = '8px';
        el.style.marginBottom = '8px';
        el.style.borderRadius = '4px';
        el.style.background = 'var(--color-bg-secondary)';
        el.style.fontSize = '12px';
        el.style.fontFamily = 'Fira Code, monospace';
        el.style.whiteSpace = 'pre-wrap';
        el.textContent = typeof item === 'string' ? item : JSON.stringify(item, null, 2);
        section.appendChild(el);
      }
    } else {
      const el = document.createElement('pre');
      el.textContent = JSON.stringify(items, null, 2);
      el.style.color = 'var(--color-text-muted)';
      el.style.fontSize = '12px';
      section.appendChild(el);
    }
    content.appendChild(section);
  }

  if (data.dependency_changes || data.dependencyChanges) {
    const section = createDrawerSection('Dependency Changes');
    const changes = data.dependency_changes || data.dependencyChanges;
    const pre = document.createElement('pre');
    pre.textContent = typeof changes === 'string' ? changes : JSON.stringify(changes, null, 2);
    pre.style.color = 'var(--color-text-muted)';
    pre.style.fontSize = '12px';
    pre.style.whiteSpace = 'pre-wrap';
    section.appendChild(pre);
    content.appendChild(section);
  }

  if (data.convention_violations || data.conventionViolations) {
    const section = createDrawerSection('Convention Violations');
    const violations = data.convention_violations || data.conventionViolations;
    const pre = document.createElement('pre');
    pre.textContent = typeof violations === 'string' ? violations : JSON.stringify(violations, null, 2);
    pre.style.color = 'var(--color-text-muted)';
    pre.style.fontSize = '12px';
    pre.style.whiteSpace = 'pre-wrap';
    section.appendChild(pre);
    content.appendChild(section);
  }

  if (!data.risk_summary && !data.riskSummary && !data.files && !data.file_risks) {
    const section = createDrawerSection('Review Results');
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(data, null, 2);
    pre.style.color = 'var(--color-text-muted)';
    pre.style.fontSize = '12px';
    pre.style.whiteSpace = 'pre-wrap';
    section.appendChild(pre);
    content.appendChild(section);
  }

  openDrawer(`Review: ${filePath}`, content);
}

function createDrawerSection(heading: string): HTMLElement {
  const section = document.createElement('div');
  section.style.marginBottom = '24px';

  const h3 = document.createElement('h3');
  h3.textContent = heading;
  h3.style.fontSize = '14px';
  h3.style.fontWeight = '600';
  h3.style.marginBottom = '12px';
  h3.style.color = 'var(--color-text-primary)';
  h3.style.paddingBottom = '8px';
  h3.style.borderBottom = '1px solid var(--color-bg-tertiary)';
  section.appendChild(h3);

  return section;
}

function showImpactBadge(card: HTMLElement, result: ImpactApiResponse): void {
  const existing = card.querySelector('.impact-badge');
  if (existing) existing.remove();

  const badge = document.createElement('div');
  badge.className = 'impact-badge';
  badge.style.position = 'absolute';
  badge.style.top = '-8px';
  badge.style.right = '-8px';
  badge.style.padding = '4px 10px';
  badge.style.borderRadius = '12px';
  badge.style.fontSize = '11px';
  badge.style.fontWeight = '600';
  badge.style.zIndex = '10';

  if (result.error) {
    badge.style.background = '#EF4444';
    badge.style.color = '#fff';
    badge.textContent = 'Error';
  } else {
    const data = result.data;
    const affected = data?.totalAffected ?? data?.total_affected ?? '?';
    const maxRisk = data?.maxRisk ?? data?.max_risk ?? 'unknown';
    badge.style.background = '#F59E0B';
    badge.style.color = '#000';
    badge.textContent = `${affected} affected - ${maxRisk} risk`;
  }

  card.style.position = 'relative';
  card.appendChild(badge);

  setTimeout(() => {
    if (badge.parentNode) badge.remove();
  }, 5000);
}

// ---- Command panel renderer (coordinator) ----

export function renderCommandPanel(ctx: PanelContext): PanelInstance {
  const { container, api, ws } = ctx;

  const dom = buildCommandDom(container);

  const state: CommandState = {
    fileList: [],
    searchInstances: [],
  };

  // Load file list for search
  async function loadFileList(): Promise<void> {
    try {
      const response = await api.fetchGraph();
      state.fileList = response.data.nodes.map((n) => n.filePath || n.name);
    } catch {
      // Fall back to empty
    }
  }
  loadFileList();

  // WS listener for graph updates
  const unsubWs = ws.onEvent((event) => {
    if (event.type === 'graph:updated') {
      loadFileList();
    }
  });

  // Card definitions
  const cardDefs: CardDef[] = [
    {
      title: 'Run Review',
      icon: icons.fileCode,
      description:
        'Analyze a file for structural impact, dependency changes, and convention compliance',
      buttonLabel: 'Select File',
      action: (card, button) => {
        executeReview(api, card, button, state);
      },
    },
    {
      title: 'Predict Impact',
      icon: icons.blastRadius,
      description:
        'View blast radius and risk assessment before making changes',
      buttonLabel: 'Select File',
      action: (card, button) => {
        executeImpact(api, card, button, ctx.onSelectFile, state);
      },
    },
    {
      title: 'Refresh Graph',
      icon: icons.refresh,
      description:
        'Trigger incremental reparse to update the knowledge graph with latest changes',
      buttonLabel: 'Refresh Now',
      action: async (_card, button) => {
        setCardLoading(button, true);
        try {
          await api.fetchStatus();
          button.textContent = 'Refreshed';
          button.style.background = 'var(--color-accent)';
          button.style.color = '#000';
          setTimeout(() => {
            button.textContent = 'Refresh Now';
            button.style.background = '';
            button.style.color = '';
            setCardLoading(button, false);
          }, 2000);
        } catch {
          button.textContent = 'Failed';
          setTimeout(() => {
            button.textContent = 'Refresh Now';
            setCardLoading(button, false);
          }, 2000);
        }
      },
    },
    {
      title: 'Export Screenshot',
      icon: icons.camera,
      description:
        'Capture the current panel as a PNG image',
      buttonLabel: 'Export PNG',
      action: async (_card, button) => {
        setCardLoading(button, true);
        try {
          const html2canvasModule = await import('html2canvas');
          const html2canvas = html2canvasModule.default as unknown as (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
          const mainEl = document.querySelector('.main') || document.querySelector('#panel-container') || document.body;
          const canvas = await html2canvas(mainEl as HTMLElement, {
            backgroundColor: '#0F172A',
            scale: 2,
          });
          canvas.toBlob((blob: Blob | null) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'codescope-dashboard.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            button.textContent = 'Screenshot downloaded as PNG';
            setTimeout(() => {
              button.textContent = 'Export PNG';
            }, 3000);
          });
        } catch {
          button.textContent = 'Export failed';
          setTimeout(() => {
            button.textContent = 'Export PNG';
          }, 2000);
        } finally {
          setCardLoading(button, false);
        }
      },
    },
  ];

  // Create cards
  for (const def of cardDefs) {
    dom.grid.appendChild(createActionCard(def));
  }

  return {
    destroy() {
      unsubWs();
      for (const inst of state.searchInstances) {
        inst.destroy();
      }
      dom.wrapper.remove();
    },
  };
}
