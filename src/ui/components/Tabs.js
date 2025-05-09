/**
 * Render the tabs component
 * @param {Object} props - Component props
 * @returns {HTMLElement} - Tabs element
 */
export function renderTabs({ activeTab, onTabChange }) {
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  
  const replyTab = document.createElement('div');
  replyTab.className = `tab ${activeTab === 'reply' ? 'active' : ''}`;
  replyTab.textContent = 'Reply';
  replyTab.addEventListener('click', () => onTabChange('reply'));
  
  const composeTab = document.createElement('div');
  composeTab.className = `tab ${activeTab === 'compose' ? 'active' : ''}`;
  composeTab.textContent = 'Compose';
  composeTab.addEventListener('click', () => onTabChange('compose'));
  
  // Schedule tab removed as it's not currently functional
  
  tabs.appendChild(replyTab);
  tabs.appendChild(composeTab);
  
  return tabs;
}