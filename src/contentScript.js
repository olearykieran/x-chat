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
  
  // Enhanced author handle extraction
  let tweetAuthorHandle = '';
  if (userEl) {
    const handleText = userEl.innerText.split('\n').find(s => s.startsWith('@'));
    if (handleText) {
      tweetAuthorHandle = handleText.trim();
    } else {
      // Fallback: try to extract from href attribute if text extraction fails
      const userLink = userEl.getAttribute('href');
      if (userLink && userLink.startsWith('/')) {
        tweetAuthorHandle = '@' + userLink.substring(1).split('/')[0];
      }
    }
  }
  
  const tweetUrl = timeEl && timeEl.parentElement.href ? timeEl.parentElement.href : window.location.href;
  
  console.log('[XCO-Poster] Extracted tweet data:', { tweetText, tweetAuthorHandle, tweetUrl });
  
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
      try {
        chrome.runtime.sendMessage({ type: 'TWEET_FOCUSED', tweetData: focusedTweetData });
      } catch (error) {
        console.error('[XCO-Poster] Error sending message in handleFocus:', error);
        // If the extension context is invalidated, we should remove the event listener
        if (error.message && error.message.includes('Extension context invalidated')) {
          document.removeEventListener('focusin', handleFocus, true);
          console.log('[XCO-Poster] Extension context invalidated. Removing event listeners.');
        }
      }
    }
  }
}

document.addEventListener('focusin', handleFocus, true);

// Helper function to safely send messages
function safeSendMessage(message, callback) {
  try {
    chrome.runtime.sendMessage(message, callback);
  } catch (error) {
    console.error('[XCO-Poster] Error in safeSendMessage:', error);
    // Handle the callback to prevent hanging promises
    if (typeof callback === 'function') {
      callback({ error: `Extension context error: ${error.message}` });
    }
  }
}

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Check if the extension context is still valid
  try {
    // Test if we can access chrome.runtime.id (throws if invalidated)
    if (!chrome.runtime.id) {
      console.log('[XCO-Poster] Extension context appears to be invalidated');
      return false;
    }
  } catch (error) {
    console.error('[XCO-Poster] Error checking runtime context:', error);
    return false;
  }
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
  
  // Handle USE_REPLY message to insert text into Twitter's reply box
  if (request.type === 'USE_REPLY') {
    console.log('[XCO-Poster] USE_REPLY request received with text:', request.text);
    try {
      // Find the tweet that is currently being replied to
      let tweetArticle;
      
      // Check if we have a focused tweet first
      if (focusedTweetData) {
        // Find the tweet article that matches our focused data
        const allTweetArticles = document.querySelectorAll('article[data-testid="tweet"]');
        for (const article of allTweetArticles) {
          const data = extractTweetData(article);
          if (data && data.tweetText === focusedTweetData.tweetText && 
              data.tweetAuthorHandle === focusedTweetData.tweetAuthorHandle) {
            tweetArticle = article;
            break;
          }
        }
      }
      
      // If no focused tweet or couldn't find it, try to get the first visible tweet
      if (!tweetArticle) {
        tweetArticle = findFirstTweetInTimeline() || document.querySelector('article[data-testid="tweet"]');
      }
      
      if (tweetArticle) {
        // Find the reply button
        const replyButton = tweetArticle.querySelector('[data-testid="reply"]');
        
        if (replyButton) {
          console.log('[XCO-Poster] Found reply button, clicking it');
          // Click the reply button to open the reply box
          replyButton.click();
          
          // Wait for the reply textarea to appear
          setTimeout(() => {
            // The reply textarea typically has data-testid="tweetTextarea_0"
            const replyTextarea = document.querySelector('[data-testid="tweetTextarea_0"]');
            
            if (replyTextarea) {
              console.log('[XCO-Poster] Found reply textarea, inserting text');
              
              // Focus the textarea
              replyTextarea.focus();
              
              // Set the text content
              // We need to trigger both input event and set the content for it to work in X
              replyTextarea.textContent = request.text;
              
              // Dispatch input event to ensure X recognizes the change
              const inputEvent = new Event('input', { bubbles: true });
              replyTextarea.dispatchEvent(inputEvent);
              
              // Send success response
              sendResponse({ success: true });
            } else {
              console.error('[XCO-Poster] Could not find reply textarea after clicking reply button');
              sendResponse({ error: 'Could not find reply box' });
            }
          }, 500); // Give it time for the reply box to appear
          
          return true; // For async response
        } else {
          console.error('[XCO-Poster] Could not find reply button on tweet');
          sendResponse({ error: 'Could not find reply button' });
        }
      } else {
        console.error('[XCO-Poster] Could not find tweet to reply to');
        sendResponse({ error: 'No tweet found to reply to' });
      }
    } catch (error) {
      console.error('[XCO-Poster] Error in USE_REPLY handler:', error);
      sendResponse({ error: `Error inserting reply: ${error.message}` });
    }
    return true;
  }
  
  // Handle USE_TWEET message to insert text into Twitter's compose box
  if (request.type === 'USE_TWEET') {
    console.log('[XCO-Poster] USE_TWEET request received with text:', request.text);
    try {
      // Find and click the compose tweet button if the compose box isn't already open
      const composeButton = document.querySelector('a[data-testid="SideNav_NewTweet_Button"]');
      
      if (composeButton) {
        console.log('[XCO-Poster] Found compose button, clicking it');
        composeButton.click();
        
        // Wait for the compose textarea to appear
        setTimeout(() => {
          // The compose textarea typically has data-testid="tweetTextarea_0"
          const composeTextarea = document.querySelector('[data-testid="tweetTextarea_0"]');
          
          if (composeTextarea) {
            console.log('[XCO-Poster] Found compose textarea, inserting text');
            
            // Focus the textarea
            composeTextarea.focus();
            
            // Set the text content
            composeTextarea.textContent = request.text;
            
            // Dispatch input event to ensure X recognizes the change
            const inputEvent = new Event('input', { bubbles: true });
            composeTextarea.dispatchEvent(inputEvent);
            
            // Send success response
            sendResponse({ success: true });
          } else {
            // If we couldn't find the compose textarea, try another approach
            // This might be the case if user has already focused an input box or if the UI structure is different
            const anyActiveTextarea = document.activeElement;
            if (anyActiveTextarea && anyActiveTextarea.tagName === 'DIV' && 
                (anyActiveTextarea.getAttribute('role') === 'textbox' || 
                 anyActiveTextarea.contentEditable === 'true')) {
              
              console.log('[XCO-Poster] Found active editable element, inserting text');
              
              // Set the text content
              anyActiveTextarea.textContent = request.text;
              
              // Dispatch input event to ensure X recognizes the change
              const inputEvent = new Event('input', { bubbles: true });
              anyActiveTextarea.dispatchEvent(inputEvent);
              
              // Send success response
              sendResponse({ success: true });
            } else {
              console.error('[XCO-Poster] Could not find any suitable text input');
              sendResponse({ error: 'Could not find compose box' });
            }
          }
        }, 500); // Give it time for the compose box to appear
        
        return true; // For async response
      } else {
        // If no compose button, try to find an already open compose box
        const composeTextarea = document.querySelector('[data-testid="tweetTextarea_0"]');
        
        if (composeTextarea) {
          console.log('[XCO-Poster] Found compose textarea without clicking button, inserting text');
          
          // Focus the textarea
          composeTextarea.focus();
          
          // Set the text content
          composeTextarea.textContent = request.text;
          
          // Dispatch input event to ensure X recognizes the change
          const inputEvent = new Event('input', { bubbles: true });
          composeTextarea.dispatchEvent(inputEvent);
          
          // Send success response
          sendResponse({ success: true });
        } else {
          console.error('[XCO-Poster] Could not find compose button or textarea');
          sendResponse({ error: 'Could not find compose controls' });
        }
      }
    } catch (error) {
      console.error('[XCO-Poster] Error in USE_TWEET handler:', error);
      sendResponse({ error: `Error inserting tweet: ${error.message}` });
    }
    return true;
  }
  
  // NEW: Auto-select first post when reply tab is active
  if (request.type === 'GET_CURRENT_TWEET') {
    console.log('[XCO-Poster] GET_CURRENT_TWEET request received');
    // If we already have a focused tweet, return it
    if (focusedTweetData) {
      console.log('[XCO-Poster] Returning already focused tweet data');
      sendResponse({ tweetData: focusedTweetData });
      return true;
    }
    
    // Otherwise, find the first tweet in the timeline
    const firstTweet = findFirstTweetInTimeline();
    if (firstTweet) {
      const tweetData = extractTweetData(firstTweet);
      console.log('[XCO-Poster] Auto-selected first tweet:', tweetData);
      // Cache the data so we don't need to re-extract
      focusedTweetData = tweetData;
      sendResponse({ tweetData: tweetData });
    } else {
      console.log('[XCO-Poster] No tweets found in timeline');
      sendResponse({ tweetData: null });
    }
    return true;
  }

  // --- Side Panel Action Logic ---
  const username = getProfileUsernameFromUrl(request.activeTabUrl ? request.activeTabUrl : window.location.href); // Use request.activeTabUrl for this
  const currentPath = request.activeTabUrl ? new URL(request.activeTabUrl).pathname : window.location.pathname;
  const currentTab = getCurrentProfileTab(username, currentPath);

  if (request.action === 'collectVoiceTrainingData' || request.action === 'scrapeUserPostsForVoiceTraining') {
    console.log(`[XCO-Poster] Received request to collect voice training data. Action: ${request.action}`);
    if (!request.activeTabUrl && request.action === 'collectVoiceTrainingData') {
        console.error('[XCO-Poster] Active tab URL not provided in request for voice training.');
        sendResponse({ error: 'Active tab URL not provided.' });
        return true; 
    }

    // Check if we're on a relevant profile page
    // For debugging: log the current URL and detected profile information
    console.log(`[XCO-Poster] DEBUG: Current URL: ${window.location.href}`);
    console.log(`[XCO-Poster] DEBUG: Detected username: ${username}`);
    console.log(`[XCO-Poster] DEBUG: Detected tab: ${currentTab}`);
    
    // IMPORTANT: Force the scraping regardless of the current tab for testing
    const canScrapeVoice = username && (currentTab === 'tweets' || currentTab === 'replies');
    console.log(`[XCO-Poster] DEBUG: Can normally scrape voice? ${canScrapeVoice}`);
    console.log(`[XCO-Poster] DEBUG: FORCING SCRAPING REGARDLESS OF TAB for debugging`);
    
    // All checks passed, proceed with scraping
    console.log('[XCO-Poster] DEBUG: About to call scrapeUserPostsForVoiceTraining()');
    scrapeUserPostsForVoiceTraining()
      .then(result => {
        console.log('[XCO-Poster] DEBUG: Scraping completed successfully. Result:', result);
        console.log(`[XCO-Poster] DEBUG: Posts count: ${result.postsCount}, Replies count: ${result.repliesCount}`);
        
        // Send data to background script
        sendUserDataToBackground('voice', result);
        
        if (result && result.totalCount > 0) {
          let successMessage = "✅ Success! ";
          if (result.postsCount > 0 && result.repliesCount > 0) {
            successMessage += `Collected ${result.postsCount} posts and ${result.repliesCount} replies for AI voice training.`;
          } else if (result.postsCount > 0) {
            successMessage += `Collected ${result.postsCount} posts for AI voice training.`;
          } else if (result.repliesCount > 0) {
            successMessage += `Collected ${result.repliesCount} replies for AI voice training.`;
          }
          
          successMessage += " Your profile data has been updated and will be used to personalize generated content.";
          
          // Send response back to the caller
          sendResponse({ 
            success: true,
            status: successMessage,
            count: result.totalCount,
            postsCount: result.postsCount,
            repliesCount: result.repliesCount
          });
        } else {
          sendResponse({ 
            error: '❌ No posts or replies found on this page to collect. Try scrolling down to load more content, or make sure you have posted some tweets.'
          });
        }
      })
      .catch(error => {
        console.error("[XCO-Poster] Error scraping user posts:", error);
        sendResponse({ error: `❌ Error scraping posts: ${error.message}` });
      });
      
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
            sendResponse({ 
              status: `✅ Success! Collected ${likedTweets.length} liked posts for interest analysis. Your profile data has been updated and will be used to personalize content topics.`,
              count: likedTweets.length 
            });
          } else {
            sendResponse({ 
              error: '❌ No liked posts found on this page. Try scrolling down to load more likes, or make sure you have liked some posts first.' 
            });
          }
        }).catch(error => {
          console.error("[XCO-Poster] Error scraping user likes:", error);
          sendResponse({ error: `❌ Error analyzing likes: ${error.message}` });
        });
      } else {
        sendResponse({ 
          error: `❌ You need to be on your Likes tab to collect interest data. Currently on '${currentTab || 'unknown'}' tab.\n\nPlease navigate to your X profile page and click on the Likes tab, then try again.` 
        });
      }
    } else {
      sendResponse({ 
        error: '❌ Not on your X profile page. Please navigate to your own profile (click your avatar at the bottom left of X), then try again.' 
      });
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
    const posts = [];
    const replies = [];
    
    // Get the current profile username and path to identify the tab correctly
    const username = getProfileUsernameFromUrl(window.location.href);
    const pathname = window.location.pathname;
    
    console.log(`[XCO-Poster] DEBUG: URL=${window.location.href}, pathname=${pathname}`);
    
    // Debug log checking if pathname has the with_replies suffix
    console.log(`[XCO-Poster] DEBUG: Is replies path? ${pathname.endsWith('/with_replies')}`);
    
    const currentTab = getCurrentProfileTab(username, pathname); // Correctly call with parameters
    
    console.log(`[XCO-Poster] Current profile tab detected: ${currentTab}, Username: ${username}`);
    
    let tweetCount = 0;
    document.querySelectorAll('article[data-testid="tweet"]').forEach(tweetElement => {
      tweetCount++;
      const tweetTextElement = tweetElement.querySelector('[data-testid="tweetText"]');
      // Skip if tweet has no text content
      if (!tweetTextElement || !tweetTextElement.textContent) {
        console.log('[XCO-Poster] DEBUG: Found tweet element without text content');
        return;
      }
      
      const tweetText = tweetTextElement.textContent.trim();
      console.log(`[XCO-Poster] DEBUG: Processing tweet ${tweetText.substring(0, 20)}...`);
      
      // Determine if this is a post or reply based on current tab
      if (currentTab === 'replies') {
        console.log('[XCO-Poster] DEBUG: Adding tweet to REPLIES collection');
        replies.push(tweetText);
      } else {
        console.log('[XCO-Poster] DEBUG: Adding tweet to POSTS collection');
        // Default to posts tab
        posts.push(tweetText);
      }
    });
    
    // Debug log for total tweet elements found
    console.log(`[XCO-Poster] DEBUG: Found ${tweetCount} tweet elements on page`);

    // Return both posts and replies with their counts
    const result = {
      posts: posts,
      replies: replies,
      postsCount: posts.length,
      repliesCount: replies.length,
      totalCount: posts.length + replies.length
    };

    if (result.totalCount > 0) {
      console.log(`[XCO-Poster] Scraped ${result.postsCount} posts and ${result.repliesCount} replies.`);
      resolve(result);
    } else {
      console.log('[XCO-Poster] No tweets found to scrape for voice training.');
      resolve({ posts: [], replies: [], postsCount: 0, repliesCount: 0, totalCount: 0 }); // Resolve with empty data if no tweets found
    }
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

// Function to send user data to background script
function sendUserDataToBackground(dataType, data) {
  let actionType;
  let payload;
  
  console.log(`[XCO-Poster] DEBUG: sendUserDataToBackground called with dataType=${dataType}`);
  console.log('[XCO-Poster] DEBUG: Data received:', data);
  
  if (dataType === 'voice') {
    actionType = 'SAVE_USER_POSTS';
    // With our new structure, handle posts and replies separately
    if (data.posts && data.replies !== undefined) { // Check for replies array existence
      // New structured format with separate posts and replies
      console.log(`[XCO-Poster] DEBUG: Processing structured data with ${data.postsCount} posts and ${data.repliesCount} replies`);
      
      payload = {
        userPosts: data.posts,
        userReplies: data.replies,
        postsCount: data.postsCount,
        repliesCount: data.repliesCount
      };
      
      // Log details of what we're sending
      console.log('[XCO-Poster] DEBUG: Payload for background:', JSON.stringify({
        postsCount: payload.postsCount,
        repliesCount: payload.repliesCount,
        userPostsSample: payload.userPosts.slice(0, 1).map(p => p.substring(0, 20)),
        userRepliesSample: payload.userReplies.slice(0, 1).map(r => r.substring(0, 20))
      }));
    } else {
      // Legacy format (backward compatibility) - assuming array of posts
      console.log('[XCO-Poster] DEBUG: Processing legacy format data (array of posts)');
      payload = { userPosts: Array.isArray(data) ? data : [] };
    }
  } else if (dataType === 'interests') {
    actionType = 'SAVE_USER_LIKES';
    payload = { likedTweets: data };
  } else {
    console.error('[XCO-Poster] Unknown data type for sending to background:', dataType);
    return;
  }

  console.log(`[XCO-Poster] DEBUG: Sending message to background with type=${actionType}`);
  
  try {
    chrome.runtime.sendMessage({ type: actionType, data: payload }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(`[XCO-Poster] Error sending ${dataType} data to background:`, chrome.runtime.lastError.message);
      } else if (response && response.success) {
        console.log(`[XCO-Poster] ${dataType} data successfully sent to background and processed:`, response);
      } else {
        console.error(`[XCO-Poster] Background script failed to process ${dataType} data:`, response ? response.error : 'No response');
      }
    });
  } catch (error) {
    console.error(`[XCO-Poster] Error calling sendMessage for ${dataType} data:`, error);
    // If context is invalidated, we cannot do much here as the content script will need to be reloaded
  }
}

// Find the first tweet in the current timeline
function findFirstTweetInTimeline() {
  console.log('[XCO-Poster] Looking for first tweet in timeline');
  
  // Try different selectors to find timeline tweets
  const timeline = document.querySelector('[aria-label="Timeline: Your Home Timeline"]') || 
                  document.querySelector('[aria-label="Timeline"]') ||
                  document.querySelector('[data-testid="primaryColumn"]');
  
  if (!timeline) {
    console.log('[XCO-Poster] No timeline found');
    return null;
  }
  
  // Get all tweet articles in the timeline
  const tweetArticles = timeline.querySelectorAll('article[data-testid="tweet"]');
  console.log(`[XCO-Poster] Found ${tweetArticles.length} tweets in timeline`);
  
  // Return the first one if exists
  if (tweetArticles.length > 0) {
    return tweetArticles[0];
  }
  
  return null;
}

console.log('[XCO-Poster ContentScript] Enhanced for side panel interaction. Ready to receive commands.');
