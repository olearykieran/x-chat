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
  // Remove @ symbol if it's already in the handle
  const authorHandle = tweet.tweetAuthorHandle || 'author';
  tweetAuthor.textContent = authorHandle.startsWith('@') ? authorHandle : `@${authorHandle}`;
  
  const tweetText = document.createElement('div');
  tweetText.className = 'tweet-text';
  tweetText.textContent = tweet.tweetText;
  
  tweetCard.appendChild(tweetAuthor);
  tweetCard.appendChild(tweetText);
  container.appendChild(tweetCard);
  
  // Multiple Reply Suggestions
  const suggestionsContainer = document.createElement('div');
  suggestionsContainer.className = 'suggestions-container';
  
  // Title for suggestions
  const suggestionsTitle = document.createElement('h3');
  suggestionsTitle.className = 'suggestions-title';
  suggestionsTitle.textContent = 'AI Reply Suggestions';
  suggestionsContainer.appendChild(suggestionsTitle);
  
  // Check if we have AI messages with multiple suggestions
  const aiMessages = messages.filter(msg => msg.sender === 'ai');
  if (messages.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-state-text';
    emptyMessage.textContent = 'Generating reply suggestions...';
    suggestionsContainer.appendChild(emptyMessage);
  } else if (aiMessages.length > 0) {
    // Find the most recent AI message that might have multiple suggestions
    const latestAIMessage = aiMessages[aiMessages.length - 1];
    
    // Check if we have multiple suggestions in the allReplies property
    const allReplies = latestAIMessage.allReplies || [latestAIMessage.text];
    
    // Render each suggestion as a card
    allReplies.forEach((reply, index) => {
      const suggestionCard = document.createElement('div');
      suggestionCard.className = 'suggestion-card slide-in';
      
      // Suggestion number
      const suggestionNumber = document.createElement('div');
      suggestionNumber.className = 'suggestion-number';
      suggestionNumber.textContent = `${index + 1}`;
      suggestionCard.appendChild(suggestionNumber);
      
      // Suggestion text
      const suggestionText = document.createElement('div');
      suggestionText.className = 'suggestion-text';
      
      // Final cleanup of any hyphens/dashes that might have slipped through all the way to UI
      let cleanedReply = reply.replace(/[-\u2013\u2014]/g, ' ').replace(/\s+/g, ' '); 
      
      suggestionText.textContent = cleanedReply;
      suggestionCard.appendChild(suggestionText);
      
      // Actions for this suggestion
      const actionsEl = document.createElement('div');
      actionsEl.className = 'message-actions';
      
      const useButton = document.createElement('button');
      useButton.className = 'message-button';
      useButton.textContent = 'Use Reply';
      useButton.addEventListener('click', () => {
        console.log('[ReplyTab] Use Reply button clicked with text:', cleanedReply);
        // Direct implementation to avoid dependency on state
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            console.log('[ReplyTab] Sending USE_REPLY message directly to tab:', tabs[0].id);
            chrome.tabs.sendMessage(tabs[0].id, { 
              type: 'USE_REPLY',
              text: cleanedReply
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('[ReplyTab] Error sending message:', chrome.runtime.lastError);
              } else {
                console.log('[ReplyTab] Response from content script:', response);
              }
            });
          } else {
            console.error('[ReplyTab] No active tab found');
          }
        });
        // Still call the original handler in case there's other functionality there
        if (typeof onUseReply === 'function') {
          onUseReply(cleanedReply);
        }
      }); // More robust implementation
      
      const copyButton = document.createElement('button');
      copyButton.className = 'message-button';
      copyButton.textContent = 'Copy';
      copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(cleanedReply); // Use the cleaned reply text
        
        // Show copied indicator
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
          copyButton.textContent = 'Copy';
        }, 2000);
      });
      
      actionsEl.appendChild(useButton);
      actionsEl.appendChild(copyButton);
      suggestionCard.appendChild(actionsEl);
      
      suggestionsContainer.appendChild(suggestionCard);
    });
    
    // Regenerate button removed - was causing infinite loading issues
  } else {
    // If there are messages but none from AI
    const noSuggestions = document.createElement('div');
    noSuggestions.className = 'empty-state-text';
    noSuggestions.textContent = 'No AI suggestions available yet.';
    suggestionsContainer.appendChild(noSuggestions);
  }
  
  container.appendChild(suggestionsContainer);
  
  // Add Guiding Questions section
  const guidingQuestionsContainer = document.createElement('div');
  guidingQuestionsContainer.className = 'guiding-questions-container';
  
  const questionsTitle = document.createElement('h3');
  questionsTitle.className = 'questions-title';
  questionsTitle.textContent = 'Brainstorm Your Own Reply';
  guidingQuestionsContainer.appendChild(questionsTitle);
  
  const questionsDescription = document.createElement('p');
  questionsDescription.className = 'questions-description';
  questionsDescription.textContent = 'Consider these questions to help formulate your own reply:';
  guidingQuestionsContainer.appendChild(questionsDescription);
  
  // Get contextual guiding questions if available, otherwise use defaults
  let questions = [
    "What points would you like to make about this tweet?",
    "How do you personally feel about the content of this tweet?",
    "Is there a specific aspect of the tweet you want to respond to?"
  ];
  
  // Check if we have contextual questions from the AI
  if (aiMessages.length > 0) {
    const latestAIMessage = aiMessages[aiMessages.length - 1];
    if (latestAIMessage.guidingQuestions && Array.isArray(latestAIMessage.guidingQuestions) && 
        latestAIMessage.guidingQuestions.length > 0) {
      questions = latestAIMessage.guidingQuestions.slice(0, 3);
    }
  }
  
  const questionsList = document.createElement('ul');
  questionsList.className = 'questions-list';
  
  questions.forEach(question => {
    const questionItem = document.createElement('li');
    questionItem.className = 'question-item';
    
    // Clean up any formatting tags or markdown that might be in the question text
    let cleanedQuestion = question;
    // Remove any markdown headers like ###Question X: 
    cleanedQuestion = cleanedQuestion.replace(/^###\s*Question\s*\d+:?\s*/i, '');
    // Also remove Question X: format without the markdown
    cleanedQuestion = cleanedQuestion.replace(/^Question\s*\d+:?\s*/i, '');
    // Remove any other markdown formatting or tags
    cleanedQuestion = cleanedQuestion.replace(/#+/g, '');
    // Remove any extra spaces and trim
    cleanedQuestion = cleanedQuestion.trim();
    
    questionItem.textContent = cleanedQuestion;
    questionsList.appendChild(questionItem);
  });
  
  guidingQuestionsContainer.appendChild(questionsList);
  container.appendChild(guidingQuestionsContainer);
  
  // Add some CSS for the new components in the head section
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    .suggestions-container, .guiding-questions-container {
      margin-top: 16px;
      padding: 12px;
      border-radius: var(--border-radius);
      background-color: var(--hover-color);
      border: 1px solid var(--border-color);
    }
    
    .suggestions-title, .questions-title {
      margin: 0 0 12px 0;
      font-size: 16px;
      font-weight: 600;
      color: #e7e9ea;
    }
    
    .suggestion-card {
      margin-bottom: 12px;
      padding: 12px;
      border-radius: var(--border-radius);
      background-color: var(--hover-color);
      border: 1px solid var(--border-color);
      position: relative;
    }
    
    .suggestion-number {
      position: absolute;
      top: 8px;
      left: 8px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background-color: var(--border-color);
      color: var(--text-color);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
    }
    
    .suggestion-text {
      margin-left: 26px;
      margin-bottom: 10px;
      color: #e7e9ea;
      line-height: 1.4;
    }
    
    /* Style for message actions and buttons */
    .message-actions {
      display: flex;
      gap: 8px;
      margin-left: 26px;
    }
    
    .message-button {
      background-color: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-sm);
      padding: 4px 10px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: var(--transition);
    }
    
    .message-button:hover {
      background-color: var(--hover-color);
    }
    
    .regenerate-container {
      display: flex;
      justify-content: center;
      margin-top: 12px;
    }
    
    .regenerate-button {
      background-color: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      padding: 8px 16px;
      cursor: pointer;
      font-weight: 600;
      transition: var(--transition);
    }
    
    .regenerate-button:hover {
      background-color: var(--hover-color);
    }
    
    .questions-description {
      color: #8899a6;
      font-size: 14px;
      margin-bottom: 12px;
    }
    
    .questions-list {
      padding-left: 24px;
      margin: 0;
    }
    
    .question-item {
      color: #e7e9ea;
      margin-bottom: 10px;
      line-height: 1.4;
    }
    
    .slide-in {
      animation: slideIn 0.3s ease-out forwards;
    }
    
    @keyframes slideIn {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(styleElement);
  
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