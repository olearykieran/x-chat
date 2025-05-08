/**
 * Render an error message
 * @param {string} errorText - Error message text
 * @returns {HTMLElement} - Error message element
 */
export function renderErrorMessage(errorText) {
  const error = document.createElement('div');
  error.className = 'message ai';
  error.style.backgroundColor = 'rgba(224, 36, 94, 0.2)';
  error.style.borderColor = 'var(--danger-color)';
  
  const errorIcon = document.createElement('div');
  errorIcon.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  `;
  errorIcon.style.marginRight = '8px';
  
  const errorContent = document.createElement('div');
  errorContent.textContent = errorText;
  
  error.appendChild(errorIcon);
  error.appendChild(errorContent);
  
  return error;
}