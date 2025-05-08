let focusedTweetData = null;
let lastObservedUrl = '';

console.log('[XCO-Poster ContentScript] Loaded');

// --- Existing Tweet Focusing Logic (Assumed) ---
function findParentTweet(element) {
  let current = element;
  while (current) {
    if (current.matches('article[data-testid="tweet"]')) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function extractTweetData(tweetArticle) {
  if (!tweetArticle) return null;
  const textEl = tweetArticle.querySelector('div[data-testid="tweetText"]');
  const userEl = tweetArticle.querySelector('div[data-testid="User-Name"] a');
  const timeEl = tweetArticle.querySelector('time');

  const tweetText = textEl ? textEl.innerText : '';
  const tweetAuthorName = userEl ? userEl.innerText.split('\n').find(s => !s.startsWith('@')) : '';
  const tweetAuthorHandle = userEl ? userEl.innerText.split('\n').find(s => s.startsWith('@')) : '';
  const tweetUrl = timeEl && timeEl.parentElement.href ? timeEl.parentElement.href : window.location.href;
  
  return {
    tweetText,
    tweetAuthorName,
    tweetAuthorHandle,
    tweetUrl,
    source: 'content-script'
  };
}

function handleFocus(event) {
  const tweetArticle = findParentTweet(event.target);
  if (tweetArticle) {
    focusedTweetData = extractTweetData(tweetArticle);
    if (focusedTweetData) {
      chrome.runtime.sendMessage({ type: 'TWEET_FOCUSED', tweetData: focusedTweetData });
    }
  }
}

document.addEventListener('focusin', handleFocus, true);

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // GET_FOCUSED_TWEET Logic (from original listener)
  if (request.type === 'GET_FOCUSED_TWEET') {
    if (focusedTweetData) {
      sendResponse(focusedTweetData);
    } else {
      if (window.location.pathname.includes('/status/')) {
        const mainTweetArticle = document.querySelector('article[data-testid="tweet"]');
        if (mainTweetArticle) {
          sendResponse(extractTweetData(mainTweetArticle));
          return true;
        }
      }
      sendResponse(null);
    }
    return true; // Important for async sendResponse
  }

  // --- Side Panel Action Logic ---
  const username = getProfileUsernameFromUrl(request.activeTabUrl ? request.activeTabUrl : window.location.href); // Use request.activeTabUrl for this
  const currentPath = request.activeTabUrl ? new URL(request.activeTabUrl).pathname : window.location.pathname;
  const currentTab = getCurrentProfileTab(username, currentPath);

  if (request.action === 'collectVoiceTrainingData') {
    console.log('[XCO-Poster] Received request to collect voice training data from side panel.');
    if (!request.activeTabUrl) {
        console.error('[XCO-Poster] Active tab URL not provided in request for voice training.');
        sendResponse({ error: 'Active tab URL not provided.' });
        return true; 
    }

    if (isOwnProfilePage(username, currentPath)) {
      if (currentTab === 'posts' || currentTab === 'replies') {
        console.log(`[XCO-Poster] Initiating voice training data collection from ${currentTab} tab (URL: ${request.activeTabUrl}).`);
        scrapeUserPostsForVoiceTraining().then(posts => {
          if (posts && posts.length > 0) {
            sendUserDataToBackground('voice', posts); 
            sendResponse({ status: `Collected ${posts.length} posts/replies for voice training. Data sent to background.` });
          } else {
            sendResponse({ error: 'No posts or replies found to collect.' });
          }
        }).catch(error => {
          console.error("[XCO-Poster] Error scraping user posts:", error);
          sendResponse({ error: `Error scraping posts: ${error.message}` });
        });
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
    if (!request.activeTabUrl) {
        console.error('[XCO-Poster] Active tab URL not provided in request for interest data.');
        sendResponse({ error: 'Active tab URL not provided.' });
        return true; 
    }

    if (isOwnProfilePage(username, currentPath)) {
      if (currentTab === 'likes') {
        console.log(`[XCO-Poster] Initiating interest data collection from Likes tab (URL: ${request.activeTabUrl}).`);
        scrapeUserLikesForInterestAnalysis().then(likedTweets => {
          if (likedTweets && likedTweets.length > 0) {
            sendUserDataToBackground('interests', likedTweets); 
            sendResponse({ status: `Collected ${likedTweets.length} liked tweets for interest analysis. Data sent to background.` });
          } else {
            sendResponse({ error: 'No liked tweets found to collect.' });
          }
        }).catch(error => {
          console.error("[XCO-Poster] Error scraping user likes:", error);
          sendResponse({ error: `Error scraping likes: ${error.message}` });
        });
      } else {
        sendResponse({ error: `Interest data can only be collected from the Likes tab. You are on '${currentTab || 'unknown'}' tab.` });
      }
    } else {
      sendResponse({ error: 'Not on your profile page, or unable to determine profile from URL. Please navigate to your profile.' });
    }
    return true; // Indicates async response
  }
  
  // If no action matched, you might want to send a generic response or do nothing.
  // For now, we'll assume any other message types are not for this listener, or it's okay if they don't get a response.
  // If you need to ensure other listeners can run, return false for unhandled actions.
  // console.log("[XCO-Poster] Message not handled by primary listener:", request.action || request.type);
  // return false; // To allow other listeners to process if this one doesn't handle the message.
});

// --- New Voice Training & Topic Collection Logic ---

function getProfileUsernameFromUrl(url) { // Modified to accept a URL
  try {
    const path = new URL(url).pathname;
    const match = path.match(/^\/([^\/]+)/);
    return match ? match[1] : null;
  } catch (e) {
    // Fallback for cases where `url` might not be a full URL string, though it should be from `activeTabUrl`
    const match = window.location.pathname.match(/^\/([^\/]+)/);
    return match ? match[1] : null;
  }
}

// Checks if the current page is any part of the user's own profile
function isOwnProfilePage(username, pathname) {
  if (!username) return false;
  return pathname.startsWith(`/${username}`);
}

// Determines the specific active tab on the user's profile page
function getCurrentProfileTab(username, pathname) {
  if (!username || !isOwnProfilePage(username, pathname)) return null;

  // Ensure pathname is just the path, not the full URL
  const pathOnly = pathname.startsWith('/') ? pathname : new URL(pathname).pathname; 

  if (pathOnly === `/${username}` || pathOnly === `/${username}/`) {
    return 'posts'; // Main profile page defaults to Posts tab
  }
  if (pathOnly.endsWith('/with_replies')) {
    return 'replies';
  }
  if (pathOnly.endsWith('/media')) {
    return 'media';
  }
  if (pathOnly.endsWith('/likes')) {
    return 'likes';
  }
  if (pathOnly.endsWith('/articles')) {
    return 'articles';
  }
  return null; // Not a recognized tab or a sub-page like followers/following
}

// --- Data Scraping Functions (Modified to return Promises) ---

function scrapeUserPostsForVoiceTraining() {
  return new Promise((resolve, reject) => {
    console.log('[XCO-Poster] Starting to scrape user posts for voice training...');
    const tweets = [];
    document.querySelectorAll('article[data-testid="tweet"]').forEach(tweetElement => {
      const tweetTextElement = tweetElement.querySelector('[data-testid="tweetText"]');
      if (tweetTextElement && tweetTextElement.textContent) {
        tweets.push(tweetTextElement.textContent.trim());
      }
    });

    if (tweets.length > 0) {
      console.log(`[XCO-Poster] Scraped ${tweets.length} tweets.`);
      resolve(tweets);
    } else {
      console.log('[XCO-Poster] No tweets found to scrape for voice training.');
      resolve([]); // Resolve with empty array if no tweets found
    }
    // Removed direct sendMessage to background
  });
}

function scrapeUserLikesForInterestAnalysis() {
  return new Promise((resolve, reject) => {
    console.log('[XCO-Poster] Starting to scrape user likes for interest analysis...');
    const likedTweetsTexts = [];
    document.querySelectorAll('article[data-testid="tweet"]').forEach(tweetElement => {
      const tweetTextElement = tweetElement.querySelector('[data-testid="tweetText"]');
      if (tweetTextElement && tweetTextElement.textContent) {
        likedTweetsTexts.push(tweetTextElement.textContent.trim());
      }
    });

    if (likedTweetsTexts.length > 0) {
      console.log(`[XCO-Poster] Scraped ${likedTweetsTexts.length} liked tweets for interest analysis.`);
      resolve(likedTweetsTexts);
    } else {
      console.log('[XCO-Poster] No liked tweets found to scrape for interest analysis.');
      resolve([]); // Resolve with empty array if no likes found
    }
    // Removed direct sendMessage to background
  });
}

// --- sendUserDataToBackground function (remains largely the same) ---
function sendUserDataToBackground(dataType, data) {
  let actionType;
  if (dataType === 'voice') {
    actionType = 'SAVE_USER_POSTS';
  } else if (dataType === 'interests') {
    actionType = 'SAVE_USER_LIKES';
  } else {
    console.error('[XCO-Poster] Unknown data type for sending to background:', dataType);
    return;
  }

  // Ensure data is structured as expected by bg.js
  const payload = (dataType === 'voice') ? { userPosts: data } : { likedTweets: data };

  chrome.runtime.sendMessage({ type: actionType, data: payload }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(`[XCO-Poster] Error sending ${dataType} data to background:`, chrome.runtime.lastError.message);
    } else if (response && response.success) {
      console.log(`[XCO-Poster] ${dataType} data successfully sent to background and processed.`);
    } else {
      console.error(`[XCO-Poster] Background script failed to process ${dataType} data:`, response ? response.error : 'No response');
    }
  });
}

console.log('[XCO-Poster ContentScript] Enhanced for side panel interaction. Ready to receive commands.');
