import { DEFAULT_SETTINGS, TONE_OPTIONS } from '../../lib/constants.js';

// Application state
let currentState = {
  // UI state
  activeTab: 'reply', // 'reply' or 'compose'
  settingsOpen: false,
  loading: true, // Start with loading true for initial setup
  error: null,
  message: null, // Success message
  isRecording: false, // Added for voice input state
  
  // Chat state
  messages: [],
  currentTweet: null,
  trendingTopics: [],
  tweetIdeas: [],
  generatedPosts: [], // For the schedule tab
  isGeneratingPosts: false, // For the schedule tab
  
  // User settings
  settings: { ...DEFAULT_SETTINGS },
  
  // Current input
  currentInput: '',
  selectedTone: 'neutral',
  inputPlaceholder: 'Type your instructions, or click the tweet button to generate a reply...', // New placeholder state
  
  // NEW STATE FOR QUESTION CACHING
  tweetContextCache: {}, // { tweetId: { questions: [...] } }
  fetchingQuestionsForTweetId: null, // Stores tweetId if questions are being fetched
};

// Listeners for state changes
const listeners = [];

/**
 * Initialize application state
 */
export async function initializeState() {
  updateState({ loading: true, error: null });
  try {
    await loadDataFromStorage();

    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      let currentSettings = getState().settings || {}; // Get current settings (might have apiKey from loadDataFromStorage)
      if (response && response.settings) {
        // Merge settings from GET_SETTINGS, ensuring apiKey from loadDataFromStorage isn't overwritten by an undefined one
        const newSettingsFromBg = response.settings;
        currentSettings = { ...currentSettings, ...newSettingsFromBg };
        if (newSettingsFromBg.apiKey === undefined && getState().settings.apiKey !== undefined) {
          currentSettings.apiKey = getState().settings.apiKey; // Preserve already loaded apiKey if bg doesn't send one
        }
      }
      updateState({ settings: currentSettings, loading: false });
    });

    checkCurrentContext();
    
    // Listen for tweet focus changes from content script
    chrome.runtime.onMessage.addListener((message) => {
      console.log('[Sidepanel State] Received message:', message); // Log all messages
      if (message.type === 'TWEET_FOCUSED') {
        // Store the tweet ID to track if we've already processed this tweet
        const tweetId = message.tweetData?.tweetUrl || message.tweetData?.tweetText;
        const lastProcessedTweetId = currentState.lastProcessedTweetId;
        
        console.log('[Sidepanel State] Tweet focused:', message.tweetData, 'Last processed:', lastProcessedTweetId);
        
        // Only process if this is a different tweet than the last one we processed
        if (tweetId !== lastProcessedTweetId) {
          console.log('[Sidepanel State] Processing new tweet:', tweetId);
          
          updateState({ 
            currentTweet: message.tweetData,
            activeTab: 'reply',
            messages: [], // Clear messages when tweet changes
            loading: true, // Set loading state to true while generating suggestions
            lastProcessedTweetId: tweetId // Track this tweet as processed
          });
          
          // Automatically request reply suggestions when a tweet is focused
          chrome.runtime.sendMessage(
            { type: 'AUTO_REPLY_SUGGESTIONS', contextTweet: message.tweetData },
            (response) => {
              if (response && response.allReplies && response.allReplies.length > 0) {
                console.log('[Sidepanel State] Received auto reply suggestions:', response.allReplies);
                
                // Add the suggestions to messages with a special 'suggestion' type
                addMessage('ai', response.reply, response.allReplies, null, 'suggestion');
                updateState({ loading: false });
              } else if (response && response.error) {
                console.error('[Sidepanel State] Error getting auto suggestions:', response.error);
                updateState({ loading: false });
              } else {
                console.log('[Sidepanel State] No reply suggestions received');
                updateState({ loading: false });
              }
            }
          );
        } else {
          console.log('[Sidepanel State] Ignoring duplicate tweet focus event for:', tweetId);
        }
      }
      
      if (message.type === 'COMPOSE_MODE') {
        updateState({ 
          currentTweet: null,
          activeTab: 'compose',
          messages: [] // Clear messages when switching to compose
        });
        
        // No longer auto-generating tweet ideas - waiting for user input instead
      }

      // Handle regenerated AI reply from bg.js
      if (message.type === 'AI_REPLY_GENERATED') {
        console.log('[Sidepanel State] AI_REPLY_GENERATED received, reply:', message.reply);
        addMessage('ai', message.reply);
        updateState({ loading: false, error: null });
      }

      if (message.type === 'AI_REPLY_ERROR') {
        console.error('[Sidepanel State] AI_REPLY_ERROR received:', message.error);
        updateState({ loading: false, error: message.error });
      }

      // New handlers for specific results from bg.js
      if (message.type === 'REPLY_RESULT') {
        console.log('[Sidepanel State] REPLY_RESULT received:', message.data);
        addMessage('ai', message.data.reply, message.data.allReplies, message.data.guidingQuestions);
        updateState({ loading: false, error: null });
        if (message.data.originalMode === 'write') {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
              chrome.tabs.sendMessage(tabs[0].id, { type: 'FILL_REPLY_BOX', text: message.data.reply });
            }
          });
        }
      }

      if (message.type === 'POLISH_RESULT') {
        console.log('[Sidepanel State] POLISH_RESULT received:', message.data);
        addMessage('ai', message.data.reply, message.data.allReplies, message.data.guidingQuestions);
        updateState({ loading: false, error: null });
        // Assuming polish was for a reply context if originalMode is 'polish'
        if (message.data.originalMode === 'polish') { 
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
              chrome.tabs.sendMessage(tabs[0].id, { type: 'FILL_REPLY_BOX', text: message.data.reply });
            }
          });
        }
      }

      if (message.type === 'POST_RESULT') {
        console.log('[Sidepanel State] POST_RESULT received:', message.data);
        addMessage('ai', message.data.reply, message.data.allReplies, message.data.guidingQuestions);
        updateState({ loading: false, error: null });
        if (message.data.originalMode === 'post') {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
              chrome.tabs.sendMessage(tabs[0].id, { type: 'FILL_COMPOSE_BOX', text: message.data.reply });
            }
          });
        }
      }

      // NEW: Handle received brainstorming questions
      if (message.type === 'QUESTIONS_RECEIVED') {
        const { tweetId, questions } = message.payload;
        console.log(`[Sidepanel State] Received QUESTIONS_RECEIVED for ${tweetId}:`, questions);
        if (tweetId && questions) {
          const newCache = { ...currentState.tweetContextCache };
          // Ensure the structure matches: { tweetId: questions_array }
          newCache[tweetId] = questions; 
          updateState({ 
            tweetContextCache: newCache,
            // Reset fetching status for this tweetId, only if it was the one being fetched
            fetchingQuestionsForTweetId: currentState.fetchingQuestionsForTweetId === tweetId ? null : currentState.fetchingQuestionsForTweetId,
            loading: false // Potentially stop a global loading indicator if one was set for this
          });
        } else {
          console.warn("[Sidepanel State] QUESTIONS_RECEIVED: Invalid payload", message.payload);
        }
      }

      // NEW: Handle marking a tweetId as questions being fetched
      if (message.type === 'MARK_FETCHING_QUESTIONS') {
        if (message.payload && message.payload.tweetId) {
          updateState({ fetchingQuestionsForTweetId: message.payload.tweetId });
          console.log("[Sidepanel State] Marked fetching questions for tweetId:", message.payload.tweetId);
        } else {
          console.warn("[Sidepanel State] MARK_FETCHING_QUESTIONS: Invalid payload", message.payload);
        }
      }

      // NEW: Handle clearing the fetching questions flag for a tweetId
      if (message.type === 'CLEAR_FETCHING_QUESTIONS') {
        if (message.payload && message.payload.tweetId) {
          if (currentState.fetchingQuestionsForTweetId === message.payload.tweetId) {
            updateState({ fetchingQuestionsForTweetId: null });
            console.log("[Sidepanel State] Cleared fetching questions for tweetId:", message.payload.tweetId);
          }
        } else {
          console.warn("[Sidepanel State] CLEAR_FETCHING_QUESTIONS: Invalid payload", message.payload);
        }
      }
    });
  } catch (error) {
    console.error('Error initializing state:', error);
    updateState({ error: 'Failed to initialize. Please try again.', loading: false });
  }
}

/**
 * Check current context in the page
 */
function checkCurrentContext() {
  // Ask content script what's currently in focus
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com'))) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CURRENT_TWEET' }, (response) => {
        // Check for error to avoid unchecked runtime.lastError
        if (chrome.runtime.lastError) {
          console.log('Communication error with GET_CURRENT_TWEET (content script might not be ready yet):', chrome.runtime.lastError.message);
          updateState({
            error: null,
            loading: false
          });
          return;
        }
        
        if (response && response.tweetData) {
          console.log('[Sidepanel State] Current tweet focused:', response.tweetData);
          
          // Ensure the tweet has an author handle
          const tweetData = response.tweetData;
          if (!tweetData.tweetAuthorHandle || tweetData.tweetAuthorHandle === 'undefined') {
            console.log('[Sidepanel State] Author handle is missing, updating with fallback');
            tweetData.tweetAuthorHandle = tweetData.tweetAuthorName || 'author';
          }
          
          updateState({
            currentTweet: tweetData,
            activeTab: 'reply',
            messages: [], // Clear messages when auto-selecting a new tweet
            loading: false
          });
        } else {
          console.log('[Sidepanel State] No tweet currently focused. Defaulting to compose.');
          // We're either in compose mode or no tweet is focused
          updateState({
            currentTweet: null,
            activeTab: 'compose',
            loading: false
          });
        }
      });
    } else {
      // Not on Twitter
      console.log('[Sidepanel State] Not on Twitter.com/X.com. Defaulting to compose.');
      updateState({
        currentTweet: null,
        activeTab: 'compose',
        loading: false
      });
      fetchTrendingAndGenerateIdeas();
    }
  });
}

/**
 * This function is maintained for backward compatibility but now only clears the UI state
 * It no longer automatically fetches trending topics or generates tweets
 * The new compose functionality relies on user input instead
 */
async function fetchTrendingAndGenerateIdeas() {
  // Clear any existing tweet ideas and errors
  updateState({ 
    tweetIdeas: [],
    error: null,
    loading: false
  });
  
  console.log('[State] fetchTrendingAndGenerateIdeas called, but no automatic fetching is performed in the new post polisher');
}

/**
 * Prepares the state for a new AI-generated reply by clearing old AI messages and setting loading state.
 */
export function prepareForNewAiReply() {
  const userMessages = currentState.messages.filter(m => m.sender === 'user');
  updateState({
    messages: userMessages,
    loading: true,
    error: null
  });
}

/**
 * Generate reply for current tweet
 */
function generateReply() {
  if (!currentState.currentTweet) {
    console.error('[Sidepanel State] Cannot generate reply: No tweet selected');
    return;
  }
  
  // Set loading state
  updateState({ loading: true, error: null });
  
  // Clear existing AI messages
  const userMessages = currentState.messages.filter(m => m.sender === 'user');
  updateState({ messages: userMessages });
  
  // Send tweet to background for processing
  chrome.runtime.sendMessage({
    type: 'GENERATE_REPLY',
    tweetData: currentState.currentTweet,
    tone: currentState.selectedTone
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Sidepanel State] Error generating reply:', chrome.runtime.lastError);
      updateState({ 
        loading: false, 
        error: `Error generating reply: ${chrome.runtime.lastError.message}` 
      });
      return;
    }
    
    if (response.error) {
      updateState({ loading: false, error: response.error });
    } else {
      // Handle multiple suggestions if available
      if (response.allReplies && Array.isArray(response.allReplies) && response.allReplies.length > 0) {
        // Create an AI message with all replies and guiding questions
        const aiMessage = {
          sender: 'ai',
          text: response.allReplies[0], // Use first suggestion as the primary text
          allReplies: response.allReplies, // Store all replies for the UI to access
          guidingQuestions: response.guidingQuestions || [] // Store contextual guiding questions
        };
        console.log('[Sidepanel State] Generated AI message with guiding questions:', aiMessage);
        updateState({ 
          messages: [...userMessages, aiMessage],
          loading: false 
        });
      } else if (response.reply) {
        // Fallback to old format for backward compatibility
        addMessage('ai', response.reply);
        updateState({ loading: false });
      } else {
        updateState({ 
          loading: false, 
          error: 'Received empty response from server' 
        });
      }
    }
  });
}

/**
 * Add a message to the chat
 * @param {string} sender - Message sender ('user' or 'ai')
 * @param {string} text - Message text
 * @param {Array} [allReplies] - Optional array of all AI-generated replies
 * @param {Array} [guidingQuestions] - Optional array of guiding questions
 * @param {string} [type] - Message type (e.g., 'reply', 'suggestion', 'instruction')
 */
export function addMessage(sender, text, allReplies = null, guidingQuestions = null, type = 'reply') {
  const message = {
    id: Date.now(),
    sender,
    content: text,
    allReplies: allReplies,
    guidingQuestions: guidingQuestions,
    timestamp: new Date().toISOString(),
    type: type
  };

  updateState({
    messages: [...currentState.messages, message],
    loading: false, 
    error: null,   
    message: null, 
  });

  // Auto-scroll to the latest message
  // This might be better handled in the UI component that renders messages,
  // but can be a simple utility here if direct DOM manipulation is acceptable.
  const chatMessages = document.getElementById('chat-messages');
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

/**
 * Send user message and get AI response
 * @param {string} text - User message
 */
export function sendMessage(text) {
  if (!text.trim()) return;
  
  // Add user message
  addMessage('user', text);
  
  // Clear input
  updateState({ currentInput: '', loading: true });
  
  if (currentState.activeTab === 'reply') {
    // Get AI to refine reply
    chrome.runtime.sendMessage({
      type: 'GENERATE_REPLY',
      tweetData: {
        ...currentState.currentTweet,
        userInstruction: text
      },
      tone: currentState.selectedTone
    }, (response) => {
      updateState({ loading: false });
      
      if (response && response.reply) {
        addMessage('ai', response.reply);
      } else if (response && response.error) {
        updateState({ error: response.error });
      }
    });
  } else {
    // Generate tweet based on user instruction
    chrome.runtime.sendMessage({
      type: 'GENERATE_TWEET_IDEAS',
      trending: currentState.trendingTopics,
      userInstruction: text,
      tone: currentState.selectedTone
    }, (response) => {
      updateState({ loading: false });
      
      if (response && response.ideas && response.ideas.length > 0) {
        addMessage('ai', response.ideas[0]); // Just show the first idea in chat
        updateState({ tweetIdeas: response.ideas });
      } else if (response && response.error) {
        updateState({ error: response.error });
      }
    });
  }
}

/**
 * Use a generated reply or tweet
 * @param {string} text - Text to use
 */
export function useText(text) {
  if (!text) return;
  
  console.log('[State] useText called with:', text);
  console.log('[State] Current active tab:', currentState.activeTab);
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const messageType = currentState.activeTab === 'reply' ? 'USE_REPLY' : 'USE_TWEET';
      console.log('[State] Sending message type:', messageType);
      
      chrome.tabs.sendMessage(tabs[0].id, { 
        type: messageType,
        text
      }, (response) => {
        // Check for errors in message sending
        if (chrome.runtime.lastError) {
          console.error('[State] Error sending message to content script:', chrome.runtime.lastError);
        } else {
          console.log('[State] Response from content script:', response);
        }
      });
    } else {
      console.error('[State] No active tab found');
    }
  });
}

/**
 * Change the selected tone
 * @param {string} tone - New tone
 */
export function changeTone(tone) {
  updateState({ selectedTone: tone });
  
  // Only update tone in state. Do not auto-generate reply or ideas.
  // (User must explicitly trigger generation)

}

/**
 * Save user settings
 * @param {Object} newSettings - Updated settings
 */
export function saveSettings(newSettings) {
  console.log('[State] saveSettings called with newSettings:', JSON.parse(JSON.stringify(newSettings)));
  // The newSettings from Settings.js should NOT contain apiKey anymore.
  // It will contain profileBio, hashtags, defaultTone, useOwnKey.
  chrome.runtime.sendMessage({ 
    type: 'SAVE_SETTINGS',
    settings: newSettings
  }, () => {
    updateState({ 
      settings: newSettings, 
      settingsOpen: false 
    });
  });
}

/**
 * Save API key
 * @param {string} apiKey - OpenAI API key
 */
export function saveApiKey(apiKey) {
  console.log('[State] saveApiKey called with key:', apiKey ? "(key provided)" : "(key empty or null)");
  
  // When a user is saving an API key, we almost certainly want to set useOwnKey to true
  // We'll also send this to the background script to ensure consistency
  const useOwnKey = apiKey && apiKey.trim().length > 0 ? true : currentState.settings.useOwnKey;
  
  chrome.runtime.sendMessage({ 
    type: 'SAVE_API_KEY', 
    apiKey: apiKey,
    useOwnKey: useOwnKey // Add useOwnKey flag to the SAVE_API_KEY message 
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[State] saveApiKey: Error sending SAVE_API_KEY message:', chrome.runtime.lastError.message);
      return;
    }

    console.log('[State] saveApiKey: Response from SAVE_API_KEY in background:', response);
    if (response && response.success) {
      console.log('[State] saveApiKey: Background reported success. Attempting to update UI state.');
      // Update both the API key AND useOwnKey in the settings state
      const newSettings = { 
        ...currentState.settings, 
        apiKey: apiKey,
        useOwnKey: useOwnKey // Add this to ensure UI state reflects the correct option
      }; 
      console.log('[State] saveApiKey: Setting useOwnKey to', useOwnKey, 'because an API key was saved');
      updateState({ settings: newSettings }); 
      console.log(`[State] saveApiKey: UI state for settings.apiKey should now be: ${apiKey ? "(key provided)" : "(key empty or null)"}. Current actual currentState.settings.apiKey:`, currentState.settings.apiKey);
    } else {
      console.error('[State] saveApiKey: Background script failed to save API Key or response was not success.', response);
    }
  });
}

/**
 * Toggle settings panel
 */
export function toggleSettings() {
  updateState({ settingsOpen: !currentState.settingsOpen });
}

/**
 * Switch active tab
 * @param {string} tab - Tab to switch to
 */
export function switchTab(tab) {
  // Ensure we only switch to valid tabs now that Schedule is removed
  if (tab === 'reply' || tab === 'compose') {
    updateState({ activeTab: tab });
  } else {
    // Default to compose tab if an invalid tab is requested
    console.warn(`[State] Attempted to switch to invalid tab: ${tab}. Defaulting to compose tab.`);
    updateState({ activeTab: 'compose' });
  }
}

/**
 * Sets the current input text in the state.
 * @param {string} text - The text to set as current input.
 */
export function setCurrentInputText(text) {
  updateState({ currentInput: text });
}

/**
 * Sets the recording state for voice input.
 * @param {boolean} isRecording - True if recording, false otherwise.
 */
export function setRecordingState(isRecording) {
  updateState({ isRecording });
}

/**
 * Sets the loading state for the UI.
 * @param {boolean} isLoading - True if loading, false otherwise.
 */
export function setLoadingState(isLoading) {
  updateState({ loading: isLoading });
}

/**
 * Sets the input area's placeholder text.
 * @param {string} text - The placeholder text.
 */
export function setInputPlaceholder(text) {
  updateState({ inputPlaceholder: text });
}

/**
 * Update state and notify listeners
 * @param {Object} updates - State updates
 */
export function updateState(updates) {
  console.log('[State] Update State Called With:', updates);

  // Determine if this is just an input update
  const keys = Object.keys(updates);
  const isOnlyInputChange = keys.length === 1 && keys[0] === 'currentInput';

  // Apply updates (original logic structure)
  if (updates.settings) {
    console.log('[State] updateState: Updating settings. Current settings before update:', JSON.parse(JSON.stringify(currentState.settings)));
    currentState.settings = { ...currentState.settings, ...updates.settings };
    console.log('[State] updateState: Settings updated:', JSON.parse(JSON.stringify(currentState.settings)));
    // If settings are updated, we always notify
    console.log('[State] Notifying listeners due to settings update.');
    notifyListeners();
  } else {
    // Ensure currentState is an object before spreading
    if (typeof currentState !== 'object' || currentState === null) {
      console.error('[State] updateState: currentState is not an object. Initializing to empty object before merge.');
      currentState = {};
    }
    // Apply general updates
    currentState = { ...currentState, ...updates };
    console.log('[State] Current State After Update (non-settings):', JSON.parse(JSON.stringify(currentState)));

    // --- Conditional Notification --- 
    // Only notify listeners (and trigger re-render) if it's NOT just an input change
    if (!isOnlyInputChange) {
      console.log('[State] Notifying listeners because update was not just for currentInput.');
      notifyListeners(); 
    } else {
      console.log('[State] Skipping listener notification for currentInput update.');
    }
  }
  // Removed unconditional notifyListeners() from here
}

/**
 * Subscribe to state changes
 * @param {Function} listener - Callback function
 * @returns {Function} - Unsubscribe function
 */
export function subscribe(listener) {
  listeners.push(listener);
  
  // Return unsubscribe function
  return () => {
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  };
}

/**
 * Notify all listeners of state change
 */
function notifyListeners() {
  console.log('[State] notifyListeners called. Number of listeners:', listeners.length);
  listeners.forEach((listener, index) => {
    try {
      console.log(`[State] Notifying listener ${index + 1}...`);
      listener(currentState);
    } catch (e) {
      console.error(`[State] Error in listener ${index + 1}:`, e);
    }
  });
  console.log('[State] notifyListeners finished.');
}

/**
 * Get current state
 * @returns {Object} - Current state
 */
export function getState() {
  return currentState;
}

/**
 * Set generated posts
 * @param {Array} posts - Posts to set
 */
export function setGeneratedPosts(posts) {
  updateState({ generatedPosts: posts });
}

/**
 * Set is generating posts
 * @param {boolean} isLoading - True if generating, false otherwise
 */
export function setIsGeneratingPosts(isLoading) {
  updateState({ isGeneratingPosts: isLoading });
}

/**
 * Set error message
 * @param {string | null} errorMessage - Error message to set, or null to clear
 */
export function setError(errorMessage) {
  updateState({ error: errorMessage, message: null }); // Clear positive message when error occurs
}

/**
 * Set success/info message
 * @param {string | null} successMessage - Message to set, or null to clear
 */
export function setMessage(successMessage) {
  updateState({ message: successMessage, error: null }); // Clear error message when positive message occurs
}

/**
 * Fetch user profile data from background script (posts, replies, liked posts, etc.)
 * @returns {Promise} Promise that resolves to user profile data
 */
export function getUserProfileData() {
  return new Promise((resolve, reject) => {
    console.log('[State] Requesting user profile data from background script');
    chrome.runtime.sendMessage({ type: 'GET_USER_PROFILE_DATA' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[State] Error getting user profile data:', chrome.runtime.lastError.message);
        reject(chrome.runtime.lastError);
        return;
      }
      
      if (response.error) {
        console.error('[State] Error from background script:', response.error);
        reject(new Error(response.error));
        return;
      }
      
      // Check if we need to adapt the response to the new format (for backward compatibility)
      const adaptedResponse = {
        ...response
      };
      
      // Handle the new format with posts/replies or the old format with writingSamples
      if (response.posts !== undefined && response.writingSamples === undefined) {
        // New format - already has posts and replies separated
        console.log('[State] Received user profile data in new format:', {
          postsCount: response.posts?.length || 0,
          repliesCount: response.replies?.length || 0,
          likedPostsCount: response.likedPosts?.length || 0
        });
      } else if (response.writingSamples !== undefined && response.posts === undefined) {
        // Old format - need to adapt it
        console.log('[State] Received user profile data in old format, adapting:', {
          writingSamplesCount: response.writingSamples?.length || 0,
          likedPostsCount: response.likedPosts?.length || 0
        });
        
        // Provide both formats for backward compatibility
        adaptedResponse.posts = response.writingSamples || [];
        adaptedResponse.replies = [];
        adaptedResponse.writingSamples = response.writingSamples || [];
      }
      
      resolve(adaptedResponse);
    });
  });
}

/**
 * Function to load data from storage
 */
export async function loadDataFromStorage() {
  return new Promise((resolve, reject) => {
    // Add profileBio, hashtags, tone, useOwnKey to the keys to retrieve
    chrome.storage.sync.get(
      ['apiKey', 'settings', 'isPremium', 'profileBio', 'hashtags', 'tone', 'useOwnKey'], 
      (result) => {
        if (chrome.runtime.lastError) {
          console.error('[State.js] loadDataFromStorage: Error loading data from storage:', chrome.runtime.lastError.message);
          updateState({ error: `Error loading settings: ${chrome.runtime.lastError.message}` });
          reject(chrome.runtime.lastError);
          return;
        }
        
        console.log('[State.js] loadDataFromStorage: Data retrieved from sync:', result);
        const newStateUpdate = {};
        let updatedAppSettings = { ...(getState().settings || DEFAULT_SETTINGS) };

        if (result.apiKey !== undefined) {
          updatedAppSettings.apiKey = result.apiKey;
          console.log('[State.js] loadDataFromStorage: API Key applied to settings object:', result.apiKey);
        }

        // Directly apply top-level settings if they exist in the result
        if (result.profileBio !== undefined) {
          updatedAppSettings.profileBio = result.profileBio;
          console.log('[State.js] loadDataFromStorage: profileBio applied:', result.profileBio);
        }
        if (result.hashtags !== undefined) {
          updatedAppSettings.hashtags = result.hashtags;
          console.log('[State.js] loadDataFromStorage: hashtags applied:', result.hashtags);
        }
        if (result.tone !== undefined) { // In bg.js, it's 'tone'. In Settings.js form, it's 'defaultTone'.
          updatedAppSettings.defaultTone = result.tone; // Map 'tone' from storage to 'defaultTone' in UI state
          console.log('[State.js] loadDataFromStorage: tone (as defaultTone) applied:', result.tone);
        }
        if (result.useOwnKey !== undefined) {
          updatedAppSettings.useOwnKey = result.useOwnKey;
          console.log('[State.js] loadDataFromStorage: useOwnKey applied:', result.useOwnKey);
        }

        // If there's still a general 'settings' object from storage, merge it carefully.
        // This handles any other settings that might be stored under that nested object.
        // Properties explicitly loaded above will take precedence if they were also in result.settings.
        if (result.settings) { 
          console.log('[State.js] loadDataFromStorage: Merging legacy/general settings object:', result.settings);
          updatedAppSettings = { ...updatedAppSettings, ...result.settings }; 
        }
        newStateUpdate.settings = updatedAppSettings;

        if (result.isPremium !== undefined) {
          newStateUpdate.isPremium = result.isPremium;
        }
        
        updateState(newStateUpdate);
        resolve();
      }
    );
  });
}