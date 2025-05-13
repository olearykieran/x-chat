/**
 * Render the compose tab content - Post Polisher
 * @param {Object} props - Component props
 * @returns {HTMLElement} - Compose tab element
 */
export function renderComposeTab({ ideas, onUseTweet, isLoading }) {
  const container = document.createElement("div");
  container.className = "compose-container";

  // Add header
  const headerEl = document.createElement("div");
  headerEl.className = "compose-header";

  const titleEl = document.createElement("h2");
  titleEl.className = "compose-title";
  titleEl.textContent = "Post Creator";
  headerEl.appendChild(titleEl);

  const descriptionEl = document.createElement("p");
  descriptionEl.className = "compose-description";
  descriptionEl.textContent = "Use the buttons below to create or polish your post.";
  headerEl.appendChild(descriptionEl);

  container.appendChild(headerEl);

  // Action buttons container
  const actionButtonsContainer = document.createElement("div");
  actionButtonsContainer.className = "action-buttons-container";

  // Write Post button
  const writePostButton = document.createElement("button");
  writePostButton.className = "action-button";
  writePostButton.textContent = "Write Post";
  writePostButton.addEventListener("click", () => {
    console.log("[ComposeTab] Write Post button clicked");
    // Get the current input text from the textarea
    const inputText = document.querySelector(".input-box")?.value || "";

    // Send message to background script to generate a post based on the input text
    chrome.runtime.sendMessage(
      {
        type: "WRITE_POST",
        userPrompt: inputText,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[ComposeTab] Error sending WRITE_POST message:",
            chrome.runtime.lastError
          );
          return;
        }

        console.log("[ComposeTab] WRITE_POST response:", response);
      }
    );
  });

  // Polish Post button
  const polishPostButton = document.createElement("button");
  polishPostButton.className = "action-button";
  polishPostButton.textContent = "Polish Post";
  polishPostButton.addEventListener("click", () => {
    console.log("[ComposeTab] Polish Post button clicked");
    // Get the current input text from the textarea
    const inputText = document.querySelector(".input-box")?.value || "";

    if (!inputText.trim()) {
      alert("Please enter your draft post to polish.");
      return;
    }

    // Send message to background script to polish the draft post
    chrome.runtime.sendMessage(
      {
        type: "POLISH_POST",
        userDraft: inputText,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[ComposeTab] Error sending POLISH_POST message:",
            chrome.runtime.lastError
          );
          return;
        }

        console.log("[ComposeTab] POLISH_POST response:", response);
      }
    );
  });

  actionButtonsContainer.appendChild(writePostButton);
  actionButtonsContainer.appendChild(polishPostButton);
  container.appendChild(actionButtonsContainer);

  // Results container
  const resultsContainer = document.createElement("div");
  resultsContainer.className = "results-container";

  // Handle different states
  if (ideas && ideas.length > 0) {
    // Filter out any ideas with separator text or that are too short
    const validIdeas = ideas.filter(
      (idea) => !idea.includes("POST_SEPARATOR") && idea.length > 5
    );

    if (validIdeas.length > 0) {
      // Add a title based on the number of ideas
      const resultsTitle = document.createElement("h3");
      resultsTitle.className = "results-title";
      resultsTitle.textContent =
        validIdeas.length > 1 ? "Polished Post Options" : "AI-Written Post";
      resultsContainer.appendChild(resultsTitle);

      // Container for all post ideas
      const ideasContainer = document.createElement("div");
      ideasContainer.className = "messages";

      // Create an element for each post idea
      validIdeas.forEach((idea, index) => {
        const ideaEl = document.createElement("div");
        ideaEl.className = "suggestion-card slide-in";

        // Only show numbers if there are multiple options
        if (validIdeas.length > 1) {
          const numberBadge = document.createElement("div");
          numberBadge.className = "suggestion-number";
          numberBadge.textContent = `${index + 1}`;
          ideaEl.appendChild(numberBadge);
        }

        // Post content
        const contentEl = document.createElement("div");
        contentEl.className = "suggestion-text";
        contentEl.textContent = idea;
        ideaEl.appendChild(contentEl);

        // Action buttons
        const actionsEl = document.createElement("div");
        actionsEl.className = "message-actions";

        // Use button
        const useButton = document.createElement("button");
        useButton.className = "message-button";
        useButton.textContent = "Use Post";
        useButton.addEventListener("click", () => {
          if (onUseTweet) {
            onUseTweet(idea);
          }

          // Direct implementation to avoid dependency on state
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
              console.log(
                "[ComposeTab] Sending USE_POST message directly to tab:",
                tabs[0].id
              );
              chrome.tabs.sendMessage(
                tabs[0].id,
                {
                  type: "USE_POST",
                  text: idea,
                },
                (response) => {
                  if (chrome.runtime.lastError) {
                    console.log(
                      "[ComposeTab] Error in USE_POST response:",
                      chrome.runtime.lastError.message
                    );
                    return;
                  }
                  console.log("[ComposeTab] USE_POST response:", response);
                }
              );
            }
          });
        });

        // Copy button
        const copyButton = document.createElement("button");
        copyButton.className = "message-button";
        copyButton.textContent = "Copy";
        copyButton.addEventListener("click", () => {
          navigator.clipboard.writeText(idea);
          copyButton.textContent = "Copied!";
          setTimeout(() => {
            copyButton.textContent = "Copy";
          }, 2000);
        });

        actionsEl.appendChild(useButton);
        actionsEl.appendChild(copyButton);
        ideaEl.appendChild(actionsEl);

        ideasContainer.appendChild(ideaEl);
      });

      resultsContainer.appendChild(ideasContainer);
    } else {
      // If all ideas were filtered out as invalid
      const instructionsEl = document.createElement("div");
      instructionsEl.className = "instructions";
      resultsContainer.appendChild(instructionsEl);
    }
  } else if (isLoading) {
    // Show loading state
    const loadingEl = document.createElement("div");
    loadingEl.className = "loading-state";
    loadingEl.textContent = "Generating your post...";
    resultsContainer.appendChild(loadingEl);
  } else {
    // Show instructions when no ideas yet
    const instructionsEl = document.createElement("div");
    instructionsEl.className = "instructions";
    instructionsEl.textContent = " to write or polish a post.";
    resultsContainer.appendChild(instructionsEl);
  }

  container.appendChild(resultsContainer);

  // Add styles
  const styleElement = document.createElement("style");
  styleElement.textContent = `
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
    
    .loading-state {
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
 * @param {string} type - Type of empty state
 * @returns {HTMLElement} - Empty state element
 */
function renderEmptyState(type) {
  const emptyState = document.createElement("div");
  emptyState.className = "empty-state";

  const icon = document.createElement("div");
  icon.className = "empty-state-icon";

  if (type === "loading") {
    // Loading spinner icon
    icon.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 6v6l4 2"></path>
      </svg>
    `;
  } else if (type === "compose") {
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

  const text = document.createElement("div");
  text.className = "empty-state-text";

  if (type === "loading") {
    text.textContent = "Creating your post...";
  } else if (type === "compose") {
    text.textContent = " to write or polish a post.";
  } else {
    text.textContent = "Ready to create your post!";
  }

  emptyState.appendChild(icon);
  emptyState.appendChild(text);

  return emptyState;
}
