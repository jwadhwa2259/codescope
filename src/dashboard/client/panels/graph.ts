/**
 * sigma.js dependency graph panel with FA2 layout, node interactions, search.
 * Renders the knowledge graph with nodes sized by centrality, colored by community,
 * and danger zones highlighted with red borders.
 *
 * Per D-19 through D-22, VIZ-02.
 */

import Sigma from 'sigma';
import { DirectedGraph } from 'graphology';
import { createNodeBorderProgram } from '@sigma/node-border';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import { renderSearch } from '../components/search.js';
import type { ApiClient, GraphNode, GraphEdge } from '../lib/api-client.js';
import type { WebSocketClient } from '../lib/ws-client.js';

// ---- Types ----

interface PanelContext {
  container: HTMLElement;
  api: ApiClient;
  ws: WebSocketClient;
  onSelectFile: (filePath: string) => void;
}

interface PanelInstance {
  destroy: () => void;
}

/** Mutable state shared across all helpers within a single panel lifecycle. */
interface GraphPanelState {
  sigma: Sigma | null;
  fa2: FA2Layout | null;
  fa2StopTimer: ReturnType<typeof setTimeout> | null;
  graph: DirectedGraph | null;
  unsubscribeWs: (() => void) | null;
  searchInstance: ReturnType<typeof renderSearch> | null;
  detailOverlay: HTMLElement | null;
  highlightedNode: string | null;
}

/** DOM elements created by buildGraphDom. */
interface GraphDom {
  panelWrapper: HTMLElement;
  searchContainer: HTMLElement;
  breadcrumb: HTMLElement;
  graphContainer: HTMLElement;
  detailOverlay: HTMLElement;
}

// ---- Community color palette (from UI-SPEC) ----

const COMMUNITY_COLORS = [
  '#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#A855F7',
  '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#14B8A6',
  '#8B5CF6', '#78716C',
];

// ---- Module-private helpers ----

function buildGraphDom(container: HTMLElement): GraphDom {
  const panelWrapper = document.createElement('div');
  panelWrapper.style.display = 'flex';
  panelWrapper.style.flexDirection = 'column';
  panelWrapper.style.height = '100%';
  panelWrapper.style.position = 'relative';

  const searchContainer = document.createElement('div');
  searchContainer.style.position = 'relative';
  searchContainer.style.padding = '8px 16px';
  searchContainer.style.flexShrink = '0';
  panelWrapper.appendChild(searchContainer);

  const breadcrumb = document.createElement('div');
  breadcrumb.style.display = 'none';
  breadcrumb.style.padding = '4px 16px';
  breadcrumb.style.fontSize = '12px';
  breadcrumb.style.color = 'var(--color-text-muted)';
  breadcrumb.style.fontFamily = 'var(--font-mono)';
  breadcrumb.style.flexShrink = '0';
  panelWrapper.appendChild(breadcrumb);

  const graphContainer = document.createElement('div');
  graphContainer.style.flex = '1';
  graphContainer.style.position = 'relative';
  graphContainer.style.minHeight = '0';
  panelWrapper.appendChild(graphContainer);

  const detailOverlay = document.createElement('div');
  detailOverlay.style.position = 'absolute';
  detailOverlay.style.top = '8px';
  detailOverlay.style.right = '8px';
  detailOverlay.style.background = 'var(--color-bg-tertiary)';
  detailOverlay.style.padding = '16px';
  detailOverlay.style.borderRadius = '4px';
  detailOverlay.style.minWidth = '280px';
  detailOverlay.style.maxWidth = '360px';
  detailOverlay.style.display = 'none';
  detailOverlay.style.fontFamily = 'var(--font-mono)';
  detailOverlay.style.fontSize = '12px';
  detailOverlay.style.lineHeight = '1.6';
  detailOverlay.style.zIndex = '10';
  detailOverlay.style.color = 'var(--color-text-primary)';
  graphContainer.appendChild(detailOverlay);

  container.appendChild(panelWrapper);

  return { panelWrapper, searchContainer, breadcrumb, graphContainer, detailOverlay };
}

function initSigmaGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  dangerZones: string[],
  state: GraphPanelState,
  dom: GraphDom,
  onSelectFile: (filePath: string) => void,
  loadGraphData: () => Promise<void>,
  cleanup: () => void,
): void {
  const dangerSet = new Set(dangerZones);
  state.graph = new DirectedGraph();

  for (const node of nodes) {
    state.graph.addNode(node.id, {
      label: node.name,
      filePath: node.filePath,
      centrality: node.centrality,
      community: node.community,
      isDangerZone: node.isDangerZone || dangerSet.has(node.filePath),
      x: node.x ?? Math.random() * 100,
      y: node.y ?? Math.random() * 100,
      size: 4 + node.centrality * 20,
    });
  }

  for (const edge of edges) {
    if (state.graph.hasNode(edge.source) && state.graph.hasNode(edge.target)) {
      try {
        state.graph.addEdge(edge.source, edge.target, { kind: edge.kind });
      } catch {
        // Duplicate edge -- skip
      }
    }
  }

  const filePaths = nodes.map((n) => n.filePath);
  state.searchInstance?.updateItems(filePaths);

  if (state.graph.order > 2000) {
    renderSuperNodes(state.graph, nodes, state, dom, onSelectFile, loadGraphData, cleanup);
  } else {
    renderFullGraph(state.graph, state, dom, onSelectFile);
  }
}

function setupFA2Layout(g: DirectedGraph, state: GraphPanelState): void {
  const useBarnesHut = g.order > 500;
  state.fa2 = new FA2Layout(g, {
    settings: {
      barnesHutOptimize: useBarnesHut,
      scalingRatio: 10,
      gravity: 0.05,
      slowDown: 5,
    },
  });
  state.fa2.start();

  state.fa2StopTimer = setTimeout(() => {
    state.fa2?.stop();
    state.fa2StopTimer = null;
  }, 5000);
}

function bindGraphEvents(
  g: DirectedGraph,
  state: GraphPanelState,
  dom: GraphDom,
  onSelectFile: (filePath: string) => void,
  defaultNodeReducer: (node: string, data: Record<string, any>) => Record<string, any>,
  defaultEdgeReducer: (edge: string, data: Record<string, any>) => Record<string, any>,
): void {
  if (!state.sigma) return;

  state.sigma.on('clickNode', ({ node }) => {
    showNodeDetail(node, state, dom);
  });

  state.sigma.on('enterNode', ({ node }) => {
    state.highlightedNode = node;
    const connectedNodes = new Set(g.neighbors(node));
    connectedNodes.add(node);

    state.sigma?.setSetting('nodeReducer', (n: string, data: Record<string, any>) => {
      const base = defaultNodeReducer(n, data);
      if (!connectedNodes.has(n)) {
        return {
          ...base,
          color: '#334155',
          zIndex: 0,
          label: '',
        };
      }
      return { ...base, zIndex: 1 };
    });

    state.sigma?.setSetting('edgeReducer', (edge: string, data: Record<string, any>) => {
      const source = g.source(edge);
      const target = g.target(edge);
      if (source === node || target === node) {
        return { ...data, color: '#94A3B8', size: 1 };
      }
      return { ...data, color: '#1E293B', size: 0.3 };
    });
  });

  state.sigma.on('leaveNode', () => {
    state.highlightedNode = null;
    state.sigma?.setSetting('nodeReducer', defaultNodeReducer);
    state.sigma?.setSetting('edgeReducer', defaultEdgeReducer);
  });

  state.sigma.on('doubleClickNode', ({ node }) => {
    const attrs = g.getNodeAttributes(node);
    onSelectFile(attrs.filePath);
  });
}

function subscribeGraphUpdates(
  ws: WebSocketClient,
  state: GraphPanelState,
  cleanup: () => void,
  loadGraphData: () => Promise<void>,
): void {
  state.unsubscribeWs = ws.onEvent((event) => {
    if (event.type === 'graph:updated') {
      cleanup();
      loadGraphData();
    }
  });
}

// ---- Full graph rendering ----

function renderFullGraph(
  g: DirectedGraph,
  state: GraphPanelState,
  dom: GraphDom,
  onSelectFile: (filePath: string) => void,
): void {
  const defaultNodeReducer = (node: string, data: Record<string, any>) => ({
    ...data,
    color: COMMUNITY_COLORS[data.community % COMMUNITY_COLORS.length],
    borderSize: data.isDangerZone ? 0.3 : 0,
    borderColor: '#EF4444',
  });

  const defaultEdgeReducer = (_edge: string, data: Record<string, any>) => ({
    ...data,
    color: '#334155',
    size: 0.5,
  });

  state.sigma = new Sigma(g, dom.graphContainer, {
    defaultNodeType: 'bordered',
    nodeProgramClasses: {
      bordered: createNodeBorderProgram({
        borders: [
          {
            size: { attribute: 'borderSize', defaultValue: 0 },
            color: { attribute: 'borderColor' },
          },
        ],
      }),
    },
    nodeReducer: defaultNodeReducer,
    edgeReducer: defaultEdgeReducer,
    labelColor: { color: '#F8FAFC' },
    labelFont: 'Fira Code',
    labelSize: 12,
  });

  setupFA2Layout(g, state);
  bindGraphEvents(g, state, dom, onSelectFile, defaultNodeReducer, defaultEdgeReducer);
}

// ---- Super-node rendering for large graphs (2000+) ----

function renderSuperNodes(
  g: DirectedGraph,
  nodes: GraphNode[],
  state: GraphPanelState,
  dom: GraphDom,
  onSelectFile: (filePath: string) => void,
  loadGraphData: () => Promise<void>,
  cleanup: () => void,
): void {
  const communities = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const list = communities.get(node.community) || [];
    list.push(node);
    communities.set(node.community, list);
  }

  const superGraph = new DirectedGraph();
  const communityPositions = new Map<number, { x: number; y: number }>();

  let i = 0;
  const total = communities.size;
  for (const [communityId, members] of communities) {
    const angle = (2 * Math.PI * i) / total;
    const x = 50 * Math.cos(angle);
    const y = 50 * Math.sin(angle);
    communityPositions.set(communityId, { x, y });

    superGraph.addNode(`community-${communityId}`, {
      label: `Community ${communityId} (${members.length} files)`,
      community: communityId,
      size: 8 + Math.min(members.length, 100) * 0.2,
      x,
      y,
      isDangerZone: members.some((m) => m.isDangerZone),
      memberCount: members.length,
    });
    i++;
  }

  const crossEdges = new Map<string, number>();
  g.forEachEdge((_edge, _attrs, source, target) => {
    const srcCommunity = g.getNodeAttribute(source, 'community');
    const tgtCommunity = g.getNodeAttribute(target, 'community');
    if (srcCommunity !== tgtCommunity) {
      const key = `${srcCommunity}->${tgtCommunity}`;
      crossEdges.set(key, (crossEdges.get(key) || 0) + 1);
    }
  });

  for (const [key, count] of crossEdges) {
    const [src, tgt] = key.split('->');
    const srcNode = `community-${src}`;
    const tgtNode = `community-${tgt}`;
    if (superGraph.hasNode(srcNode) && superGraph.hasNode(tgtNode)) {
      try {
        superGraph.addEdge(srcNode, tgtNode, {
          kind: 'cross-community',
          weight: count,
        });
      } catch {
        // Duplicate edge
      }
    }
  }

  state.sigma = new Sigma(superGraph, dom.graphContainer, {
    defaultNodeType: 'bordered',
    nodeProgramClasses: {
      bordered: createNodeBorderProgram({
        borders: [
          {
            size: { attribute: 'borderSize', defaultValue: 0 },
            color: { attribute: 'borderColor' },
          },
        ],
      }),
    },
    nodeReducer: (_node: string, data: Record<string, any>) => ({
      ...data,
      color: COMMUNITY_COLORS[data.community % COMMUNITY_COLORS.length],
      borderSize: data.isDangerZone ? 0.3 : 0,
      borderColor: '#EF4444',
    }),
    edgeReducer: (_edge: string, data: Record<string, any>) => ({
      ...data,
      color: '#334155',
      size: Math.min((data.weight || 1) * 0.3, 3),
    }),
    labelColor: { color: '#F8FAFC' },
    labelFont: 'Fira Code',
    labelSize: 12,
  });

  dom.breadcrumb.style.display = 'block';
  dom.breadcrumb.innerHTML = '<strong>All communities</strong> (click a community to drill in)';

  state.sigma.on('clickNode', ({ node }) => {
    const communityId = superGraph.getNodeAttribute(node, 'community');
    drillIntoCommunity(g, communityId, nodes, state, dom, onSelectFile, loadGraphData, cleanup);
  });
}

function drillIntoCommunity(
  fullGraph: DirectedGraph,
  communityId: number,
  allNodes: GraphNode[],
  state: GraphPanelState,
  dom: GraphDom,
  onSelectFile: (filePath: string) => void,
  loadGraphData: () => Promise<void>,
  cleanup: () => void,
): void {
  if (state.sigma) {
    state.sigma.kill();
    state.sigma = null;
  }

  const communityNodes = allNodes.filter((n) => n.community === communityId);
  const nodeIds = new Set(communityNodes.map((n) => n.id));

  const subGraph = new DirectedGraph();

  const total = communityNodes.length;
  for (let i = 0; i < total; i++) {
    const node = communityNodes[i];
    const angle = (2 * Math.PI * i) / total;
    subGraph.addNode(node.id, {
      label: node.name,
      filePath: node.filePath,
      centrality: node.centrality,
      community: node.community,
      isDangerZone: node.isDangerZone,
      x: 50 * Math.cos(angle),
      y: 50 * Math.sin(angle),
      size: 4 + node.centrality * 20,
    });
  }

  fullGraph.forEachEdge((_edge, attrs, source, target) => {
    if (nodeIds.has(source) && nodeIds.has(target)) {
      try {
        subGraph.addEdge(source, target, { kind: attrs.kind });
      } catch {
        // skip duplicates
      }
    }
  });

  state.graph = subGraph;

  renderFullGraph(subGraph, state, dom, onSelectFile);

  dom.breadcrumb.style.display = 'block';
  dom.breadcrumb.innerHTML = '';

  const allLink = document.createElement('a');
  allLink.href = '#';
  allLink.textContent = 'All';
  allLink.style.color = 'var(--color-info)';
  allLink.style.textDecoration = 'none';
  allLink.addEventListener('click', (e) => {
    e.preventDefault();
    cleanup();
    loadGraphData();
  });
  dom.breadcrumb.appendChild(allLink);
  dom.breadcrumb.appendChild(document.createTextNode(` > Community ${communityId}`));
}

// ---- Node detail overlay ----

function showNodeDetail(nodeId: string, state: GraphPanelState, dom: GraphDom): void {
  if (!state.graph || !dom.detailOverlay) return;
  const attrs = state.graph.getNodeAttributes(nodeId);

  dom.detailOverlay.style.display = 'block';
  dom.detailOverlay.innerHTML = `
    <div style="margin-bottom: 8px; font-size: 14px; font-weight: 600; word-break: break-all;">
      ${escapeHtml(attrs.filePath || attrs.label || nodeId)}
    </div>
    <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px;">
      <span style="color: var(--color-text-muted);">Centrality</span>
      <span>${(attrs.centrality ?? 0).toFixed(2)}</span>
      <span style="color: var(--color-text-muted);">Community</span>
      <span>${attrs.community ?? 'N/A'}</span>
      <span style="color: var(--color-text-muted);">Imports</span>
      <span>${state.graph.outDegree(nodeId)}</span>
      <span style="color: var(--color-text-muted);">Importers</span>
      <span>${state.graph.inDegree(nodeId)}</span>
      <span style="color: var(--color-text-muted);">Danger zone</span>
      <span style="color: ${attrs.isDangerZone ? 'var(--color-danger)' : 'var(--color-text-muted)'};">
        ${attrs.isDangerZone ? 'Yes' : 'No'}
      </span>
    </div>
    <div style="margin-top: 12px; font-size: 11px; color: var(--color-text-muted);">
      Double-click to view blast radius
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Empty / error states ----

function showEmptyState(graphContainer: HTMLElement): void {
  graphContainer.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty-state';

  const heading = document.createElement('h2');
  heading.textContent = 'No codebase data yet';

  const body = document.createElement('p');
  body.textContent =
    'Run bootstrap to analyze your codebase. Use /codescope:bootstrap or npx codescope bootstrap to get started.';

  empty.appendChild(heading);
  empty.appendChild(body);
  graphContainer.appendChild(empty);
}

function showErrorState(graphContainer: HTMLElement): void {
  graphContainer.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty-state';

  const heading = document.createElement('h2');
  heading.textContent = 'Failed to load data';

  const body = document.createElement('p');
  body.textContent =
    'The dashboard server may have stopped. Check terminal for errors.';

  empty.appendChild(heading);
  empty.appendChild(body);
  graphContainer.appendChild(empty);
}

// ---- Cleanup helper ----

function cleanupState(state: GraphPanelState): void {
  if (state.fa2StopTimer !== null) {
    clearTimeout(state.fa2StopTimer);
    state.fa2StopTimer = null;
  }
  if (state.fa2) {
    state.fa2.stop();
    state.fa2.kill();
    state.fa2 = null;
  }
  if (state.sigma) {
    state.sigma.kill();
    state.sigma = null;
  }
  state.graph = null;
  state.highlightedNode = null;
}

// ---- Graph panel renderer (coordinator) ----

export function renderGraphPanel(ctx: PanelContext): PanelInstance {
  const { container, api, ws, onSelectFile } = ctx;

  const state: GraphPanelState = {
    sigma: null,
    fa2: null,
    fa2StopTimer: null,
    graph: null,
    unsubscribeWs: null,
    searchInstance: null,
    detailOverlay: null,
    highlightedNode: null,
  };

  // Build DOM
  const dom = buildGraphDom(container);
  state.detailOverlay = dom.detailOverlay;

  // Search callback
  function onNodeSearchSelect(filePath: string): void {
    if (!state.graph || !state.sigma) return;
    let targetNode: string | null = null;
    state.graph.forEachNode((node, attrs) => {
      if (attrs.filePath === filePath) {
        targetNode = node;
      }
    });

    if (targetNode) {
      const attrs = state.graph.getNodeAttributes(targetNode);
      state.sigma.getCamera().animate(
        { x: attrs.x ?? 0, y: attrs.y ?? 0, ratio: 0.3 },
        { duration: 300 },
      );
      showNodeDetail(targetNode, state, dom);
    }
  }

  // Initialize search
  state.searchInstance = renderSearch(dom.searchContainer, [], onNodeSearchSelect);

  // Cleanup function (used by WebSocket handler and breadcrumb navigation)
  function cleanup(): void {
    cleanupState(state);
  }

  // Data loading
  async function loadGraphData(): Promise<void> {
    try {
      const response = await api.fetchGraph();
      initSigmaGraph(
        response.data.nodes,
        response.data.edges,
        response.data.dangerZones,
        state,
        dom,
        onSelectFile,
        loadGraphData,
        cleanup,
      );
    } catch (err: any) {
      if (err.status === 404) {
        showEmptyState(dom.graphContainer);
      } else {
        showErrorState(dom.graphContainer);
      }
    }
  }

  loadGraphData();

  // WebSocket subscription
  subscribeGraphUpdates(ws, state, cleanup, loadGraphData);

  return {
    destroy() {
      cleanup();
      if (state.unsubscribeWs) {
        state.unsubscribeWs();
        state.unsubscribeWs = null;
      }
      if (state.searchInstance) {
        state.searchInstance.destroy();
        state.searchInstance = null;
      }
      container.innerHTML = '';
    },
  };
}
