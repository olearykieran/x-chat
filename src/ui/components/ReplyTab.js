/**
 * Render the reply tab content
 * @param {Object} props - Component props
 * @returns {HTMLElement} - Reply tab element
 */
export function renderReplyTab({ tweet, messages, onUseReply, onRegenerateReply }) {
  console.log('[ReplyTab] renderReplyTab called. Type of onUseReply:', typeof onUseReply, '. Type of onRegenerateReply:', typeof onRegenerateReply);
  const container = document.createElement('div');
  
  // If no tweet is selected
  if (!tweet) {
    container.appendChild(renderEmptyState('reply'));
    return container;
  }
  
  // Tweet card
  const tweetCard = document.createElement('div');
  tweetCard.className = 'tweet-card';
  
  const tweetAuthor = document.createElement('div');
  tweetAuthor.className = 'tweet-author';
  tweetAuthor.textContent = `@${tweet.tweetAuthorHandle}`;
  
  const tweetText = document.createElement('div');
  tweetText.className = 'tweet-text';
  tweetText.textContent = tweet.tweetText;
  
  tweetCard.appendChild(tweetAuthor);
  tweetCard.appendChild(tweetText);
  container.appendChild(tweetCard);
  
  // Messages
  const messagesContainer = document.createElement('div');
  messagesContainer.className = 'messages';
  
  if (messages.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-state-text';
    emptyMessage.textContent = 'Generating a reply...';
    messagesContainer.appendChild(emptyMessage);
  } else {
    messages.forEach(message => {
      const messageEl = document.createElement('div');
      messageEl.className = `message ${message.sender} slide-in`;
      messageEl.textContent = message.text;
      
      // Add actions for AI messages
      if (message.sender === 'ai') {
        const actionsEl = document.createElement('div');
        actionsEl.className = 'message-actions';
        
        const useButton = document.createElement('button');
        useButton.className = 'message-button';
        useButton.textContent = 'Use Reply';
        useButton.addEventListener('click', () => onUseReply(message.text));
        
        const copyButton = document.createElement('button');
        copyButton.className = 'message-button';
        copyButton.textContent = 'Copy';
        copyButton.addEventListener('click', () => {
          navigator.clipboard.writeText(message.text);
          
          // Show copied indicator
          copyButton.textContent = 'Copied!';
          setTimeout(() => {
            copyButton.textContent = 'Copy';
          }, 2000);
        });
        
        const regenerateButton = document.createElement('button');
        regenerateButton.className = 'message-button';
        regenerateButton.textContent = '🔄';
        regenerateButton.title = 'Regenerate';
        regenerateButton.addEventListener('click', () => {
          if (typeof onRegenerateReply === 'function') {
            console.log('[ReplyTab] Regenerate button clicked for tweet:', tweet);
            // Assuming 'tweet' object contains necessary info like an ID or the original text for context.
            // If tweet.id is available and preferred: onRegenerateReply(tweet.id);
            // For now, passing the whole tweet object might be more flexible.
            onRegenerateReply(tweet); 
          } else {
            console.error('[ReplyTab] onRegenerateReply is not a function or not provided. Cannot regenerate.');
          }
        });
        
        actionsEl.appendChild(useButton);
        actionsEl.appendChild(copyButton);
        actionsEl.appendChild(regenerateButton);
        messageEl.appendChild(actionsEl);
      }
      
      messagesContainer.appendChild(messageEl);
    });
  }
  
  container.appendChild(messagesContainer);
  
  return container;
}

/**
 * Render empty state
 * @param {string} type - Type of empty state ('reply' or 'compose')
 * @returns {HTMLElement} - Empty state element
 */
function renderEmptyState(type) {
  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state';
  
  const icon = document.createElement('div');
  icon.className = 'empty-state-icon';
  
  if (type === 'reply') {
    icon.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
  } else {
    icon.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `;
  }
  
  const text = document.createElement('div');
  text.className = 'empty-state-text';
  
  if (type === 'reply') {
    text.textContent = 'Focus on a tweet to get reply suggestions';
  } else {
    text.textContent = 'Start composing to get tweet ideas';
  }
  
  emptyState.appendChild(icon);
  emptyState.appendChild(text);
  
  return emptyState;
}