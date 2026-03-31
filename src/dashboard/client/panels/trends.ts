/**
 * Readiness trends panel.
 * Shows 4 SVG semicircular gauge charts with current readiness percentages
 * and letter grades, plus a historical trend line chart with togglable series.
 *
 * VIZ-04, D-26, D-27, D-28.
 */

import type { ApiClient, ReadinessApiResponse } from '../lib/api-client.js';
import type { WebSocketClient } from '../lib/ws-client.js';
import { formatPercent, formatGrade } from '../lib/format.js';
import { showTooltip, hideTooltip } from '../components/tooltip.js';

interface PanelContext {
  container: HTMLElement;
  api: ApiClient;
  ws: WebSocketClient;
  onSelectFile: (filePath: string) => void;
}

interface PanelInstance {
  destroy: () => void;
}

interface DimensionDef {
  key: keyof Omit<
    ReadinessApiResponse['data']['history'][0],
    'timestamp' | 'overall_percent'
  >;
  label: string;
  color: string;
}

/** DOM elements created by buildTrendsDom. */
interface TrendsDom {
  wrapper: HTMLElement;
  gaugeContainer: HTMLElement;
  chartContainer: HTMLElement;
  legendContainer: HTMLElement;
}

/** Mutable state for the trends panel. */
interface TrendsState {
  seriesVisible: Record<string, boolean>;
  chartElement: HTMLElement | null;
}

const DIMENSIONS: DimensionDef[] = [
  { key: 'convention_coverage', label: 'Convention Coverage', color: '#22C55E' },
  { key: 'type_safety', label: 'Type Safety', color: '#3B82F6' },
  { key: 'test_coverage_proxy', label: 'Test Coverage', color: '#F59E0B' },
  { key: 'import_graph_health', label: 'Import Health', color: '#A855F7' },
];

const CANVAS_THRESHOLD = 100;

function gaugeColor(percent: number): string {
  if (percent >= 75) return '#22C55E';
  if (percent >= 50) return '#F59E0B';
  return '#EF4444';
}

// ---- Module-private helpers ----

function buildTrendsDom(container: HTMLElement): TrendsDom {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.height = '100%';
  wrapper.style.overflow = 'auto';
  container.appendChild(wrapper);

  const gaugeContainer = document.createElement('div');
  gaugeContainer.style.display = 'grid';
  gaugeContainer.style.gridTemplateColumns = 'repeat(4, 1fr)';
  gaugeContainer.style.gap = '24px';
  gaugeContainer.style.padding = '24px';
  gaugeContainer.style.flexShrink = '0';
  wrapper.appendChild(gaugeContainer);

  const chartContainer = document.createElement('div');
  chartContainer.style.flex = '1';
  chartContainer.style.padding = '0 24px 24px';
  chartContainer.style.minHeight = '300px';
  wrapper.appendChild(chartContainer);

  const legendContainer = document.createElement('div');
  legendContainer.style.display = 'flex';
  legendContainer.style.justifyContent = 'center';
  legendContainer.style.gap = '24px';
  legendContainer.style.padding = '0 24px 24px';
  legendContainer.style.flexShrink = '0';
  wrapper.appendChild(legendContainer);

  return { wrapper, gaugeContainer, chartContainer, legendContainer };
}

function renderGauges(gaugeContainer: HTMLElement, data: ReadinessApiResponse['data']): void {
  gaugeContainer.innerHTML = '';
  for (const dim of DIMENSIONS) {
    const value = data.current[dim.key as keyof typeof data.current] as number;
    gaugeContainer.appendChild(createGauge(dim.label, value));
  }
}

function createGauge(label: string, percent: number): HTMLElement {
  const gaugeWrapper = document.createElement('div');
  gaugeWrapper.style.display = 'flex';
  gaugeWrapper.style.flexDirection = 'column';
  gaugeWrapper.style.alignItems = 'center';
  gaugeWrapper.style.gap = '8px';

  const radius = 60;
  const strokeWidth = 12;
  const cx = 70;
  const cy = 70;
  const color = gaugeColor(percent);
  const grade = formatGrade(percent);

  const bgStartX = cx - radius;
  const bgEndX = cx + radius;
  const bgPath = `M ${bgStartX} ${cy} A ${radius} ${radius} 0 1 1 ${bgEndX} ${cy}`;

  const endAngle = Math.PI - (percent / 100) * Math.PI;
  const fillEndX = cx + radius * Math.cos(endAngle);
  const fillEndY = cy - radius * Math.sin(endAngle);
  const largeArc = percent > 50 ? 1 : 0;
  const fillPath = `M ${bgStartX} ${cy} A ${radius} ${radius} 0 ${largeArc} 1 ${fillEndX.toFixed(2)} ${fillEndY.toFixed(2)}`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 140 90');
  svg.setAttribute('width', '140');
  svg.setAttribute('height', '90');

  const bgArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  bgArc.setAttribute('d', bgPath);
  bgArc.setAttribute('fill', 'none');
  bgArc.setAttribute('stroke', '#334155');
  bgArc.setAttribute('stroke-width', String(strokeWidth));
  bgArc.setAttribute('stroke-linecap', 'round');
  svg.appendChild(bgArc);

  const fillArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  fillArc.setAttribute('d', fillPath);
  fillArc.setAttribute('fill', 'none');
  fillArc.setAttribute('stroke', color);
  fillArc.setAttribute('stroke-width', String(strokeWidth));
  fillArc.setAttribute('stroke-linecap', 'round');
  svg.appendChild(fillArc);

  const pctText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  pctText.setAttribute('x', String(cx));
  pctText.setAttribute('y', String(cy - 8));
  pctText.setAttribute('text-anchor', 'middle');
  pctText.setAttribute('fill', 'var(--color-text-primary)');
  pctText.setAttribute('font-family', 'Fira Code, monospace');
  pctText.setAttribute('font-size', '28');
  pctText.setAttribute('font-weight', '600');
  pctText.textContent = `${Math.round(percent)}`;
  svg.appendChild(pctText);

  const gradeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  gradeText.setAttribute('x', String(cx));
  gradeText.setAttribute('y', String(cy + 10));
  gradeText.setAttribute('text-anchor', 'middle');
  gradeText.setAttribute('fill', color);
  gradeText.setAttribute('font-family', 'Fira Code, monospace');
  gradeText.setAttribute('font-size', '14');
  gradeText.textContent = grade;
  svg.appendChild(gradeText);

  gaugeWrapper.appendChild(svg);

  const labelEl = document.createElement('div');
  labelEl.textContent = label;
  labelEl.style.fontSize = '12px';
  labelEl.style.color = 'var(--color-text-muted)';
  labelEl.style.fontFamily = 'Fira Sans, sans-serif';
  labelEl.style.textAlign = 'center';
  gaugeWrapper.appendChild(labelEl);

  return gaugeWrapper;
}

function renderTrendChart(
  chartContainer: HTMLElement,
  history: ReadinessApiResponse['data']['history'],
  state: TrendsState,
): void {
  chartContainer.innerHTML = '';
  if (history.length > CANVAS_THRESHOLD) {
    renderCanvasChart(chartContainer, history, state);
  } else {
    renderSvgChart(chartContainer, history, state);
  }
}

function renderSvgChart(
  chartContainer: HTMLElement,
  history: ReadinessApiResponse['data']['history'],
  state: TrendsState,
): void {
  const width = 800;
  const height = 250;
  const padLeft = 50;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 40;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.width = '100%';
  svg.style.maxHeight = '250px';
  state.chartElement = svg as unknown as HTMLElement;

  const yLabels = [0, 25, 50, 75, 100];
  for (const val of yLabels) {
    const y = padTop + chartH - (val / 100) * chartH;

    const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    gridLine.setAttribute('x1', String(padLeft));
    gridLine.setAttribute('y1', String(y));
    gridLine.setAttribute('x2', String(width - padRight));
    gridLine.setAttribute('y2', String(y));
    gridLine.setAttribute('stroke', '#334155');
    gridLine.setAttribute('stroke-width', '1');
    svg.appendChild(gridLine);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(padLeft - 8));
    label.setAttribute('y', String(y + 4));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('fill', 'var(--color-text-muted)');
    label.setAttribute('font-size', '11');
    label.setAttribute('font-family', 'Fira Code, monospace');
    label.textContent = `${val}%`;
    svg.appendChild(label);
  }

  const maxXLabels = Math.min(history.length, 8);
  const xStep = Math.max(1, Math.floor(history.length / maxXLabels));
  for (let i = 0; i < history.length; i += xStep) {
    const x = padLeft + (i / Math.max(1, history.length - 1)) * chartW;
    const date = new Date(history[i].timestamp);
    const label = `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}`;

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(height - padBottom + 20));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'var(--color-text-muted)');
    text.setAttribute('font-size', '11');
    text.setAttribute('font-family', 'Fira Sans, sans-serif');
    text.textContent = label;
    svg.appendChild(text);
  }

  for (const dim of DIMENSIONS) {
    const points = history
      .map((entry, i) => {
        const x = padLeft + (i / Math.max(1, history.length - 1)) * chartW;
        const val = entry[dim.key as keyof typeof entry] as number;
        const y = padTop + chartH - (val / 100) * chartH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', dim.color);
    polyline.setAttribute('stroke-width', '2');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.setAttribute('data-series', dim.key);
    polyline.style.display = state.seriesVisible[dim.key] ? 'block' : 'none';
    svg.appendChild(polyline);

    for (let i = 0; i < history.length; i++) {
      const x = padLeft + (i / Math.max(1, history.length - 1)) * chartW;
      const val = history[i][dim.key as keyof (typeof history)[0]] as number;
      const y = padTop + chartH - (val / 100) * chartH;

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(x.toFixed(1)));
      circle.setAttribute('cy', String(y.toFixed(1)));
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', 'transparent');
      circle.setAttribute('data-series', dim.key);
      circle.style.cursor = 'pointer';
      circle.style.display = state.seriesVisible[dim.key] ? 'block' : 'none';

      const timestamp = history[i].timestamp;
      const displayVal = val;
      circle.addEventListener('mouseenter', (e) => {
        circle.setAttribute('fill', dim.color);
        const target = e.currentTarget as unknown as HTMLElement;
        showTooltip(target, `${dim.label}: ${formatPercent(displayVal)}\n${new Date(timestamp).toLocaleString()}`);
      });
      circle.addEventListener('mouseleave', () => {
        circle.setAttribute('fill', 'transparent');
        hideTooltip();
      });
      svg.appendChild(circle);
    }
  }

  chartContainer.appendChild(svg as unknown as HTMLElement);
}

function renderCanvasChart(
  chartContainer: HTMLElement,
  history: ReadinessApiResponse['data']['history'],
  state: TrendsState,
): void {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  const width = 800;
  const height = 250;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.maxWidth = '100%';
  canvas.style.height = `${height}px`;

  const c = canvas.getContext('2d')!;
  c.scale(dpr, dpr);

  const padLeft = 50;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 40;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  c.strokeStyle = '#334155';
  c.lineWidth = 1;
  for (const val of [0, 25, 50, 75, 100]) {
    const y = padTop + chartH - (val / 100) * chartH;
    c.beginPath();
    c.moveTo(padLeft, y);
    c.lineTo(width - padRight, y);
    c.stroke();

    c.fillStyle = '#94A3B8';
    c.font = '11px "Fira Code", monospace';
    c.textAlign = 'right';
    c.fillText(`${val}%`, padLeft - 8, y + 4);
  }

  const maxXLabels = Math.min(history.length, 8);
  const xStep = Math.max(1, Math.floor(history.length / maxXLabels));
  c.textAlign = 'center';
  c.font = '11px "Fira Sans", sans-serif';
  for (let i = 0; i < history.length; i += xStep) {
    const x = padLeft + (i / Math.max(1, history.length - 1)) * chartW;
    const date = new Date(history[i].timestamp);
    const label = `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}`;
    c.fillText(label, x, height - padBottom + 20);
  }

  for (const dim of DIMENSIONS) {
    if (!state.seriesVisible[dim.key]) continue;

    c.strokeStyle = dim.color;
    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.beginPath();

    for (let i = 0; i < history.length; i++) {
      const x = padLeft + (i / Math.max(1, history.length - 1)) * chartW;
      const val = history[i][dim.key as keyof (typeof history)[0]] as number;
      const y = padTop + chartH - (val / 100) * chartH;
      if (i === 0) {
        c.moveTo(x, y);
      } else {
        c.lineTo(x, y);
      }
    }
    c.stroke();
  }

  chartContainer.appendChild(canvas);
  state.chartElement = canvas;
}

function renderLegend(
  legendContainer: HTMLElement,
  state: TrendsState,
  loadData: () => Promise<void>,
): void {
  legendContainer.innerHTML = '';

  for (const dim of DIMENSIONS) {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '6px';
    item.style.cursor = 'pointer';
    item.style.opacity = state.seriesVisible[dim.key] ? '1' : '0.3';
    item.style.transition = 'opacity var(--transition-fast)';

    const dot = document.createElement('div');
    dot.style.width = '10px';
    dot.style.height = '10px';
    dot.style.borderRadius = '50%';
    dot.style.background = dim.color;
    item.appendChild(dot);

    const label = document.createElement('span');
    label.textContent = dim.label;
    label.style.fontSize = '12px';
    label.style.color = 'var(--color-text-muted)';
    item.appendChild(label);

    item.addEventListener('click', () => {
      state.seriesVisible[dim.key] = !state.seriesVisible[dim.key];
      item.style.opacity = state.seriesVisible[dim.key] ? '1' : '0.3';

      if (state.chartElement && state.chartElement.tagName === 'svg') {
        const svgEl = state.chartElement as unknown as SVGSVGElement;
        const elements = svgEl.querySelectorAll(`[data-series="${dim.key}"]`);
        for (const el of elements) {
          (el as SVGElement).style.display = state.seriesVisible[dim.key]
            ? 'block'
            : 'none';
        }
      } else {
        loadData();
      }
    });

    legendContainer.appendChild(item);
  }
}

function subscribeUpdates(
  ws: WebSocketClient,
  loadData: () => Promise<void>,
): () => void {
  return ws.onEvent((event) => {
    if (event.type === 'readiness:snapshot') {
      loadData();
    }
  });
}

function showTrendsEmptyState(dom: TrendsDom): void {
  dom.gaugeContainer.innerHTML = '';
  dom.chartContainer.innerHTML = '';
  dom.legendContainer.innerHTML = '';

  const empty = document.createElement('div');
  empty.className = 'empty-state';

  const heading = document.createElement('h2');
  heading.textContent = 'No readiness history';

  const body = document.createElement('p');
  body.textContent =
    'Readiness snapshots are recorded after each bootstrap. Run bootstrap at least twice to see trend data.';

  empty.appendChild(heading);
  empty.appendChild(body);
  dom.wrapper.appendChild(empty);
}

// ---- Trends panel renderer (coordinator) ----

export function renderTrendsPanel(ctx: PanelContext): PanelInstance {
  const { container, api, ws } = ctx;

  const dom = buildTrendsDom(container);

  const state: TrendsState = {
    seriesVisible: {},
    chartElement: null,
  };

  for (const dim of DIMENSIONS) {
    state.seriesVisible[dim.key] = true;
  }

  // Data loading
  async function loadData(): Promise<void> {
    try {
      const response = await api.fetchReadiness();
      renderContent(response.data);
    } catch {
      showTrendsEmptyState(dom);
    }
  }

  function renderContent(data: ReadinessApiResponse['data']): void {
    if (!data.current) {
      showTrendsEmptyState(dom);
      return;
    }

    renderGauges(dom.gaugeContainer, data);

    dom.chartContainer.innerHTML = '';
    if (data.history.length > 0) {
      renderTrendChart(dom.chartContainer, data.history, state);
    } else {
      const noHistory = document.createElement('div');
      noHistory.className = 'empty-state';
      noHistory.style.padding = '32px';
      const p = document.createElement('p');
      p.textContent = 'Run bootstrap at least twice to see trend data.';
      p.style.color = 'var(--color-text-muted)';
      noHistory.appendChild(p);
      dom.chartContainer.appendChild(noHistory);
    }

    renderLegend(dom.legendContainer, state, loadData);
  }

  // WebSocket subscription
  const unsubWs = subscribeUpdates(ws, loadData);

  // Initial load
  loadData();

  return {
    destroy() {
      unsubWs();
      dom.wrapper.remove();
    },
  };
}
