/**
 * Render the compose tab content - Post Polisher
 * @param {Object} props - Component props
 * @returns {HTMLElement} - Compose tab element
 */
export function renderComposeTab({ ideas, onUseTweet, isLoading }) {
  const container = document.createElement('div');
  container.className = 'compose-container';
  
  // Add header
  const headerEl = document.createElement('div');
  headerEl.className = 'compose-header';
  
  const titleEl = document.createElement('h2');
  titleEl.className = 'compose-title';
  titleEl.textContent = 'Post Polisher';
  headerEl.appendChild(titleEl);
  
  const descriptionEl = document.createElement('p');
  descriptionEl.className = 'compose-description';
  descriptionEl.textContent = 'Type or speak your post idea below, and I\'ll transform it into 5 polished versions.';
  headerEl.appendChild(descriptionEl);
  
  container.appendChild(headerEl);
  
  // Handle different states
  if (ideas && ideas.length > 0) {
    // Filter out any ideas with separator text or that are too short
    const validIdeas = ideas.filter(idea => 
      !idea.includes('POST_SEPARATOR') && idea.length > 5
    );
    
    if (validIdeas.length > 0) {
      // Create container for results
      const resultsContainer = document.createElement('div');
      resultsContainer.className = 'results-container';
      
      const resultsTitle = document.createElement('h3');
      resultsTitle.className = 'results-title';
      resultsTitle.textContent = 'Your Polished Posts';
      resultsContainer.appendChild(resultsTitle);
      
      // Container for all post ideas
      const ideasContainer = document.createElement('div');
      ideasContainer.className = 'messages';
      
      // Create an element for each post idea
      validIdeas.forEach((idea, index) => {
        const ideaEl = document.createElement('div');
        ideaEl.className = 'message ai slide-in';
        
        // Number badge
        const numberBadge = document.createElement('div');
        numberBadge.className = 'number-badge';
        numberBadge.textContent = `#${index + 1}`;
        ideaEl.appendChild(numberBadge);
        
        // Post content
        const contentEl = document.createElement('div');
        contentEl.className = 'post-content';
        contentEl.textContent = idea;
        ideaEl.appendChild(contentEl);
        
        // Action buttons
        const actionsEl = document.createElement('div');
        actionsEl.className = 'message-actions';
        
        // Use button
        const useButton = document.createElement('button');
        useButton.className = 'message-button';
        useButton.textContent = 'Use Post';
        useButton.addEventListener('click', () => onUseTweet(idea));
        
        // Copy button
        const copyButton = document.createElement('button');
        copyButton.className = 'message-button';
        copyButton.textContent = 'Copy';
        copyButton.addEventListener('click', () => {
          navigator.clipboard.writeText(idea);
          copyButton.textContent = 'Copied!';
          setTimeout(() => {
            copyButton.textContent = 'Copy';
          }, 2000);
        });
        
        actionsEl.appendChild(useButton);
        actionsEl.appendChild(copyButton);
        ideaEl.appendChild(actionsEl);
        
        ideasContainer.appendChild(ideaEl);
      });
      
      resultsContainer.appendChild(ideasContainer);
      container.appendChild(resultsContainer);
    } else {
      // If all ideas were filtered out as invalid
      container.appendChild(renderEmptyState('compose'));
    }
  } else if (isLoading) {
    // Show loading state
    container.appendChild(renderEmptyState('loading'));
  } else {
    // Show empty state when no ideas yet
    container.appendChild(renderEmptyState('compose'));
  }
  
  return container;
}

/**
 * Render empty state
 * @param {string} type - Type of empty state
 * @returns {HTMLElement} - Empty state element
 */
function renderEmptyState(type) {
  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state';
  
  const icon = document.createElement('div');
  icon.className = 'empty-state-icon';
  
  if (type === 'loading') {
    // Loading spinner icon
    icon.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 6v6l4 2"></path>
      </svg>
    `;
  } else if (type === 'compose') {
    // Microphone icon for compose
    icon.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    `;
  } else {
    // Default plus icon
    icon.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `;
  }
  
  const text = document.createElement('div');
  text.className = 'empty-state-text';
  
  if (type === 'loading') {
    text.textContent = 'Creating your polished posts...';
  } else if (type === 'compose') {
    text.textContent = 'Type or speak your idea and hit send to see magic happen!';
  } else {
    text.textContent = 'Ready to polish your posts!';
  }
  
  emptyState.appendChild(icon);
  emptyState.appendChild(text);
  
  return emptyState;
}

// Add styles for the new components
const styles = document.createElement('style');
styles.textContent = `
  .compose-container {
    display: flex;
    flex-direction: column;
    padding: 16px;
    gap: 12px;
  }
  
  .compose-header {
    margin-bottom: 16px;
  }
  
  .compose-title {
    font-size: 18px;
    font-weight: bold;
    color: var(--primary-color, #1da1f2);
    margin: 0 0 8px 0;
  }
  
  .compose-description {
    font-size: 14px;
    color: #ccc;
    margin: 0;
  }
  
  .results-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }
  
  .results-title {
    font-size: 16px;
    font-weight: 500;
    color: #ddd;
    margin: 8px 0;
  }
  
  .number-badge {
    font-size: 12px;
    font-weight: bold;
    color: var(--primary-color, #1da1f2);
    margin-bottom: 4px;
  }
  
  .post-content {
    margin-bottom: 8px;
  }
`;

document.head.appendChild(styles);