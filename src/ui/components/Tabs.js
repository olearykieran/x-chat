/**
 * Render the tabs component
 * @param {Object} props - Component props
 * @returns {HTMLElement} - Tabs element
 */
export function renderTabs({ activeTab, onTabChange }) {
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  
  const replyTab = document.createElement('div');
  replyTab.className = `tab active`; // Always active since it's the only tab
  replyTab.textContent = 'Reply';
  
  // Compose tab removed - functionality moved to Make New Post button
  // Schedule tab removed as it's not currently functional
  
  tabs.appendChild(replyTab);
  
  return tabs;
}