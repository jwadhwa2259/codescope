/**
 * Main client entry point for the CodeScope dashboard.
 * Initializes services, renders shell components, handles panel routing,
 * WebSocket events, and cross-panel file selection.
 */

import { createApiClient } from './lib/api-client.js';
import { createWebSocketClient, type ConnectionStatus } from './lib/ws-client.js';
import { renderSidebar, type PanelId } from './components/sidebar.js';
import { renderStatusBar, type StatusData } from './components/status-bar.js';
import { renderGraphPanel } from './panels/graph.js';
import { renderHeatmapPanel } from './panels/heatmap.js';
import { renderTrendsPanel } from './panels/trends.js';
import { renderBlastRadiusPanel } from './panels/blast-radius.js';
import { renderCommandPanel } from './panels/command.js';
import {
  showProgressBanner,
  updateProgressBanner,
  hideProgressBanner,
} from './components/progress-banner.js';
import type { ApiClient } from './lib/api-client.js';
import type { WebSocketClient } from './lib/ws-client.js';

// ---- Panel contract ----

interface PanelContext {
  container: HTMLElement;
  api: ApiClient;
  ws: WebSocketClient;
  onSelectFile: (filePath: string) => void;
}

interface PanelInstance {
  destroy: () => void;
}

type PanelRenderer = (ctx: PanelContext) => PanelInstance;

// ---- App initialization ----

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize services
  const api = createApiClient();
  const ws = createWebSocketClient((status: ConnectionStatus) => {
    updateConnectionDot(status);
    if (status === 'reconnected') {
      refreshAllData();
    }
  });
  ws.connect();

  // 2. Render shell components
  const sidebar = renderSidebar(
    document.getElementById('sidebar')!,
    onPanelSwitch,
  );

  const statusBar = renderStatusBar(
    document.getElementById('status-bar')!,
  );

  // 3. Panel routing
  let activePanel: PanelInstance | null = null;
  let activePanelId: PanelId | null = null;

  const panels: Record<PanelId, PanelRenderer> = {
    graph: renderGraphPanel,
    heatmap: renderHeatmapPanel,
    trends: renderTrendsPanel,
    blast: renderBlastRadiusPanel,
    command: renderCommandPanel,
  };

  function onPanelSwitch(panelId: PanelId): void {
    if (panelId === activePanelId) return;

    const container = document.getElementById('panel-container')!;

    // Destroy active panel
    if (activePanel) {
      activePanel.destroy();
      activePanel = null;
    }

    // Clear container
    container.innerHTML = '';

    // Create new panel
    const renderer = panels[panelId];
    activePanel = renderer({
      container,
      api,
      ws,
      onSelectFile,
      selectedFile,
    } as any);
    activePanelId = panelId;

    // Update sidebar active indicator
    sidebar.setActive(panelId);

    // Update aria-live region
    const ariaLive = document.getElementById('aria-live');
    if (ariaLive) {
      const panelNames: Record<PanelId, string> = {
        graph: 'Graph',
        heatmap: 'Heatmap',
        trends: 'Trends',
        blast: 'Blast Radius',
        command: 'Command Center',
      };
      ariaLive.textContent = `Switched to ${panelNames[panelId]} panel`;
    }
  }

  // 4. Cross-panel file selection
  let selectedFile: string | null = null;

  function onSelectFile(filePath: string): void {
    selectedFile = filePath;
    // If switching to blast panel, it will pick up the selected file
    if (activePanelId !== 'blast') {
      onPanelSwitch('blast');
    }
  }

  // 5. Connection status
  function updateConnectionDot(status: ConnectionStatus): void {
    const dot = document.getElementById('ws-status-dot');
    const text = document.getElementById('ws-status-text');
    if (dot) {
      dot.classList.remove('connected', 'disconnected');
      dot.classList.add(status === 'disconnected' ? 'disconnected' : 'connected');
    }
    if (text) {
      text.textContent = status === 'disconnected' ? 'disconnected' : 'connected';
    }
  }

  // 6. Initial data load
  async function loadStatus(): Promise<void> {
    try {
      const response = await api.fetchStatus();
      const data = response.data;

      statusBar.update({
        nodeCount: data.nodeCount,
        edgeCount: data.edgeCount,
        communityCount: data.communityCount,
        bootstrapDate: data.bootstrapDate,
        readinessGrade: null,
      });

      // Update project name from path
      const projectName = document.getElementById('project-name');
      if (projectName) {
        projectName.textContent = `${data.nodeCount > 0 ? 'Bootstrapped' : 'Not bootstrapped'}`;
      }
    } catch {
      // Not bootstrapped or server error -- status bar stays at defaults
    }
  }

  async function loadReadinessGrade(): Promise<void> {
    try {
      const response = await api.fetchReadiness();
      if (response.data.current) {
        const statusResponse = await api.fetchStatus();
        statusBar.update({
          nodeCount: statusResponse.data.nodeCount,
          edgeCount: statusResponse.data.edgeCount,
          communityCount: statusResponse.data.communityCount,
          bootstrapDate: statusResponse.data.bootstrapDate,
          readinessGrade: response.data.current.overall_grade,
        });
      }
    } catch {
      // Readiness data not available
    }
  }

  function refreshAllData(): void {
    loadStatus();
    loadReadinessGrade();
  }

  // 7. WebSocket event handling
  const panelContainer = document.getElementById('panel-container')!;
  ws.onEvent((event) => {
    if (event.type === 'bootstrap:progress') {
      showProgressBanner(panelContainer, event.stage, event.percentage);
    } else if (event.type === 'orient:phase') {
      updateProgressBanner(`Orient: ${event.phase}`, 0);
    } else if (event.type === 'agent:spawn') {
      updateProgressBanner(`Agent: ${event.agent} (wave ${event.wave})`, 0);
    } else if (event.type === 'agent:complete') {
      updateProgressBanner(`${event.agent}: ${event.status}`, 100);
    } else if (event.type === 'graph:updated') {
      hideProgressBanner();
      // Refresh status bar
      api.fetchStatus().then((res) => {
        if (res.status === 'ok') {
          statusBar.update({
            nodeCount: res.data.nodeCount,
            edgeCount: res.data.edgeCount,
            communityCount: res.data.communityCount,
            bootstrapDate: res.data.bootstrapDate,
            readinessGrade: null,
          });
        }
      });
      refreshAllData();
    } else if (event.type === 'readiness:snapshot') {
      refreshAllData();
    }
  });

  // 8. Default panel: switch to 'graph' on startup
  loadStatus();
  loadReadinessGrade();
  onPanelSwitch('graph');
});
