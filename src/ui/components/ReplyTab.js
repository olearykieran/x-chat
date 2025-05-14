/**
 * Render the reply tab content
 * @param {Object} props - Component props
 * @returns {HTMLElement} - Reply tab element
 */
export function renderReplyTab({ tweet, messages, onUseReply, isLoading, tweetContextCache, fetchingQuestionsForTweetId }) {
  console.log("[ReplyTab] renderReplyTab called. isLoading:", isLoading, "Fetching for:", fetchingQuestionsForTweetId);
  const container = document.createElement("div");

  // If no tweet is selected but we have messages to show, still render the chat
  // Otherwise show the empty state
  if (!tweet && (!messages || messages.length === 0)) {
    container.appendChild(renderEmptyState("reply"));
    return container;
  }
  
  // If no tweet is selected but we have messages, don't render the tweet card
  // but still show the conversation

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
  
  // Show a title for the text polisher when not on an X tweet
  if (!tweet && messages && messages.length > 0) {
    const textPolisherTitle = document.createElement("div");
    textPolisherTitle.className = "text-polisher-title";
    textPolisherTitle.textContent = "Text Polisher Mode";
    textPolisherTitle.style.fontSize = "18px";
    textPolisherTitle.style.fontWeight = "bold";
    textPolisherTitle.style.marginBottom = "16px";
    textPolisherTitle.style.textAlign = "center";
    textPolisherTitle.style.color = "#1DA1F2";
    container.appendChild(textPolisherTitle);
    
    const textPolisherDescription = document.createElement("div");
    textPolisherDescription.className = "text-polisher-description";
    textPolisherDescription.textContent = "Enter text below to have it polished and improved.";
    textPolisherDescription.style.fontSize = "14px";
    textPolisherDescription.style.marginBottom = "16px";
    textPolisherDescription.style.textAlign = "center";
    textPolisherDescription.style.color = "#8899a6";
    container.appendChild(textPolisherDescription);
  }

  // Results container for displaying AI-generated content
  const resultsContainer = document.createElement("div");
  resultsContainer.className = "results-container";

  // Check if we have AI messages with suggestions
  const aiMessages = messages.filter((msg) => msg.sender === "ai");
  if (aiMessages.length > 0) {
    // Find the most recent AI message
    const latestAIMessage = aiMessages[aiMessages.length - 1];

    // Check if we have multiple suggestions in the allReplies property
    const allReplies = latestAIMessage.allReplies || [latestAIMessage.text];

    // Add a title based on the message type
    const resultsTitle = document.createElement("h3");
    resultsTitle.className = "results-title";
    resultsTitle.textContent =
      allReplies.length > 1 ? "Polished Reply Options" : "AI-Written Reply";
    resultsContainer.appendChild(resultsTitle);

    // Render each suggestion as a card
    allReplies.forEach((reply, index) => {
      const suggestionCard = document.createElement("div");
      suggestionCard.className = "suggestion-card slide-in";

      // Only show numbers if there are multiple options
      if (allReplies.length > 1) {
        const suggestionNumber = document.createElement("div");
        suggestionNumber.className = "suggestion-number";
        suggestionNumber.textContent = `${index + 1}`;
        suggestionCard.appendChild(suggestionNumber);
      }

      // Suggestion text
      const suggestionText = document.createElement("div");
      suggestionText.className = "suggestion-text";

      // Final cleanup of any hyphens/dashes that might have slipped through all the way to UI
      let cleanedReply = reply.replace(/[-\u2013\u2014]/g, " ").replace(/\s+/g, " ");

      suggestionText.textContent = cleanedReply;
      suggestionCard.appendChild(suggestionText);

      // Actions for this suggestion
      const actionsEl = document.createElement("div");
      actionsEl.className = "message-actions";

      const useButton = document.createElement("button");
      useButton.className = "message-button";
      useButton.textContent = "Use Reply";
      useButton.addEventListener("click", () => {
        console.log("[ReplyTab] Use Reply button clicked with text:", cleanedReply);
        // Direct implementation to avoid dependency on state
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            console.log(
              "[ReplyTab] Sending USE_REPLY message directly to tab:",
              tabs[0].id
            );
            chrome.tabs.sendMessage(
              tabs[0].id,
              {
                type: "USE_REPLY",
                text: cleanedReply,
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.log(
                    "[ReplyTab] Error in USE_REPLY response:",
                    chrome.runtime.lastError.message
                  );
                  return;
                }
                console.log("[ReplyTab] USE_REPLY response:", response);
              }
            );
          }
        });

        if (onUseReply) {
          onUseReply(cleanedReply);
        }
      });

      const copyButton = document.createElement("button");
      copyButton.className = "message-button";
      copyButton.textContent = "Copy";
      copyButton.addEventListener("click", () => {
        navigator.clipboard.writeText(cleanedReply);
        copyButton.textContent = "Copied!";
        setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 2000);
      });

      actionsEl.appendChild(useButton);
      actionsEl.appendChild(copyButton);
      suggestionCard.appendChild(actionsEl);

      resultsContainer.appendChild(suggestionCard);
    });
  } else {
    // If there are messages but none from AI
    const noSuggestions = document.createElement("div");
    noSuggestions.className = "empty-state-text";
    noSuggestions.textContent = "No AI suggestions available yet.";
    resultsContainer.appendChild(noSuggestions);
  }

  container.appendChild(resultsContainer);

  // Add styles
  const styleElement = document.createElement("style");
  styleElement.textContent = `
    .tweet-card {
      margin-bottom: 16px;
      padding: 12px;
      border-radius: var(--border-radius);
      background-color: var(--hover-color);
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
