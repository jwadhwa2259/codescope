/**
 * Convention compliance heatmap panel.
 * Shows per-file convention compliance as a colored grid (green/yellow/red),
 * grouped by directory with collapsible sections, 3 sort modes, hover tooltips,
 * and click-to-detail drawer.
 *
 * VIZ-03, D-23, D-24, D-25.
 */

import type { ApiClient, ConventionsApiResponse } from '../lib/api-client.js';
import type { WebSocketClient } from '../lib/ws-client.js';
import { formatPercent, complianceColor } from '../lib/format.js';
import { openDrawer } from '../components/drawer.js';
import { showTooltip, hideTooltip } from '../components/tooltip.js';
import { icons } from '../lib/icons.js';

interface PanelContext {
  container: HTMLElement;
  api: ApiClient;
  ws: WebSocketClient;
  onSelectFile: (filePath: string) => void;
}

interface PanelInstance {
  destroy: () => void;
}

type SortMode = 'worst' | 'az' | 'directory';

interface FileEntry {
  path: string;
  name: string;
  conventions: ConventionsApiResponse['data']['files'][string];
  compliance: number;
}

interface DirGroup {
  dir: string;
  files: FileEntry[];
  avgCompliance: number;
  expanded: boolean;
}

const COLOR_MAP: Record<'green' | 'yellow' | 'red', string> = {
  green: '#22C55E',
  yellow: '#F59E0B',
  red: '#EF4444',
};

export function renderHeatmapPanel(ctx: PanelContext): PanelInstance {
  const { container, api } = ctx;

  // Root wrapper
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.height = '100%';
  wrapper.style.overflow = 'hidden';
  container.appendChild(wrapper);

  // Sort controls bar
  const sortBar = document.createElement('div');
  sortBar.style.display = 'flex';
  sortBar.style.alignItems = 'center';
  sortBar.style.gap = '8px';
  sortBar.style.padding = '12px 16px';
  sortBar.style.borderBottom = '1px solid var(--color-bg-tertiary)';
  sortBar.style.flexShrink = '0';

  const sortLabel = document.createElement('span');
  sortLabel.textContent = 'Sort:';
  sortLabel.style.fontSize = '12px';
  sortLabel.style.color = 'var(--color-text-muted)';
  sortBar.appendChild(sortLabel);

  let currentSort: SortMode = 'worst';
  const sortButtons: Record<SortMode, HTMLButtonElement> = {} as any;

  function createSortButton(label: string, mode: SortMode): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.padding = '4px 12px';
    btn.style.borderRadius = '4px';
    btn.style.border = '1px solid var(--color-bg-tertiary)';
    btn.style.background = 'transparent';
    btn.style.color = 'var(--color-text-muted)';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '12px';
    btn.style.transition = 'all var(--transition-fast)';
    btn.addEventListener('click', () => {
      currentSort = mode;
      updateSortButtons();
      renderGrid();
    });
    sortButtons[mode] = btn;
    return btn;
  }

  sortBar.appendChild(createSortButton('Worst first', 'worst'));
  sortBar.appendChild(createSortButton('A-Z', 'az'));
  sortBar.appendChild(createSortButton('By directory', 'directory'));
  wrapper.appendChild(sortBar);

  function updateSortButtons(): void {
    for (const [mode, btn] of Object.entries(sortButtons)) {
      if (mode === currentSort) {
        btn.style.background = 'var(--color-accent)';
        btn.style.color = '#000';
        btn.style.borderColor = 'var(--color-accent)';
      } else {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--color-text-muted)';
        btn.style.borderColor = 'var(--color-bg-tertiary)';
      }
    }
  }
  updateSortButtons();

  // Scrollable grid area
  const gridArea = document.createElement('div');
  gridArea.style.flex = '1';
  gridArea.style.overflowY = 'auto';
  gridArea.style.padding = '16px';
  wrapper.appendChild(gridArea);

  // Data state
  let dirGroups: DirGroup[] = [];

  // Load data
  async function loadData(): Promise<void> {
    try {
      const response = await api.fetchConventions();
      const filesMap = response.data.files;
      dirGroups = buildDirGroups(filesMap);
      renderGrid();
    } catch (err: any) {
      if (err.status === 404) {
        showEmptyState();
      } else {
        showErrorState(err.message || 'Failed to load conventions');
      }
    }
  }

  function buildDirGroups(
    filesMap: ConventionsApiResponse['data']['files'],
  ): DirGroup[] {
    const groups = new Map<string, FileEntry[]>();

    for (const [filePath, conventions] of Object.entries(filesMap)) {
      const parts = filePath.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
      const name = parts[parts.length - 1];

      const avgAdoption =
        conventions.length > 0
          ? conventions.reduce((sum, c) => sum + c.adoption_pct, 0) /
            conventions.length
          : 100;

      const entry: FileEntry = {
        path: filePath,
        name,
        conventions,
        compliance: avgAdoption,
      };

      if (!groups.has(dir)) {
        groups.set(dir, []);
      }
      groups.get(dir)!.push(entry);
    }

    return Array.from(groups.entries()).map(([dir, files]) => ({
      dir,
      files,
      avgCompliance:
        files.reduce((sum, f) => sum + f.compliance, 0) / files.length,
      expanded: true,
    }));
  }

  function sortGroups(groups: DirGroup[]): DirGroup[] {
    const sorted = [...groups];
    switch (currentSort) {
      case 'worst':
        sorted.sort((a, b) => a.avgCompliance - b.avgCompliance);
        for (const g of sorted) {
          g.files.sort((a, b) => a.compliance - b.compliance);
        }
        break;
      case 'az':
        sorted.sort((a, b) => a.dir.localeCompare(b.dir));
        for (const g of sorted) {
          g.files.sort((a, b) => a.name.localeCompare(b.name));
        }
        break;
      case 'directory':
        // Group by directory only, no further sort within
        sorted.sort((a, b) => a.dir.localeCompare(b.dir));
        break;
    }
    return sorted;
  }

  function renderGrid(): void {
    gridArea.innerHTML = '';
    const sorted = sortGroups(dirGroups);

    if (sorted.length === 0) {
      showEmptyState();
      return;
    }

    for (const group of sorted) {
      const section = document.createElement('div');
      section.style.marginBottom = '16px';

      // Directory header
      const header = createDirHeader(group);
      section.appendChild(header);

      // Files container
      const filesContainer = document.createElement('div');
      filesContainer.style.display = 'flex';
      filesContainer.style.flexWrap = 'wrap';
      filesContainer.style.gap = '4px';
      filesContainer.style.padding = '8px 16px';

      if (!group.expanded) {
        filesContainer.style.display = 'none';
      }

      for (const file of group.files) {
        filesContainer.appendChild(createFileBlock(file));
      }

      section.appendChild(filesContainer);
      gridArea.appendChild(section);
    }
  }

  function createDirHeader(group: DirGroup): HTMLElement {
    const header = document.createElement('div');
    header.className = 'dir-header';
    header.style.padding = '8px 16px';
    header.style.cursor = 'pointer';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '8px';
    header.style.fontWeight = '600';
    header.style.color = 'var(--color-text-primary)';
    header.style.borderBottom = '1px solid var(--color-bg-tertiary)';
    header.style.fontSize = '13px';

    // Chevron
    const chevron = document.createElement('span');
    chevron.innerHTML = group.expanded ? icons.chevronDown : icons.chevronRight;
    chevron.style.display = 'flex';
    chevron.style.transition = 'transform var(--transition-fast)';
    header.appendChild(chevron);

    // Directory name
    const dirName = document.createElement('span');
    dirName.textContent = group.dir;
    dirName.style.flex = '0 0 auto';
    header.appendChild(dirName);

    // File count
    const count = document.createElement('span');
    count.textContent = `(${group.files.length})`;
    count.style.color = 'var(--color-text-muted)';
    count.style.fontSize = '12px';
    header.appendChild(count);

    // Summary compliance bar
    const barWrapper = document.createElement('div');
    barWrapper.className = 'dir-summary';
    barWrapper.style.height = '4px';
    barWrapper.style.flex = '1';
    barWrapper.style.borderRadius = '2px';
    barWrapper.style.background = 'var(--color-bg-tertiary)';
    barWrapper.style.overflow = 'hidden';

    const barFill = document.createElement('div');
    barFill.className = 'dir-summary-fill';
    barFill.style.height = '100%';
    barFill.style.borderRadius = '2px';
    barFill.style.width = `${Math.round(group.avgCompliance)}%`;
    barFill.style.background = COLOR_MAP[complianceColor(group.avgCompliance)];
    barWrapper.appendChild(barFill);
    header.appendChild(barWrapper);

    // Compliance percentage
    const pct = document.createElement('span');
    pct.textContent = formatPercent(group.avgCompliance);
    pct.style.fontSize = '12px';
    pct.style.color = COLOR_MAP[complianceColor(group.avgCompliance)];
    pct.style.fontFamily = 'Fira Code, monospace';
    pct.style.minWidth = '40px';
    pct.style.textAlign = 'right';
    header.appendChild(pct);

    // Toggle collapse
    header.addEventListener('click', () => {
      group.expanded = !group.expanded;
      chevron.innerHTML = group.expanded
        ? icons.chevronDown
        : icons.chevronRight;
      const filesContainer = header.nextElementSibling as HTMLElement;
      if (filesContainer) {
        filesContainer.style.display = group.expanded ? 'flex' : 'none';
      }
    });

    return header;
  }

  function createFileBlock(file: FileEntry): HTMLElement {
    const block = document.createElement('div');
    block.className = 'heatmap-block';
    const color = COLOR_MAP[complianceColor(file.compliance)];

    block.style.background = color;
    block.style.width = '32px';
    block.style.height = '32px';
    block.style.borderRadius = '2px';
    block.style.cursor = 'pointer';
    block.style.display = 'flex';
    block.style.alignItems = 'center';
    block.style.justifyContent = 'center';
    block.style.fontSize = '10px';
    block.style.color = 'rgba(0,0,0,0.6)';
    block.style.transition = 'transform var(--transition-fast)';
    block.style.position = 'relative';

    // Show truncated filename inside block
    const ext = file.name.split('.').pop() || '';
    block.textContent = ext.length <= 3 ? `.${ext}` : '';
    block.title = file.path;

    // Hover: scale + tooltip
    block.addEventListener('mouseenter', () => {
      block.style.transform = 'scale(1.1)';
      block.style.zIndex = '1';
      const violations = file.conventions.filter(
        (c) => c.adoption_pct < 80,
      ).length;
      showTooltip(
        block,
        `${file.path}\nCompliance: ${formatPercent(file.compliance)}\nViolations: ${violations}`,
      );
    });

    block.addEventListener('mouseleave', () => {
      block.style.transform = 'scale(1)';
      block.style.zIndex = '0';
      hideTooltip();
    });

    // Click: open drawer with convention details
    block.addEventListener('click', () => {
      openFileDrawer(file);
    });

    return block;
  }

  function openFileDrawer(file: FileEntry): void {
    const content = document.createElement('div');

    // Overall compliance
    const overallDiv = document.createElement('div');
    overallDiv.style.display = 'flex';
    overallDiv.style.alignItems = 'center';
    overallDiv.style.gap = '12px';
    overallDiv.style.marginBottom = '24px';

    const colorDot = document.createElement('div');
    const color = COLOR_MAP[complianceColor(file.compliance)];
    colorDot.style.width = '12px';
    colorDot.style.height = '12px';
    colorDot.style.borderRadius = '50%';
    colorDot.style.background = color;
    overallDiv.appendChild(colorDot);

    const overallText = document.createElement('span');
    overallText.textContent = `Overall: ${formatPercent(file.compliance)}`;
    overallText.style.fontSize = '16px';
    overallText.style.fontWeight = '600';
    overallText.style.color = color;
    overallText.style.fontFamily = 'Fira Code, monospace';
    overallDiv.appendChild(overallText);
    content.appendChild(overallDiv);

    // Convention list
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '12px';

    for (const conv of file.conventions) {
      const item = document.createElement('div');
      item.style.padding = '12px';
      item.style.borderRadius = '6px';
      item.style.background = 'var(--color-bg-secondary)';

      const topRow = document.createElement('div');
      topRow.style.display = 'flex';
      topRow.style.justifyContent = 'space-between';
      topRow.style.alignItems = 'center';
      topRow.style.marginBottom = '8px';

      const nameEl = document.createElement('span');
      nameEl.textContent = conv.name;
      nameEl.style.fontWeight = '600';
      nameEl.style.fontSize = '13px';
      topRow.appendChild(nameEl);

      const badges = document.createElement('div');
      badges.style.display = 'flex';
      badges.style.gap = '6px';

      const confBadge = document.createElement('span');
      confBadge.textContent = conv.confidence;
      confBadge.style.fontSize = '10px';
      confBadge.style.padding = '2px 6px';
      confBadge.style.borderRadius = '3px';
      confBadge.style.background = 'var(--color-bg-tertiary)';
      confBadge.style.color = 'var(--color-text-muted)';
      badges.appendChild(confBadge);

      const catBadge = document.createElement('span');
      catBadge.textContent = conv.category;
      catBadge.style.fontSize = '10px';
      catBadge.style.padding = '2px 6px';
      catBadge.style.borderRadius = '3px';
      catBadge.style.background = 'var(--color-bg-tertiary)';
      catBadge.style.color = 'var(--color-text-muted)';
      badges.appendChild(catBadge);

      topRow.appendChild(badges);
      item.appendChild(topRow);

      // Progress bar
      const barWrapper = document.createElement('div');
      barWrapper.style.height = '6px';
      barWrapper.style.borderRadius = '3px';
      barWrapper.style.background = 'var(--color-bg-tertiary)';
      barWrapper.style.overflow = 'hidden';

      const barFill = document.createElement('div');
      barFill.style.height = '100%';
      barFill.style.borderRadius = '3px';
      barFill.style.width = `${Math.round(conv.adoption_pct)}%`;
      const barColor =
        conv.adoption_pct < 80
          ? COLOR_MAP[complianceColor(conv.adoption_pct)]
          : COLOR_MAP.green;
      barFill.style.background = barColor;
      barWrapper.appendChild(barFill);
      item.appendChild(barWrapper);

      // Percentage label
      const pctLabel = document.createElement('div');
      pctLabel.style.textAlign = 'right';
      pctLabel.style.marginTop = '4px';
      pctLabel.style.fontSize = '12px';
      pctLabel.style.fontFamily = 'Fira Code, monospace';
      pctLabel.style.color =
        conv.adoption_pct < 80
          ? COLOR_MAP[complianceColor(conv.adoption_pct)]
          : 'var(--color-text-muted)';
      pctLabel.textContent = formatPercent(conv.adoption_pct);
      item.appendChild(pctLabel);

      // Warning highlight for below-threshold conventions
      if (conv.adoption_pct < 80) {
        item.style.border = `1px solid ${COLOR_MAP[complianceColor(conv.adoption_pct)]}40`;
      }

      list.appendChild(item);
    }

    content.appendChild(list);
    openDrawer(file.path, content);
  }

  function showEmptyState(): void {
    gridArea.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';

    const heading = document.createElement('h2');
    heading.textContent = 'No conventions detected';

    const body = document.createElement('p');
    body.textContent =
      'Convention detection runs during bootstrap. If your codebase has consistent patterns, they will appear here after the next analysis.';

    empty.appendChild(heading);
    empty.appendChild(body);
    gridArea.appendChild(empty);
  }

  function showErrorState(message: string): void {
    gridArea.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';

    const heading = document.createElement('h2');
    heading.textContent = 'Error loading conventions';

    const body = document.createElement('p');
    body.textContent = message;

    empty.appendChild(heading);
    empty.appendChild(body);
    gridArea.appendChild(empty);
  }

  // Initial load
  loadData();

  return {
    destroy() {
      wrapper.remove();
    },
  };
}
