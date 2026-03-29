/**
 * Blast radius explorer panel.
 * Concentric ring visualization centered on a selected file, with nodes
 * colored by risk level, sized by centrality, and curved edge paths.
 * Supports forward/reverse direction toggle and type-ahead file search.
 *
 * VIZ-05, D-29, D-30, D-31.
 */

import type { ApiClient, BlastRadiusApiResponse } from '../lib/api-client.js';
import type { WebSocketClient } from '../lib/ws-client.js';
import { renderSearch } from '../components/search.js';
import { showTooltip, hideTooltip } from '../components/tooltip.js';

interface PanelContext {
  container: HTMLElement;
  api: ApiClient;
  ws: WebSocketClient;
  onSelectFile: (filePath: string) => void;
  selectedFile?: string | null;
}

interface PanelInstance {
  destroy: () => void;
}

const svgCleanupMap = new WeakMap<SVGElement, () => void>();

const RISK_COLORS: Record<string, string> = {
  Red: '#EF4444',
  Orange: '#F97316',
  Yellow: '#F59E0B',
  Green: '#22C55E',
};

const RING_RADIUS = 100; // Base radius per hop

export function renderBlastRadiusPanel(ctx: PanelContext): PanelInstance {
  const { container, api } = ctx;

  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.height = '100%';
  wrapper.style.overflow = 'hidden';
  container.appendChild(wrapper);

  // Controls bar: search + direction toggle
  const controlsBar = document.createElement('div');
  controlsBar.style.display = 'flex';
  controlsBar.style.alignItems = 'center';
  controlsBar.style.gap = '12px';
  controlsBar.style.padding = '12px 16px';
  controlsBar.style.borderBottom = '1px solid var(--color-bg-tertiary)';
  controlsBar.style.flexShrink = '0';

  // Search container
  const searchContainer = document.createElement('div');
  searchContainer.style.flex = '1';
  controlsBar.appendChild(searchContainer);

  // Direction toggle
  const toggleGroup = document.createElement('div');
  toggleGroup.style.display = 'flex';
  toggleGroup.style.borderRadius = '4px';
  toggleGroup.style.overflow = 'hidden';
  toggleGroup.style.border = '1px solid var(--color-bg-tertiary)';

  let direction: 'forward' | 'reverse' = 'forward';

  function createToggleBtn(label: string, dir: 'forward' | 'reverse'): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.padding = '4px 12px';
    btn.style.border = 'none';
    btn.style.background = 'transparent';
    btn.style.color = 'var(--color-text-muted)';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '12px';
    btn.style.transition = 'all var(--transition-fast)';
    btn.addEventListener('click', () => {
      direction = dir;
      updateToggle();
      if (selectedFile) {
        loadBlastRadius(selectedFile);
      }
    });
    return btn;
  }

  const btnDependents = createToggleBtn('Dependents', 'forward');
  const btnDependencies = createToggleBtn('Dependencies', 'reverse');
  toggleGroup.appendChild(btnDependents);
  toggleGroup.appendChild(btnDependencies);
  controlsBar.appendChild(toggleGroup);

  function updateToggle(): void {
    if (direction === 'forward') {
      btnDependents.style.background = 'var(--color-accent)';
      btnDependents.style.color = '#000';
      btnDependencies.style.background = 'transparent';
      btnDependencies.style.color = 'var(--color-text-muted)';
    } else {
      btnDependencies.style.background = 'var(--color-accent)';
      btnDependencies.style.color = '#000';
      btnDependents.style.background = 'transparent';
      btnDependents.style.color = 'var(--color-text-muted)';
    }
  }
  updateToggle();

  wrapper.appendChild(controlsBar);

  // SVG visualization area
  const svgArea = document.createElement('div');
  svgArea.style.flex = '1';
  svgArea.style.position = 'relative';
  svgArea.style.overflow = 'hidden';
  wrapper.appendChild(svgArea);

  // Info panel below SVG
  const infoPanel = document.createElement('div');
  infoPanel.style.padding = '12px 16px';
  infoPanel.style.borderTop = '1px solid var(--color-bg-tertiary)';
  infoPanel.style.fontSize = '12px';
  infoPanel.style.color = 'var(--color-text-muted)';
  infoPanel.style.flexShrink = '0';
  infoPanel.style.display = 'none';
  wrapper.appendChild(infoPanel);

  let selectedFile: string | null = null;
  let fileList: string[] = [];
  let searchInstance: { updateItems: (items: string[]) => void; destroy: () => void } | null = null;

  // SVG zoom/pan state
  let viewBoxX = 0;
  let viewBoxY = 0;
  let viewBoxScale = 1;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  // Load file list for search
  async function loadFileList(): Promise<void> {
    try {
      const response = await api.fetchGraph();
      fileList = response.data.nodes.map((n) => n.filePath || n.name);
      if (searchInstance) {
        searchInstance.updateItems(fileList);
      }
    } catch {
      // Fall back to empty list
    }
  }

  function onFileSelect(filePath: string): void {
    selectedFile = filePath;
    loadBlastRadius(filePath);
  }

  // Initialize search
  searchInstance = renderSearch(searchContainer, fileList, onFileSelect);
  loadFileList();

  // Show empty state initially
  showEmptyState();

  // Check for pre-selected file from cross-panel link
  if (ctx.selectedFile) {
    selectedFile = ctx.selectedFile;
    loadBlastRadius(ctx.selectedFile);
  }

  async function loadBlastRadius(filePath: string): Promise<void> {
    svgArea.innerHTML = '';

    // Show loading
    const loading = document.createElement('div');
    loading.className = 'empty-state';
    loading.innerHTML = '<p style="color: var(--color-text-muted);">Loading blast radius...</p>';
    svgArea.appendChild(loading);

    try {
      const response = await api.fetchBlastRadius(filePath, direction);
      svgArea.innerHTML = '';
      renderRings(response.data);
    } catch (err: unknown) {
      svgArea.innerHTML = '';
      const error = document.createElement('div');
      error.className = 'empty-state';
      const message = err instanceof Error ? err.message : 'Unknown error';
      error.innerHTML = `<p style="color: var(--color-text-muted);">Failed to load blast radius: ${message}</p>`;
      svgArea.appendChild(error);
    }
  }

  function renderRings(data: BlastRadiusApiResponse['data']): void {
    const rings = data.rings;
    const maxHop = Math.max(...Object.keys(rings).map(Number), 0);
    const totalRadius = (maxHop + 1) * RING_RADIUS;

    const svgSize = totalRadius * 2 + 100;
    const cx = svgSize / 2;
    const cy = svgSize / 2;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${svgSize} ${svgSize}`);
    svg.style.width = '100%';
    svg.style.height = '100%';

    // Ring circles (background)
    for (let hop = 1; hop <= maxHop; hop++) {
      const r = hop * RING_RADIUS;

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', String(r));
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', '#334155');
      circle.setAttribute('stroke-width', '1');
      circle.setAttribute('stroke-dasharray', '4 4');
      svg.appendChild(circle);

      // Ring label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(cx + r + 8));
      label.setAttribute('y', String(cy - 4));
      label.setAttribute('fill', '#94A3B8');
      label.setAttribute('font-size', '11');
      label.setAttribute('font-family', 'Fira Sans, sans-serif');
      label.textContent = `Hop ${hop}`;
      svg.appendChild(label);
    }

    // Node position map for edge drawing
    const nodePositions = new Map<string, { x: number; y: number }>();

    // Center node
    const centerName = data.file.split('/').pop() || data.file;
    nodePositions.set(data.file, { x: cx, y: cy });

    const centerNode = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    centerNode.setAttribute('cx', String(cx));
    centerNode.setAttribute('cy', String(cy));
    centerNode.setAttribute('r', '14');
    centerNode.setAttribute('fill', '#3B82F6');
    centerNode.setAttribute('stroke', '#F8FAFC');
    centerNode.setAttribute('stroke-width', '2');
    svg.appendChild(centerNode);

    const centerLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    centerLabel.setAttribute('x', String(cx));
    centerLabel.setAttribute('y', String(cy - 20));
    centerLabel.setAttribute('text-anchor', 'middle');
    centerLabel.setAttribute('fill', '#F8FAFC');
    centerLabel.setAttribute('font-size', '11');
    centerLabel.setAttribute('font-family', 'Fira Code, monospace');
    centerLabel.textContent = centerName;
    svg.appendChild(centerLabel);

    // Place nodes on rings
    for (let hop = 1; hop <= maxHop; hop++) {
      const ringNodes = rings[hop] || [];
      const r = hop * RING_RADIUS;

      for (let i = 0; i < ringNodes.length; i++) {
        const angle = (2 * Math.PI * i) / ringNodes.length - Math.PI / 2;
        const nx = cx + r * Math.cos(angle);
        const ny = cy + r * Math.sin(angle);

        const node = ringNodes[i];
        nodePositions.set(node.name, { x: nx, y: ny });

        // Node size by inDegree (min 6, max 18)
        const nodeSize = Math.max(6, Math.min(18, 6 + node.inDegree * 2));
        const nodeColor = RISK_COLORS[node.risk] || RISK_COLORS.Green;

        const nodeCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        nodeCircle.setAttribute('cx', String(nx.toFixed(1)));
        nodeCircle.setAttribute('cy', String(ny.toFixed(1)));
        nodeCircle.setAttribute('r', String(nodeSize));
        nodeCircle.setAttribute('fill', nodeColor);
        nodeCircle.setAttribute('stroke', 'rgba(255,255,255,0.2)');
        nodeCircle.setAttribute('stroke-width', '1');
        nodeCircle.style.cursor = 'pointer';
        nodeCircle.style.transition = 'r 0.15s ease';

        // Hover tooltip
        nodeCircle.addEventListener('mouseenter', (e) => {
          nodeCircle.setAttribute('r', String(nodeSize + 3));
          const target = e.currentTarget as unknown as HTMLElement;
          showTooltip(
            target,
            `${node.name}\nHop: ${hop}\nRisk: ${node.risk}\nIn-degree: ${node.inDegree}\nCommunity: ${node.community}`,
          );
        });
        nodeCircle.addEventListener('mouseleave', () => {
          nodeCircle.setAttribute('r', String(nodeSize));
          hideTooltip();
        });

        // Click: show detail in info panel
        nodeCircle.addEventListener('click', () => {
          showNodeInfo(node, hop);
        });

        svg.appendChild(nodeCircle);

        // Truncated label for first ring nodes (if not too many)
        if (hop === 1 && ringNodes.length <= 12) {
          const shortName = node.name.split('/').pop() || node.name;
          const nodeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          nodeLabel.setAttribute('x', String(nx.toFixed(1)));
          nodeLabel.setAttribute('y', String((ny - nodeSize - 4).toFixed(1)));
          nodeLabel.setAttribute('text-anchor', 'middle');
          nodeLabel.setAttribute('fill', '#94A3B8');
          nodeLabel.setAttribute('font-size', '9');
          nodeLabel.setAttribute('font-family', 'Fira Code, monospace');
          nodeLabel.textContent = shortName.length > 15 ? shortName.slice(0, 12) + '...' : shortName;
          svg.appendChild(nodeLabel);
        }
      }
    }

    // Draw edges as curved paths from center to ring 1, and ring N to ring N+1
    // We draw edge from center to each hop-1 node
    for (const node of rings[1] || []) {
      const from = nodePositions.get(data.file);
      const to = nodePositions.get(node.name);
      if (from && to) {
        drawCurvedEdge(svg, from, to);
      }
    }

    // For subsequent rings, draw edges from ring N to ring N+1 nodes
    // (simplified: connect each node to a random inner-ring node for visual effect)
    for (let hop = 2; hop <= maxHop; hop++) {
      const outerNodes = rings[hop] || [];
      const innerNodes = rings[hop - 1] || [];
      if (innerNodes.length === 0) continue;

      for (let i = 0; i < outerNodes.length; i++) {
        const inner = innerNodes[i % innerNodes.length];
        const from = nodePositions.get(inner.name);
        const to = nodePositions.get(outerNodes[i].name);
        if (from && to) {
          drawCurvedEdge(svg, from, to);
        }
      }
    }

    // Summary
    const summary = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    summary.setAttribute('x', '16');
    summary.setAttribute('y', '24');
    summary.setAttribute('fill', '#94A3B8');
    summary.setAttribute('font-size', '12');
    summary.setAttribute('font-family', 'Fira Sans, sans-serif');
    summary.textContent = `${data.totalAffected} affected ${data.totalAffected === 1 ? 'file' : 'files'} (${direction === 'forward' ? 'dependents' : 'dependencies'})`;
    svg.appendChild(summary);

    // Zoom/pan handlers
    setupZoomPan(svg, svgSize);

    svgArea.appendChild(svg as unknown as HTMLElement);
  }

  function drawCurvedEdge(
    svg: SVGSVGElement,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): void {
    // Quadratic bezier with control point offset perpendicular to line
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const offset = dist * 0.15;
    // Perpendicular offset
    const nx = -dy / dist;
    const ny = dx / dist;
    const cpx = midX + nx * offset;
    const cpy = midY + ny * offset;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`,
    );
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'rgba(148,163,184,0.3)');
    path.setAttribute('stroke-width', '1');

    // Insert edges before nodes (draw order: rings, edges, nodes)
    // Find first circle element and insert before it
    const firstCircle = svg.querySelector('circle');
    if (firstCircle) {
      svg.insertBefore(path, firstCircle);
    } else {
      svg.appendChild(path);
    }
  }

  function setupZoomPan(svg: SVGSVGElement, size: number): void {
    viewBoxX = 0;
    viewBoxY = 0;
    viewBoxScale = 1;

    function updateViewBox(): void {
      const w = size * viewBoxScale;
      const h = size * viewBoxScale;
      svg.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${w} ${h}`);
    }

    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const newScale = Math.max(0.3, Math.min(3, viewBoxScale * factor));

      // Zoom toward mouse position
      const rect = (svg as unknown as HTMLElement).getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * size * viewBoxScale + viewBoxX;
      const my = ((e.clientY - rect.top) / rect.height) * size * viewBoxScale + viewBoxY;

      viewBoxX = mx - ((e.clientX - rect.left) / rect.width) * size * newScale;
      viewBoxY = my - ((e.clientY - rect.top) / rect.height) * size * newScale;
      viewBoxScale = newScale;
      updateViewBox();
    });

    svg.addEventListener('mousedown', (e) => {
      if (e.target === svg || (e.target as Element).tagName === 'circle') return; // Don't pan when clicking nodes
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    });

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const rect = (svg as unknown as HTMLElement).getBoundingClientRect();
      const dx = ((e.clientX - dragStartX) / rect.width) * size * viewBoxScale;
      const dy = ((e.clientY - dragStartY) / rect.height) * size * viewBoxScale;
      viewBoxX -= dx;
      viewBoxY -= dy;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      updateViewBox();
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Store cleanup refs via WeakMap (avoids `as any` cast)
    svgCleanupMap.set(svg, () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    });
  }

  function showNodeInfo(
    node: { name: string; risk: string; inDegree: number; community: number },
    hop: number,
  ): void {
    infoPanel.style.display = 'block';
    infoPanel.innerHTML = '';

    const riskColor = RISK_COLORS[node.risk] || '#94A3B8';

    infoPanel.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-family: Fira Code, monospace; font-size: 13px; color: var(--color-text-primary);">${node.name}</span>
        <span style="font-size: 11px; padding: 2px 8px; border-radius: 3px; background: ${riskColor}20; color: ${riskColor}; font-weight: 600;">${node.risk}</span>
        <span style="font-size: 11px; color: var(--color-text-muted);">Hop ${hop}</span>
        <span style="font-size: 11px; color: var(--color-text-muted);">In-degree: ${node.inDegree}</span>
        <span style="font-size: 11px; color: var(--color-text-muted);">Community: ${node.community}</span>
      </div>
    `;
  }

  function showEmptyState(): void {
    svgArea.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';

    const heading = document.createElement('h2');
    heading.textContent = 'Blast Radius Explorer';

    const body = document.createElement('p');
    body.textContent =
      'Select a file to explore its blast radius. Use the search bar above or click a node in the Graph panel.';

    empty.appendChild(heading);
    empty.appendChild(body);
    svgArea.appendChild(empty);
  }

  return {
    destroy() {
      // Clean up zoom/pan handlers
      const svg = svgArea.querySelector('svg');
      if (svg) {
        const cleanup = svgCleanupMap.get(svg);
        if (cleanup) cleanup();
      }
      if (searchInstance) {
        searchInstance.destroy();
      }
      wrapper.remove();
    },
  };
}
