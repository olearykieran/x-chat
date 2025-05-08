/**
 * Render a loading indicator
 * @returns {HTMLElement} - Loading indicator element
 */
export function renderLoadingIndicator() {
  const loading = document.createElement('div');
  loading.className = 'loading';
  
  const dots = document.createElement('div');
  dots.className = 'loading-dots';
  
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot';
    dots.appendChild(dot);
  }
  
  loading.appendChild(dots);
  return loading;
}