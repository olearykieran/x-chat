/**
 * Render the reply tab content
 * @param {Object} props - Component props
 * @returns {HTMLElement} - Reply tab element
 */
export function renderReplyTab({ tweet, messages, onUseReply, isLoading, tweetContextCache, fetchingQuestionsForTweetId }) {
  // Debug log to help track component rendering
  console.log("[ReplyTab] renderReplyTab called with:", { 
    hasTweet: !!tweet, 
    messageCount: messages?.length || 0, 
    isLoading, 
    fetchingQuestionsForTweetId 
  });
  
  const container = document.createElement("div");

  // If no tweet is selected but we have messages to show, still render the chat
  // Otherwise show the empty state
  if (!tweet && (!messages || messages.length === 0)) {
    container.appendChild(renderEmptyState("reply"));
    return container;
  }
  
  // Tweet card - only render if a tweet is present
  if (tweet) {
    const tweetCard = document.createElement("div");
    tweetCard.className = "tweet-card";

    const tweetAuthor = document.createElement("div");
    tweetAuthor.className = "tweet-author";
    const authorHandle = tweet.tweetAuthorHandle || "author";
    tweetAuthor.textContent = authorHandle.startsWith("@")
      ? authorHandle
      : `@${authorHandle}`;

    const tweetText = document.createElement("div");
    tweetText.className = "tweet-text";
    tweetText.textContent = tweet.tweetText;

    tweetCard.appendChild(tweetAuthor);
    tweetCard.appendChild(tweetText);
    container.appendChild(tweetCard);
  }

  // --- Auto-generated Reply Suggestions Section --- only show if we have suggestion messages
  // and no user-submitted messages yet (we only want to show suggestions on initial load)
  if (messages && messages.length > 0) {
    // Check if there are any user messages (which would indicate a conversation has started)
    const hasUserMessages = messages.some(msg => msg.sender === 'user');
    const hasAIReplies = messages.some(msg => msg.sender === 'ai' && msg.type === 'reply');
    
    // Only show suggestions if there are no user messages or AI replies yet
    if (!hasUserMessages && !hasAIReplies) {
      // Get all suggestion messages but only use the first one to avoid duplicates
      const suggestionMessages = messages.filter(msg => msg.type === 'suggestion' && msg.sender === 'ai' && msg.allReplies);
      
      if (suggestionMessages.length > 0) {
        console.log("[ReplyTab] Found suggestion messages:", suggestionMessages.length);
        const suggestionMessage = suggestionMessages[0]; // Only use the first one
        
        if (suggestionMessage.allReplies && suggestionMessage.allReplies.length > 0) {
          const suggestionsSection = document.createElement("div");
          suggestionsSection.className = "suggestions-section";
          suggestionsSection.style.marginBottom = "24px";
          
          const suggestionsTitle = document.createElement("h3");
          suggestionsTitle.textContent = "Reply Suggestions";
          suggestionsTitle.style.fontSize = "16px";
          suggestionsTitle.style.fontWeight = "600";
          suggestionsTitle.style.marginBottom = "12px";
          suggestionsTitle.style.color = "#e7e9ea";
          suggestionsSection.appendChild(suggestionsTitle);
          
          // Create cards for each suggestion
          suggestionMessage.allReplies.forEach((reply, index) => {
            const suggestionCard = document.createElement("div");
            suggestionCard.className = "suggestion-card slide-in";
            suggestionCard.style.animationDelay = `${index * 0.1}s`;
            
            const suggestionNumber = document.createElement("div");
            suggestionNumber.className = "suggestion-number";
            suggestionNumber.textContent = String(index + 1);
            suggestionCard.appendChild(suggestionNumber);
            
            const suggestionText = document.createElement("div");
            suggestionText.className = "suggestion-text";
            suggestionText.textContent = reply;
            suggestionCard.appendChild(suggestionText);
            
            // Add Use Reply button for each suggestion
            const messageActions = document.createElement("div");
            messageActions.className = "message-actions";
            
            const useButton = document.createElement("button");
            useButton.className = "message-button";
            useButton.textContent = "Use Reply";
            useButton.onclick = () => onUseReply(reply);
            messageActions.appendChild(useButton);
            
            suggestionCard.appendChild(messageActions);
            suggestionsSection.appendChild(suggestionCard);
          });
          
          container.appendChild(suggestionsSection);
        }
      }
    }
  }
  
  // --- Brainstorming Questions Section --- only show if a tweet is present
  if (tweet) {
    const tweetId = tweet.tweetUrl || tweet.tweetText;
    const questionsSectionContainer = document.createElement("div");
    questionsSectionContainer.className = "questions-section-container";

    const cachedQuestions = tweetContextCache ? tweetContextCache[tweetId] : null;

    if (cachedQuestions && cachedQuestions.length > 0) {
      console.log("[ReplyTab] Rendering cached questions for tweet:", tweetId, cachedQuestions);
      const qSection = document.createElement("div");
      qSection.className = "brainstorm-section";
      qSection.style.margin = "12px 0";
      qSection.style.padding = "12px";
      qSection.style.backgroundColor = "rgba(29, 161, 242, 0.1)";
      qSection.style.borderRadius = "8px";

      const qHeading = document.createElement("h3");
      qHeading.textContent = "Brainstorm Your Own Reply";
      qHeading.style.margin = "0 0 8px 0";
      qHeading.style.fontSize = "14px";
      qHeading.style.fontWeight = "bold";
      qHeading.style.color = "#1DA1F2";
      qSection.appendChild(qHeading);

      const qList = document.createElement("ul");
      qList.style.margin = "8px 0 0 0";
      qList.style.paddingLeft = "20px";
      cachedQuestions.forEach((question) => {
        const li = document.createElement("li");
        li.textContent = question;
        li.style.margin = "4px 0";
        li.style.fontSize = "13px";
        qList.appendChild(li);
      });
      qSection.appendChild(qList);
      questionsSectionContainer.appendChild(qSection);
    } else if (fetchingQuestionsForTweetId === tweetId) {
      console.log("[ReplyTab] Questions are currently being fetched for tweet:", tweetId);
      const loadingText = document.createElement("p");
      loadingText.textContent = "Loading brainstorming questions...";
      loadingText.className = "loading-questions-text";
      loadingText.style.padding = "12px"; 
      loadingText.style.textAlign = "center";
      questionsSectionContainer.appendChild(loadingText);
    } else {
      console.log("[ReplyTab] Initiating fetch for questions for tweet:", tweetId);
      
      // 1. Tell state.js we are starting to fetch for this tweetId
      chrome.runtime.sendMessage({
          type: "MARK_FETCHING_QUESTIONS", 
          payload: { tweetId: tweetId }
      });

      // 2. Request questions from background script
      chrome.runtime.sendMessage(
        { type: "GENERATE_QUESTIONS", contextTweet: tweet },
        (ackResponse) => {
          if (ackResponse && ackResponse.success) {
            console.log("[ReplyTab] GENERATE_QUESTIONS acknowledged for tweet:", tweetId, ackResponse.message);
          } else if (ackResponse && ackResponse.error) {
            console.error("[ReplyTab] Error from GENERATE_QUESTIONS call:", ackResponse.error);
            const errorTextElement = questionsSectionContainer.querySelector('.error-questions-text') || document.createElement("p");
            errorTextElement.textContent = `Error: ${ackResponse.error}`;
            errorTextElement.className = "error-questions-text";
            errorTextElement.style.padding = "12px";
            errorTextElement.style.color = "#e0245e";
            errorTextElement.style.textAlign = "center";
            questionsSectionContainer.appendChild(errorTextElement);
          }
        }
      );
    }
    
    container.appendChild(questionsSectionContainer);
  }
  
  // Chat message area for regular messages (excluding suggestions which are handled separately)
  // Only render this section if there are actual conversation messages (user input or AI replies)
  const conversationMessages = messages ? messages.filter(msg => msg.type !== 'suggestion') : [];
  
  if (conversationMessages.length > 0) {
    const chatArea = document.createElement("div");
    chatArea.className = "chat-area";
    chatArea.style.marginTop = "16px";
    
    // Render all regular chat messages (excluding suggestion-type messages)
    conversationMessages.forEach(msg => {
      const messageCard = document.createElement("div");
      messageCard.className = `message-card ${msg.sender === 'user' ? 'user-message' : 'ai-message'}`;
      
      const messageText = document.createElement("div");
      messageText.className = "message-text";
      messageText.textContent = msg.content;
      messageCard.appendChild(messageText);
      
      // Add Use Reply button only to AI messages of type 'reply'
      if (msg.sender === 'ai' && msg.type === 'reply') {
        const messageActions = document.createElement("div");
        messageActions.className = "message-actions";
        
        const useButton = document.createElement("button");
        useButton.className = "message-button";
        useButton.textContent = "Use Reply";
        useButton.onclick = () => onUseReply(msg.content);
        messageActions.appendChild(useButton);
        
        messageCard.appendChild(messageActions);
      }
      
      chatArea.appendChild(messageCard);
    });
    
    container.appendChild(chatArea);
  }
  
  // Show a title for the text polisher when not on an X tweet and we have actual conversation messages
  const hasConversationMessages = messages ? messages.some(msg => msg.type !== 'suggestion') : false;
  
  if (!tweet && hasConversationMessages) {
    const textPolisherTitle = document.createElement("div");
    textPolisherTitle.className = "text-polisher-title";
    textPolisherTitle.textContent = "Text Polisher Mode";
    textPolisherTitle.style.fontSize = "18px";
    textPolisherTitle.style.fontWeight = "bold";
    textPolisherTitle.style.marginBottom = "16px";
    textPolisherTitle.style.textAlign = "center";
    textPolisherTitle.style.color = "#e7e9ea";
    container.appendChild(textPolisherTitle);
  }
  
  // Loading indicator if applicable
  if (isLoading) {
    const loadingIndicator = document.createElement("div");
    loadingIndicator.className = "loading-indicator";
    loadingIndicator.textContent = "Generating replies...";
    loadingIndicator.style.padding = "16px";
    loadingIndicator.style.textAlign = "center";
    loadingIndicator.style.color = "#8899a6";
    container.appendChild(loadingIndicator);
  }

  // Add styles to the document head
  const styleElement = document.createElement("style");
  styleElement.textContent = `
    .tweet-card {
      margin-bottom: 16px;
      padding: 12px;
      border-radius: var(--border-radius);
      background-color: var(--color-bg-tertiary);
      border: 1px solid var(--border-color);
    }
    
    .tweet-author {
      font-weight: bold;
      margin-bottom: 4px;
      color: #e7e9ea;
    }
    
    .tweet-text {
      color: #e7e9ea;
      line-height: 1.4;
    }
    
    .action-buttons-container {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    
    .action-button {
      flex: 1;
      background-color: var(--hover-color);
      color: #e7e9ea;
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius);
      padding: 8px 16px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: var(--transition);
    }
    
    .action-button:hover {
      background-color: rgba(29, 161, 242, 0.1);
      border-color: var(--primary-color);
    }
    
    .chat-area {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 16px;
    }
    
    .message-card {
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 8px;
      animation: slideIn 0.3s ease-out forwards;
    }
    
    .user-message {
      background-color: rgba(29, 161, 242, 0.1);
      border: 1px solid rgba(29, 161, 242, 0.2);
      align-self: flex-end;
      margin-left: 20px;
    }
    
    .ai-message {
      background-color: var(--hover-color);
      border: 1px solid var(--border-color);
      align-self: flex-start;
      margin-right: 20px;
    }
    
    .suggestions-section {
      margin-bottom: 24px;
    }
    
    .suggestion-card {
      margin-bottom: 12px;
      padding: 12px;
      border-radius: var(--border-radius);
      background-color: rgba(29, 161, 242, 0.05);
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
    
    .results-container {
      margin-top: 16px;
      padding: 12px;
      border-radius: var(--border-radius);
      background-color: var(--hover-color);
      border: 1px solid var(--border-color);
    }
    
    .instructions {
      color: #8899a6;
      font-size: 14px;
      text-align: center;
      padding: 16px;
    }
    
    .results-title {
      margin: 0 0 12px 0;
      font-size: 16px;
      font-weight: 600;
      color: #e7e9ea;
    }
    
    .slide-in {
      animation: slideIn 0.3s ease-out forwards;
    }
    
    @keyframes slideIn {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 16px;
      color: #8899a6;
      text-align: center;
    }
    
    .empty-state-icon {
      margin-bottom: 16px;
      color: #8899a6;
    }
    
    .empty-state-text {
      font-size: 16px;
      font-weight: 500;
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
  const emptyState = document.createElement("div");
  emptyState.className = "empty-state";

  const icon = document.createElement("div");
  icon.className = "empty-state-icon";

  if (type === "reply") {
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

  const text = document.createElement("div");
  text.className = "empty-state-text";

  if (type === "reply") {
    text.textContent = "Focus on a tweet to get reply suggestions";
  } else {
    text.textContent = "Start composing to get tweet ideas";
  }

  emptyState.appendChild(icon);
  emptyState.appendChild(text);

  return emptyState;
}
