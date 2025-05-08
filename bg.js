import { callOpenAI, fetchTrendingTopics } from './lib/api.js';
import { DEFAULT_SETTINGS } from './lib/constants.js';

// Initialize state
let userSettings = {
  apiKey: null,
  profileBio: '',
  hashtags: [],
  tone: 'neutral'
};

let userWritingSamples = []; // To store scraped user posts for voice training
let userLikedTopicsRaw = []; // To store scraped liked posts for topic generation

// Load settings and other stored data on startup
chrome.runtime.onStartup.addListener(loadDataFromStorage);
chrome.runtime.onInstalled.addListener(loadDataFromStorage);

function loadDataFromStorage() {
  chrome.storage.sync.get(['apiKey', 'profileBio', 'hashtags', 'tone'], (result) => {
    if (result.apiKey) userSettings.apiKey = result.apiKey;
    if (result.profileBio) userSettings.profileBio = result.profileBio;
    if (result.hashtags) userSettings.hashtags = result.hashtags;
    if (result.tone) userSettings.tone = result.tone;
    console.log('[Background] Initial settings loaded:', userSettings);
  });
  chrome.storage.local.get(['userWritingSamples', 'userLikedTopicsRaw'], (result) => {
    if (result.userWritingSamples) userWritingSamples = result.userWritingSamples;
    if (result.userLikedTopicsRaw) userLikedTopicsRaw = result.userLikedTopicsRaw;
    console.log('[Background] Initial voice/topic data loaded.');
  });
}

// Handle messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Message received:', message);

  if (message.type === 'TOGGLE_SIDEPANEL') {
    chrome.sidePanel.open();
    sendResponse({ success: true });
    return true;
  }
  if (message.type === 'GET_SETTINGS') {
    sendResponse({ settings: userSettings });
    return true;
  }
  
  if (message.type === 'SAVE_SETTINGS') {
    const newSettings = message.settings;
    let settingsToStoreInSync = {};

    // Update in-memory userSettings and prepare for chrome.storage.sync
    if (newSettings.hasOwnProperty('apiKey')) {
      userSettings.apiKey = newSettings.apiKey;
      settingsToStoreInSync.apiKey = newSettings.apiKey;
    }
    if (newSettings.hasOwnProperty('profileBio')) {
      userSettings.profileBio = newSettings.profileBio;
      settingsToStoreInSync.profileBio = newSettings.profileBio;
    }
    if (newSettings.hasOwnProperty('hashtags')) {
      userSettings.hashtags = newSettings.hashtags;
      settingsToStoreInSync.hashtags = newSettings.hashtags;
    }
    if (newSettings.hasOwnProperty('tone')) {
      userSettings.tone = newSettings.tone;
      settingsToStoreInSync.tone = newSettings.tone;
    }
    // Note: Any other properties in newSettings not explicitly handled above
    // will update the in-memory userSettings but won't be individually saved to sync storage
    // unless added to settingsToStoreInSync.
    // For safety, you might want to merge all newSettings into userSettings in memory:
    // userSettings = { ...userSettings, ...newSettings };
    // But only store recognized keys to sync to avoid cluttering it.

    if (Object.keys(settingsToStoreInSync).length > 0) {
      chrome.storage.sync.set(settingsToStoreInSync, () => {
        if (chrome.runtime.lastError) {
          console.error('[Background] Error saving settings:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('[Background] Settings saved successfully via SAVE_SETTINGS:', userSettings);
          sendResponse({ success: true });
        }
      });
    } else {
      console.warn('[Background] SAVE_SETTINGS called, but no recognized settings found to save to sync storage.');
      sendResponse({ success: true, message: 'No recognized settings to update in storage.' });
    }
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'SAVE_API_KEY') {
    userSettings.apiKey = message.apiKey;
    chrome.storage.sync.set({ apiKey: message.apiKey }, () => {
      const saveError = chrome.runtime.lastError;
      if (saveError) {
        console.error('Error saving API key:', saveError);
        sendResponse({ success: false, error: saveError.message });
      } else {
        console.log('API key saved successfully');
        sendResponse({ success: true });
      }
    });
    return true;
  }
  
  if (message.type === 'GENERATE_REPLY') {
    if (!userSettings.apiKey) {
      sendResponse({ error: 'API key not set' });
      return true;
    }
    
    generateReply(message.tweetData, message.tone)
      .then(reply => sendResponse({ reply }))
      .catch(error => sendResponse({ error: error.message }));
    
    return true; // Keep the message channel open for async response
  }
  
  if (message.type === 'GENERATE_AI_REPLY') {
    if (!userSettings.apiKey) {
      sendResponse({ type: 'AI_REPLY_ERROR', error: 'API key not set' });
      return true;
    }
    
    generateReply(message.data, userSettings.tone)
      .then(reply => sendResponse({ type: 'AI_REPLY_GENERATED', reply }))
      .catch(error => sendResponse({ type: 'AI_REPLY_ERROR', error: error.message }));
    
    return true; // Keep the message channel open for async response
  }
  
  if (message.type === 'GENERATE_TWEET_IDEAS') {
    if (!userSettings.apiKey) {
      sendResponse({ error: 'API key not set' });
      return true;
    }
    
    generateTweetIdeas(message.trending, message.tone, message.userInstruction)
      .then(ideas => sendResponse({ ideas }))
      .catch(error => sendResponse({ error: error.message }));
    
    return true; // Keep the message channel open for async response
  }
  
  if (message.type === 'FETCH_TRENDING') {
    fetchTrendingTopics()
      .then(trending => sendResponse({ trending }))
      .catch(error => sendResponse({ error: error.message }));
    
    return true; // Keep the message channel open for async response
  }

  if (message.type === 'SAVE_USER_POSTS') {
    userWritingSamples = message.data.userPosts || []; 
    chrome.storage.local.set({ userWritingSamples: userWritingSamples }, () => {
      if (chrome.runtime.lastError) {
        console.error('[Background] Error saving user posts:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('[Background] User posts saved for voice training:', userWritingSamples.length, 'samples');
        sendResponse({ success: true });
      }
    });
    return true;
  }

  if (message.type === 'SAVE_USER_LIKES') {
    console.log('[Background] LOG: SAVE_USER_LIKES handler entered. Data object received:', message.data); 
    userLikedTopicsRaw = message.data.likedTweets || []; 
    if (!message.data.likedTweets || !Array.isArray(message.data.likedTweets)) {
        console.warn('[Background] LOG: SAVE_USER_LIKES received empty, undefined, or non-array likedTweets. Content:', message.data.likedTweets);
    }
    console.log('[Background] LOG: Attempting to save userLikedTopicsRaw to local storage. Length:', userLikedTopicsRaw.length);
    chrome.storage.local.set({ userLikedTopicsRaw: userLikedTopicsRaw }, () => {
      console.log('[Background] LOG: chrome.storage.local.set callback for SAVE_USER_LIKES reached.'); 
      if (chrome.runtime.lastError) {
        console.error('[Background] Error SAVING user likes to storage:', chrome.runtime.lastError);
        try {
          sendResponse({ success: false, error: 'Failed to save likes in background: ' + chrome.runtime.lastError.message });
        } catch (e) {
          console.error('[Background] CRITICAL: Error calling sendResponse for SAVE_USER_LIKES (lastError case):', e);
        }
      } else {
        console.log('[Background] User likes successfully saved to storage for topic generation:', userLikedTopicsRaw.length, 'samples');
        try {
          sendResponse({ success: true });
          console.log('[Background] LOG: sendResponse({success: true}) CALLED for SAVE_USER_LIKES.');
        } catch (e) {
          console.error('[Background] CRITICAL: Error calling sendResponse for SAVE_USER_LIKES (success case):', e);
        }
      }
    });
    console.log('[Background] LOG: Returning true from SAVE_USER_LIKES handler.'); 
    return true;
  }

  // Fallback for unknown messages
  // console.log('[Background] Unknown message type:', message.type);
  // sendResponse({ error: 'Unknown message type' });
  return false; 
});

/**
 * Generate a reply to a tweet using OpenAI
 * @param {Object} tweetData - Data about the tweet to reply to
 * @param {string} tone - The tone to use for the reply
 * @returns {Promise<string>} - The generated reply
 */
async function generateReply(tweetData, tone = 'neutral') {
  const { tweetText, tweetAuthorHandle, userInstruction } = tweetData;
  const tonePrompt = getTonePrompt(tone);
  
  let prompt = `A user wants help drafting a concise, engaging Twitter reply (≤40 words). Their general writing style is described as: "${userSettings.profileBio || 'a generally helpful and friendly tech enthusiast'}".
  The reply should be ${tonePrompt}.
  Original tweet to reply to by @${tweetAuthorHandle}: "${tweetText}"
  `;

  if (userWritingSamples && userWritingSamples.length > 0) {
    prompt += `Here are examples of how the user typically writes. Strive to match this style, tone, and vocabulary PRECISELY:\n`;
    userWritingSamples.slice(0, 5).forEach((sample, index) => { // Use up to 5 samples
      prompt += `Example ${index + 1}: "${sample}"\n`;
    });
    prompt += `The user's reply should sound like it came directly from them, based on these examples and their profile bio.\n`;
  } else {
    prompt += `(No specific writing samples provided, rely on the profile bio for style.)\n`;
  }

  if (userInstruction) {
    prompt += `The user provided this specific instruction for the reply: "${userInstruction}". Prioritize this instruction while maintaining the overall style.
`;
  }

  prompt += `\nIMPORTANT STYLE GUIDELINES (unless contradicted by user's samples/bio):
1.  Sound authentically human. Avoid overly robotic, formal, or excessively enthusiastic tones.
2.  Keep the reply concise and to the point, suitable for X.com (formerly Twitter).
3.  AVOID using emojis unless the user's writing samples, bio, or specific instruction asks for them.
4.  AVOID using hashtags unless they are clearly present in the user's writing samples, bio, or if the user explicitly asks for them for this specific reply. (Note: User's default hashtag list is currently ${userSettings.hashtags && userSettings.hashtags.length > 0 ? userSettings.hashtags.join(', ') : 'empty'}).
5.  AVOID using double dashes ('--') for emphasis or as sentence connectors unless present in user's samples/bio.
6.  Focus on clarity and natural language.

Draft the reply now:`;
  
  console.log('[Background] FINAL PROMPT for generateReply:', prompt);
  console.log('[Background] API Key being used for generateReply:', userSettings.apiKey ? userSettings.apiKey.substring(0, 10) + '...' : 'API Key not set or empty');
  return callOpenAI(userSettings.apiKey, prompt);
}

/**
 * Generate tweet ideas based on trending topics
 * @param {Array} trending - List of trending topics (will be replaced by liked topics)
 * @param {string} tone - The tone to use for the ideas
 * @param {string} userInstruction - User's specific instruction for the tweet ideas
 * @returns {Promise<Array>} - List of tweet ideas
 */
async function generateTweetIdeas(trending, tone = 'neutral', userInstruction = null) {
  const tonePrompt = getTonePrompt(tone);
  
  // Determine topics: Use liked topics if available, otherwise fall back to generic/trending
  let topicsForIdeas = 'current technology, AI advancements, and software development trends'; // Default
  if (userLikedTopicsRaw && userLikedTopicsRaw.length > 0) {
    // Simple approach: use snippets of liked tweets as topic indicators
    // More advanced: summarize themes from userLikedTopicsRaw with another AI call (future enhancement)
    topicsForIdeas = userLikedTopicsRaw.slice(0, 5).join('... '); // Using first 5 liked snippets
    console.log('[Background] Generating ideas based on liked topics:', topicsForIdeas);
  } else if (trending && trending.length > 0) {
    topicsForIdeas = trending.join(', ');
    console.log('[Background] Generating ideas based on provided trending topics:', topicsForIdeas);
  }

  let prompt = `A user wants 3 original tweet ideas (≤280 characters each). Their general writing style is described as: "${userSettings.profileBio || 'a generally insightful and engaging tech commentator'}".
  The tweet ideas should be ${tonePrompt}.
  The ideas should revolve around these topics/themes: ${topicsForIdeas}.
`;

  if (userWritingSamples && userWritingSamples.length > 0) {
    prompt += `User's general writing style based on their recent posts (use this to guide the voice, tone, and vocabulary of the tweet ideas):\n`;
    userWritingSamples.slice(0, 3).forEach((sample, index) => { // Use up to 3 samples for ideas
      prompt += `Example ${index + 1}: "${sample}"\n`;
    });
    prompt += `---`;
  }

  prompt += `\nIMPORTANT STYLE GUIDELINES (unless contradicted by user's samples/bio or liked topics):
1.  The ideas should sound authentically human and align with the user's described style.
2.  Tweet ideas should be concise and suitable for X.com (formerly Twitter).
3.  Consider adopting a clear viewpoint or a more opinionated/assertive stance if the user's style or liked topics suggest it. Avoid overly neutral or 'balanced' takes unless that's the user's explicit style. If in doubt, lean towards a more distinct perspective.
4.  AVOID using emojis in the tweet ideas unless the user's writing samples, bio, or specific instruction asks for them.
5.  AVOID using hashtags in the tweet ideas unless they are clearly present in the user's writing samples, bio, or if the user explicitly asks for them. (Note: User's default hashtag list is currently ${userSettings.hashtags && userSettings.hashtags.length > 0 ? userSettings.hashtags.join(', ') : 'empty'}).
6.  AVOID using double dashes ('--') for emphasis or as sentence connectors unless present in user's samples/bio.
7.  Aim for a mix of content: perhaps a question, a useful tip, a bold take, or an interesting observation.

Generate 3 distinct tweet ideas now, separated by double newlines (\n\n):`;
  
  console.log('[Background] FINAL PROMPT for generateTweetIdeas:', prompt);
  console.log('[Background] API Key being used for generateTweetIdeas:', userSettings.apiKey ? userSettings.apiKey.substring(0, 10) + '...' : 'API Key not set or empty');
  const response = await callOpenAI(userSettings.apiKey, prompt);
  return response.split('\n\n').filter(idea => idea.trim().length > 0);
}

/**
 * Get tone-specific prompt addition
 * @param {string} tone - The selected tone
 * @returns {string} - Tone-specific prompt addition
 */
function getTonePrompt(tone) {
  switch (tone) {
    case 'fun':
      return 'with a light, humorous tone';
    case 'hot-take':
      return 'with a bold, provocative stance';
    case 'heartfelt':
      return 'with a sincere, empathetic approach';
    default:
      return 'with a balanced, professional tone';
  }
}

// Listen for side panel open to show extension
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });