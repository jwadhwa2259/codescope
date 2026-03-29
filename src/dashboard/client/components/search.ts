/**
 * Type-ahead search with debounced input, dropdown results, keyboard navigation.
 * Per D-22, D-37, UI-SPEC interaction contract.
 * Debounce at 150ms, substring match (case-insensitive), max 10 results.
 */

export function renderSearch(
  container: HTMLElement,
  items: string[],
  onSelect: (item: string) => void,
): { updateItems: (items: string[]) => void; destroy: () => void } {
  let searchItems = items;
  let activeIndex = -1;
  let results: string[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Wrapper
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';

  // Input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'search-input';
  input.placeholder = 'Search files...';
  input.setAttribute('aria-label', 'Search files');
  wrapper.appendChild(input);

  // Results dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'search-results';
  dropdown.style.display = 'none';
  wrapper.appendChild(dropdown);

  container.appendChild(wrapper);

  function renderResults(): void {
    dropdown.innerHTML = '';
    activeIndex = -1;

    if (results.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    dropdown.style.display = 'block';

    for (let i = 0; i < results.length; i++) {
      const div = document.createElement('div');
      div.className = 'search-result';
      div.textContent = results[i];
      div.addEventListener('click', () => {
        selectItem(results[i]);
      });
      dropdown.appendChild(div);
    }
  }

  function selectItem(item: string): void {
    input.value = item;
    dropdown.style.display = 'none';
    results = [];
    activeIndex = -1;
    onSelect(item);
  }

  function setActiveResult(index: number): void {
    const children = dropdown.children;
    // Remove previous active
    for (let i = 0; i < children.length; i++) {
      children[i].classList.remove('active');
    }
    if (index >= 0 && index < children.length) {
      children[index].classList.add('active');
      (children[index] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
    activeIndex = index;
  }

  function handleInput(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const query = input.value.trim().toLowerCase();

      if (query.length === 0) {
        results = [];
        renderResults();
        return;
      }

      results = searchItems
        .filter((item) => item.toLowerCase().includes(query))
        .slice(0, 10);

      renderResults();
    }, 150);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (dropdown.style.display === 'none') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = activeIndex + 1;
      if (next < results.length) {
        setActiveResult(next);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = activeIndex - 1;
      if (prev >= 0) {
        setActiveResult(prev);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < results.length) {
        selectItem(results[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      results = [];
      activeIndex = -1;
    }
  }

  function handleBlur(): void {
    // Delay to allow click on result to fire first
    setTimeout(() => {
      dropdown.style.display = 'none';
    }, 200);
  }

  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', handleKeydown);
  input.addEventListener('blur', handleBlur);

  return {
    updateItems(newItems: string[]): void {
      searchItems = newItems;
    },

    destroy(): void {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
      input.removeEventListener('input', handleInput);
      input.removeEventListener('keydown', handleKeydown);
      input.removeEventListener('blur', handleBlur);
      wrapper.remove();
    },
  };
}
