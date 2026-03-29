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

// ---- Community color palette (from UI-SPEC) ----

const COMMUNITY_COLORS = [
  '#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#A855F7',
  '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#14B8A6',
  '#8B5CF6', '#78716C',
];

// ---- Graph panel renderer ----

export function renderGraphPanel(ctx: PanelContext): PanelInstance {
  const { container, api, ws, onSelectFile } = ctx;

  let sigma: Sigma | null = null;
  let fa2: FA2Layout | null = null;
  let fa2StopTimer: ReturnType<typeof setTimeout> | null = null;
  let graph: DirectedGraph | null = null;
  let unsubscribeWs: (() => void) | null = null;
  let searchInstance: ReturnType<typeof renderSearch> | null = null;
  let detailOverlay: HTMLElement | null = null;
  let highlightedNode: string | null = null;

  // DOM structure
  const panelWrapper = document.createElement('div');
  panelWrapper.style.display = 'flex';
  panelWrapper.style.flexDirection = 'column';
  panelWrapper.style.height = '100%';
  panelWrapper.style.position = 'relative';

  // Search bar container
  const searchContainer = document.createElement('div');
  searchContainer.style.position = 'relative';
  searchContainer.style.padding = '8px 16px';
  searchContainer.style.flexShrink = '0';
  panelWrapper.appendChild(searchContainer);

  // Breadcrumb container (for super-node drill-down)
  const breadcrumb = document.createElement('div');
  breadcrumb.style.display = 'none';
  breadcrumb.style.padding = '4px 16px';
  breadcrumb.style.fontSize = '12px';
  breadcrumb.style.color = 'var(--color-text-muted)';
  breadcrumb.style.fontFamily = 'var(--font-mono)';
  breadcrumb.style.flexShrink = '0';
  panelWrapper.appendChild(breadcrumb);

  // Graph container (fills remaining space)
  const graphContainer = document.createElement('div');
  graphContainer.style.flex = '1';
  graphContainer.style.position = 'relative';
  graphContainer.style.minHeight = '0';
  panelWrapper.appendChild(graphContainer);

  // Node detail overlay (right side)
  detailOverlay = document.createElement('div');
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

  // Initialize search with empty items (will be populated after data loads)
  searchInstance = renderSearch(searchContainer, [], onNodeSearchSelect);

  // ---- Data loading ----

  loadGraphData();

  function onNodeSearchSelect(filePath: string): void {
    if (!graph || !sigma) return;
    // Find node by filePath
    let targetNode: string | null = null;
    graph.forEachNode((node, attrs) => {
      if (attrs.filePath === filePath) {
        targetNode = node;
      }
    });

    if (targetNode) {
      const attrs = graph.getNodeAttributes(targetNode);
      sigma.getCamera().animate(
        { x: attrs.x ?? 0, y: attrs.y ?? 0, ratio: 0.3 },
        { duration: 300 },
      );
      showNodeDetail(targetNode);
    }
  }

  async function loadGraphData(): Promise<void> {
    try {
      const response = await api.fetchGraph();
      buildGraph(response.data.nodes, response.data.edges, response.data.dangerZones);
    } catch (err: any) {
      if (err.status === 404) {
        showEmptyState();
      } else {
        showErrorState();
      }
    }
  }

  function showEmptyState(): void {
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

  function showErrorState(): void {
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

  function buildGraph(
    nodes: GraphNode[],
    edges: GraphEdge[],
    dangerZones: string[],
  ): void {
    const dangerSet = new Set(dangerZones);
    graph = new DirectedGraph();

    // Add nodes
    for (const node of nodes) {
      graph.addNode(node.id, {
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

    // Add edges (defensive: skip if source/target doesn't exist)
    for (const edge of edges) {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        try {
          graph.addEdge(edge.source, edge.target, { kind: edge.kind });
        } catch {
          // Duplicate edge -- skip
        }
      }
    }

    // Populate search items
    const filePaths = nodes.map((n) => n.filePath);
    searchInstance?.updateItems(filePaths);

    // Scale handling (D-21)
    if (graph.order > 2000) {
      renderSuperNodes(graph, nodes);
    } else {
      renderFullGraph(graph);
    }
  }

  // ---- Full graph rendering ----

  function renderFullGraph(g: DirectedGraph): void {
    // Default node reducer
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

    sigma = new Sigma(g, graphContainer, {
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

    // ForceAtlas2 layout
    const useBarnesHut = g.order > 500;
    fa2 = new FA2Layout(g, {
      settings: {
        barnesHutOptimize: useBarnesHut,
        scalingRatio: 10,
        gravity: 0.05,
        slowDown: 5,
      },
    });
    fa2.start();

    // Auto-stop after 5 seconds to save CPU
    fa2StopTimer = setTimeout(() => {
      fa2?.stop();
      fa2StopTimer = null;
    }, 5000);

    // ---- Event handlers ----

    // Click node: show detail panel
    sigma.on('clickNode', ({ node }) => {
      showNodeDetail(node);
    });

    // Hover node: highlight connected edges, dim others
    sigma.on('enterNode', ({ node }) => {
      highlightedNode = node;
      const connectedNodes = new Set(g.neighbors(node));
      connectedNodes.add(node);

      sigma?.setSetting('nodeReducer', (n: string, data: Record<string, any>) => {
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

      sigma?.setSetting('edgeReducer', (edge: string, data: Record<string, any>) => {
        const source = g.source(edge);
        const target = g.target(edge);
        if (source === node || target === node) {
          return { ...data, color: '#94A3B8', size: 1 };
        }
        return { ...data, color: '#1E293B', size: 0.3 };
      });
    });

    // Leave node: reset to defaults
    sigma.on('leaveNode', () => {
      highlightedNode = null;
      sigma?.setSetting('nodeReducer', defaultNodeReducer);
      sigma?.setSetting('edgeReducer', defaultEdgeReducer);
    });

    // Double-click node: cross-panel link to blast radius
    sigma.on('doubleClickNode', ({ node }) => {
      const attrs = g.getNodeAttributes(node);
      onSelectFile(attrs.filePath);
    });
  }

  // ---- Super-node rendering for large graphs (2000+) ----

  function renderSuperNodes(g: DirectedGraph, nodes: GraphNode[]): void {
    // Group nodes by community
    const communities = new Map<number, GraphNode[]>();
    for (const node of nodes) {
      const list = communities.get(node.community) || [];
      list.push(node);
      communities.set(node.community, list);
    }

    // Build super-node graph
    const superGraph = new DirectedGraph();
    const communityPositions = new Map<number, { x: number; y: number }>();

    // Create super-nodes (one per community)
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

    // Count cross-community edges
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

    // Render with sigma
    sigma = new Sigma(superGraph, graphContainer, {
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

    // Show breadcrumb
    breadcrumb.style.display = 'block';
    breadcrumb.innerHTML = '<strong>All communities</strong> (click a community to drill in)';

    // Click super-node: drill into community subgraph
    sigma.on('clickNode', ({ node }) => {
      const communityId = superGraph.getNodeAttribute(node, 'community');
      drillIntoCommunity(g, communityId, nodes);
    });
  }

  function drillIntoCommunity(
    fullGraph: DirectedGraph,
    communityId: number,
    allNodes: GraphNode[],
  ): void {
    // Clean up current sigma
    if (sigma) {
      sigma.kill();
      sigma = null;
    }

    // Filter to community nodes
    const communityNodes = allNodes.filter((n) => n.community === communityId);
    const nodeIds = new Set(communityNodes.map((n) => n.id));

    const subGraph = new DirectedGraph();

    // Layout in a circle
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

    // Add intra-community edges
    fullGraph.forEachEdge((_edge, attrs, source, target) => {
      if (nodeIds.has(source) && nodeIds.has(target)) {
        try {
          subGraph.addEdge(source, target, { kind: attrs.kind });
        } catch {
          // skip duplicates
        }
      }
    });

    // Set graph reference for search
    graph = subGraph;

    // Render
    renderFullGraph(subGraph);

    // Update breadcrumb
    breadcrumb.style.display = 'block';
    breadcrumb.innerHTML = '';

    const allLink = document.createElement('a');
    allLink.href = '#';
    allLink.textContent = 'All';
    allLink.style.color = 'var(--color-info)';
    allLink.style.textDecoration = 'none';
    allLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Go back to super-node view
      cleanup();
      loadGraphData();
    });
    breadcrumb.appendChild(allLink);
    breadcrumb.appendChild(document.createTextNode(` > Community ${communityId}`));
  }

  // ---- Node detail overlay ----

  function showNodeDetail(nodeId: string): void {
    if (!graph || !detailOverlay) return;
    const attrs = graph.getNodeAttributes(nodeId);

    detailOverlay.style.display = 'block';
    detailOverlay.innerHTML = `
      <div style="margin-bottom: 8px; font-size: 14px; font-weight: 600; word-break: break-all;">
        ${escapeHtml(attrs.filePath || attrs.label || nodeId)}
      </div>
      <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px;">
        <span style="color: var(--color-text-muted);">Centrality</span>
        <span>${(attrs.centrality ?? 0).toFixed(2)}</span>
        <span style="color: var(--color-text-muted);">Community</span>
        <span>${attrs.community ?? 'N/A'}</span>
        <span style="color: var(--color-text-muted);">Imports</span>
        <span>${graph.outDegree(nodeId)}</span>
        <span style="color: var(--color-text-muted);">Importers</span>
        <span>${graph.inDegree(nodeId)}</span>
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

  // ---- WebSocket refresh ----

  unsubscribeWs = ws.onEvent((event) => {
    if (event.type === 'graph:updated') {
      cleanup();
      loadGraphData();
    }
  });

  // ---- Cleanup ----

  function cleanup(): void {
    if (fa2StopTimer !== null) {
      clearTimeout(fa2StopTimer);
      fa2StopTimer = null;
    }
    if (fa2) {
      fa2.stop();
      fa2.kill();
      fa2 = null;
    }
    if (sigma) {
      sigma.kill();
      sigma = null;
    }
    graph = null;
    highlightedNode = null;
  }

  return {
    destroy() {
      cleanup();
      if (unsubscribeWs) {
        unsubscribeWs();
        unsubscribeWs = null;
      }
      if (searchInstance) {
        searchInstance.destroy();
        searchInstance = null;
      }
      container.innerHTML = '';
    },
  };
}
