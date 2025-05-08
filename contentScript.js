// Track currently focused tweet
let currentTweet = null;
let observer = null;

// Initialize when content script loads
init();

/**
 * Initialize the content script
 */
function init() {
  // Inject the toggle button when the page is fully loaded
  if (document.readyState === "complete") {
    injectToggleButton();
    setupTweetObserver();
  } else {
    window.addEventListener("load", () => {
      injectToggleButton();
      setupTweetObserver();
    });
  }

  // Listen for messages from sidepanel
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "USE_REPLY" && request.text) {
      insertReplyText(request.text);
      sendResponse({ success: true });
      return true;
    }

    if (request.type === "USE_TWEET" && request.text) {
      insertTweetText(request.text);
      sendResponse({ success: true });
      return true;
    }

    if (request.type === "GET_CURRENT_TWEET") {
      sendResponse({ tweetData: currentTweet });
      return true;
    }

    if (request.type === "CHECK_COMPOSER_EMPTY") {
      const isEmpty = isComposerEmpty();
      sendResponse({ isEmpty });
      return true;
    }

    if (request.action === 'collectVoiceTrainingData') {
      console.log('[XCO-Poster] Received request to collect voice training data from side panel.');
      const activeUrl = request.activeTabUrl ? request.activeTabUrl : window.location.href;
      const username = getProfileUsernameFromUrl(activeUrl);
      const currentPath = request.activeTabUrl ? new URL(activeUrl).pathname : window.location.pathname;
      const currentTab = getCurrentProfileTab(username, currentPath);
      const nonUserProfilePaths = ['home', 'explore', 'notifications', 'messages', 'settings', 'i', 'search', 'compose', 'logout', 'login', 'signup', 'tos', 'privacy', 'connect_people', 'verified_followers', 'followers_you_know', 'following', 'followers', 'lists', 'communities', 'premium_support', 'topics', 'moments', 'bookmarks', 'analytics'];

      if (username && nonUserProfilePaths.includes(username.toLowerCase())) {
        console.log(`[XCO-Poster] Attempt to collect voice training data from non-user profile page: /${username}`);
        sendResponse({ error: `This page ('/${username}') is not a user profile page suitable for voice training.` });
        return true;
      }

      if (isOwnProfilePage(username, currentPath)) {
        if (currentTab === 'posts' || currentTab === 'replies') {
          console.log(`[XCO-Poster] Initiating voice training data collection from ${currentTab} tab (URL: ${request.activeTabUrl}).`);
          // ... rest of the code
          return true; 
        } else {
          sendResponse({ error: `Voice training data can only be collected from Posts or Replies tabs. You are on '${currentTab || 'unknown'}' tab.` });
        }
      } else {
        sendResponse({ error: 'Not on your profile page, or unable to determine profile from URL. Please navigate to your profile.' });
      }
      return true; // Indicates async response
    }

    if (request.action === 'collectInterestData') {
      console.log('[XCO-Poster] Received request to collect interest data from side panel.');
      const activeUrl = request.activeTabUrl ? request.activeTabUrl : window.location.href;
      const username = getProfileUsernameFromUrl(activeUrl);
      const currentPath = request.activeTabUrl ? new URL(activeUrl).pathname : window.location.pathname;
      const currentTab = getCurrentProfileTab(username, currentPath);
      const nonUserProfilePaths = ['home', 'explore', 'notifications', 'messages', 'settings', 'i', 'search', 'compose', 'logout', 'login', 'signup', 'tos', 'privacy', 'connect_people', 'verified_followers', 'followers_you_know', 'following', 'followers', 'lists', 'communities', 'premium_support', 'topics', 'moments', 'bookmarks', 'analytics'];

      if (username && nonUserProfilePaths.includes(username.toLowerCase())) {
        console.log(`[XCO-Poster] Attempt to collect interest data from non-user profile page: /${username}`);
        sendResponse({ error: `This page ('/${username}') is not a user profile page suitable for interest data collection.` });
        return true;
      }

      if (isOwnProfilePage(username, currentPath)) {
        if (currentTab === 'likes') {
          console.log(`[XCO-Poster] Initiating interest data collection from Likes tab (URL: ${request.activeTabUrl}).`);
          // ... rest of the code
          return true; 
        } else {
          sendResponse({ error: `Interest data can only be collected from the Likes tab. You are on '${currentTab || 'unknown'}' tab.` });
        }
      } else {
        sendResponse({ error: 'Not on your profile page, or unable to determine profile from URL. Please navigate to your profile.' });
      }
      return true; // Indicates async response
    }
  });
}

/**
 * Inject a toggle button for the side panel
 */
function injectToggleButton() {
  // Check if already exists
  if (document.getElementById("X-Chat-toggle")) return;

  const button = document.createElement("button");
  button.id = "X-Chat-toggle";
  button.innerHTML = `
    <div class="X-Chat-toggle-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    </div>
  `;
  button.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 20px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background-color: #1DA1F2;
    color: white;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 9999;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s ease;
  `;

  button.addEventListener("mouseover", () => {
    button.style.transform = "scale(1.1)";
  });

  button.addEventListener("mouseout", () => {
    button.style.transform = "scale(1)";
  });

  button.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "TOGGLE_SIDEPANEL" });
  });

  document.body.appendChild(button);
}

/**
 * Set up MutationObserver to detect tweet focus
 */
function setupTweetObserver() {
  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver(checkForTweetChanges);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial check
  checkForTweetChanges();
}

/**
 * Check for changes in focused tweet
 */
function checkForTweetChanges() {
  // Look for tweet in permalink view
  const tweetArticle = document.querySelector('article[data-testid="tweet"]');

  if (tweetArticle) {
    const tweetTextElement = tweetArticle.querySelector('[data-testid="tweetText"]');
    const authorElement = tweetArticle.querySelector('[data-testid="User-Name"] a');

    if (tweetTextElement && authorElement) {
      const tweetText = tweetTextElement.textContent;
      const tweetAuthorHandle = authorElement.href.split("/").pop();
      const tweetURL = window.location.href;

      // If we've found a new tweet
      if (
        !currentTweet ||
        currentTweet.tweetText !== tweetText ||
        currentTweet.tweetAuthorHandle !== tweetAuthorHandle
      ) {
        currentTweet = {
          tweetText,
          tweetAuthorHandle,
          tweetURL,
        };

        // Notify the sidepanel
        chrome.runtime.sendMessage({
          type: "TWEET_FOCUSED",
          tweetData: currentTweet,
        });
      }
    }
  } else {
    // Check if we're in compose mode
    const composerEmpty = isComposerEmpty();

    if (composerEmpty && currentTweet !== null) {
      // Reset current tweet and notify sidepanel we're in compose mode
      currentTweet = null;
      chrome.runtime.sendMessage({
        type: "COMPOSE_MODE",
      });
    }
  }
}

/**
 * Check if tweet composer is empty
 * @returns {boolean} - True if composer is empty
 */
function isComposerEmpty() {
  const composer = document.querySelector('[data-testid="tweetTextarea_0"]');
  return composer && composer.textContent.trim() === "";
}

/**
 * Insert reply text into tweet reply form
 * @param {string} text - The text to insert
 */
function insertReplyText(text) {
  // Find the reply button and click it if we're not already in reply mode
  const replyButton = document.querySelector('[data-testid="reply"]');
  if (replyButton && !document.querySelector('[data-testid="tweetTextarea_0"]')) {
    replyButton.click();

    // Wait for composer to appear
    setTimeout(() => {
      insertTextIntoComposer(text);
    }, 500);
  } else {
    insertTextIntoComposer(text);
  }
}

/**
 * Insert tweet text into main composer
 * @param {string} text - The text to insert
 */
function insertTweetText(text) {
  // Find the compose button and click it if we're not already in compose mode
  const composeButton = document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
  if (composeButton && !document.querySelector('[data-testid="tweetTextarea_0"]')) {
    composeButton.click();

    // Wait for composer to appear
    setTimeout(() => {
      insertTextIntoComposer(text);
    }, 500);
  } else {
    insertTextIntoComposer(text);
  }
}

/**
 * Insert text into the tweet composer
 * @param {string} text - The text to insert
 */
function insertTextIntoComposer(text) {
  const composer = document.querySelector('[data-testid="tweetTextarea_0"]');
  if (composer) {
    composer.focus();

    // Primary method: Directly set text and dispatch event
    composer.textContent = text;
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    const dispatched = composer.dispatchEvent(inputEvent);

    if (composer.textContent === text) {
      console.log('[ContentScript] Text successfully inserted via direct manipulation and input event.');
    } else {
      console.warn('[ContentScript] Direct textContent manipulation might have failed. Trying clipboard fallback.');
      // Fallback: Use clipboard API (original method)
      navigator.clipboard
        .writeText(text)
        .then(() => {
          // Simulate paste event
          const pasted = document.execCommand('paste');
          if (pasted && composer.textContent.includes(text)) {
            console.log('[ContentScript] Text successfully inserted via clipboard paste fallback.');
          } else {
            console.error('[ContentScript] Clipboard paste fallback also failed or did not insert expected text.');
          }
        })
        .catch((err) => {
          console.error('[ContentScript] Failed to write to clipboard for fallback:', err);
        });
    }
  } else {
    console.error('[ContentScript] Composer element [data-testid="tweetTextarea_0"] not found.');
  }
}

// Helper functions
function getProfileUsernameFromUrl(url) {
  const urlParts = url.split('/');
  return urlParts[urlParts.length - 1];
}

function getCurrentProfileTab(username, currentPath) {
  const pathParts = currentPath.split('/');
  if (pathParts.includes(username)) {
    return pathParts[pathParts.length - 1];
  }
  return null;
}

function isOwnProfilePage(username, currentPath) {
  return username === getProfileUsernameFromUrl(currentPath);
}
