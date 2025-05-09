/**
 * Render the compose tab content
 * @param {Object} props - Component props
 * @returns {HTMLElement} - Compose tab element
 */
export function renderComposeTab({ ideas, trending, onUseTweet, newsSource, guidingQuestions, isLoading }) {
  const container = document.createElement('div');
  
  // Show loading state if we're still loading
  if (isLoading) {
    return renderEmptyState('compose');
  }
  
  // Show trending topics only if we have real data (not placeholders)
  if (trending && trending.length > 0 && newsSource) {
    const trendingContainer = document.createElement('div');
    trendingContainer.className = 'tweet-card';
    
    const trendingTitle = document.createElement('div');
    trendingTitle.className = 'tweet-author';
    trendingTitle.textContent = newsSource === 'topics' ? 'Latest News Topics' : 'Trending Topics';
    
    const trendingList = document.createElement('div');
    trendingList.className = 'tweet-text';
    trendingList.textContent = trending.join(' • ');
    
    trendingContainer.appendChild(trendingTitle);
    trendingContainer.appendChild(trendingList);
    container.appendChild(trendingContainer);
  }
  
  // Show tweet ideas
  if (ideas && ideas.length > 0) {
    // Filter out any ideas that contain separator text (happens during initial loading)
    const validIdeas = ideas.filter(idea => {
      // Skip ideas that still have the separator text or are too short
      return !idea.includes('POST_SEPARATOR') && idea.length >= 10;
    });
    
    // Only continue if we have valid ideas
    if (validIdeas.length === 0) {
      return renderEmptyState('compose');
    }
    
    const ideasContainer = document.createElement('div');
    ideasContainer.className = 'messages';
    
    validIdeas.forEach((idea, index) => {
      const ideaEl = document.createElement('div');
      ideaEl.className = 'message ai slide-in';
      ideaEl.textContent = idea;
      
      const actionsEl = document.createElement('div');
      actionsEl.className = 'message-actions';
      
      const useButton = document.createElement('button');
      useButton.className = 'message-button';
      useButton.textContent = 'Use Tweet';
      useButton.addEventListener('click', () => onUseTweet(idea));
      
      const copyButton = document.createElement('button');
      copyButton.className = 'message-button';
      copyButton.textContent = 'Copy';
      copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(idea);
        
        // Show copied indicator
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
    
    container.appendChild(ideasContainer);
    
    // Add Brainstorm section with guiding questions if available
    if (guidingQuestions && guidingQuestions.length > 0) {
      const guidingQuestionsContainer = document.createElement('div');
      guidingQuestionsContainer.className = 'guiding-questions-container';
      
      const questionsTitle = document.createElement('h3');
      questionsTitle.className = 'questions-title';
      questionsTitle.textContent = 'Brainstorm Your Own Tweet';
      guidingQuestionsContainer.appendChild(questionsTitle);
      
      const questionsDescription = document.createElement('p');
      questionsDescription.className = 'questions-description';
      questionsDescription.textContent = 'Consider these questions to help formulate your own tweet:';
      guidingQuestionsContainer.appendChild(questionsDescription);
      
      const questionsList = document.createElement('ul');
      questionsList.className = 'questions-list';
      
      guidingQuestions.forEach(question => {
        const questionItem = document.createElement('li');
        questionItem.className = 'question-item';
        questionItem.textContent = question;
        questionsList.appendChild(questionItem);
      });
      
      guidingQuestionsContainer.appendChild(questionsList);
      container.appendChild(guidingQuestionsContainer);
    }
  } else {
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
  
  icon.innerHTML = `
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  `;
  
  const text = document.createElement('div');
  text.className = 'empty-state-text';
  text.textContent = 'Generating tweet ideas based on trending topics...';
  
  emptyState.appendChild(icon);
  emptyState.appendChild(text);
  
  return emptyState;
}