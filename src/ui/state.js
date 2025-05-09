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
        console.log('[Sidepanel State] TWEET_FOCUSED received, tweetData:', message.tweetData);
        updateState({ 
          currentTweet: message.tweetData,
          activeTab: 'reply',
          messages: [] // Clear messages when tweet changes
        });
        
        // Auto-generate reply
        generateReply();
      }
      
      if (message.type === 'COMPOSE_MODE') {
        updateState({ 
          currentTweet: null,
          activeTab: 'compose',
          messages: [] // Clear messages when switching to compose
        });
        
        // Auto-generate tweet ideas
        fetchTrendingAndGenerateIdeas();
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
          
          // Auto-generate reply if we have a tweet selected
          generateReply();
        } else {
          console.log('[Sidepanel State] No tweet currently focused. Defaulting to compose.');
          // We're either in compose mode or no tweet is focused
          updateState({
            currentTweet: null,
            loading: false
          });
          fetchTrendingAndGenerateIdeas(); // Generate ideas in compose mode
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
 * Fetch trending topics and generate tweet ideas
 */
async function fetchTrendingAndGenerateIdeas() {
  updateState({ loading: true });
  
  try {
    // Fetch trending topics
    chrome.runtime.sendMessage({ type: 'FETCH_TRENDING' }, (response) => {
      if (response && response.trending) {
        updateState({ trendingTopics: response.trending });
        
        // Generate tweet ideas
        chrome.runtime.sendMessage({ 
          type: 'GENERATE_TWEET_IDEAS',
          trending: response.trending,
          tone: currentState.selectedTone
        }, (ideaResponse) => {
          updateState({ loading: false });
          
          if (ideaResponse && ideaResponse.ideas) {
            updateState({ tweetIdeas: ideaResponse.ideas });
          } else if (ideaResponse && ideaResponse.error) {
            updateState({ error: ideaResponse.error });
          }
        });
      } else {
        updateState({ 
          loading: false,
          error: response && response.error ? response.error : 'Failed to fetch trending topics'
        });
      }
    });
  } catch (error) {
    console.error('Error fetching trends and generating ideas:', error);
    updateState({ 
      loading: false,
      error: 'Failed to generate tweet ideas. Please try again.'
    });
  }
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
 * @param {string} sender - 'user' or 'ai'
 * @param {string} text - Message text
 * @param {Array} [allReplies] - Optional array of all AI-generated replies
 */
function addMessage(sender, text, allReplies = null) {
  const newMessage = {
    sender,
    text,
    id: Date.now()
  };
  
  // If this is an AI message with multiple replies, add them
  if (sender === 'ai' && allReplies && Array.isArray(allReplies)) {
    newMessage.allReplies = allReplies;
  }
  
  // Add message
  updateState({
    messages: [...currentState.messages, newMessage]
  });
  
  // Scroll to bottom (handled in UI)
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
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const messageType = currentState.activeTab === 'reply' ? 'USE_REPLY' : 'USE_TWEET';
      chrome.tabs.sendMessage(tabs[0].id, { 
        type: messageType,
        text
      });
    }
  });
}

/**
 * Change the selected tone
 * @param {string} tone - New tone
 */
export function changeTone(tone) {
  updateState({ selectedTone: tone });
  
  // Regenerate based on active tab
  if (currentState.activeTab === 'reply' && currentState.currentTweet) {
    generateReply();
  } else if (currentState.activeTab === 'compose') {
    fetchTrendingAndGenerateIdeas();
  }
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
  updateState({ activeTab: tab });
  
  if (tab === 'compose' && currentState.tweetIdeas.length === 0) {
    fetchTrendingAndGenerateIdeas();
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
  if (updates.settings) {
    console.log('[State] updateState: Updating settings. Current settings before update:', JSON.parse(JSON.stringify(currentState.settings)));
    currentState.settings = { ...currentState.settings, ...updates.settings };
    console.log('[State] updateState: Settings after update:', JSON.parse(JSON.stringify(currentState.settings)));
  } else {
    // Ensure currentState is an object before spreading
    if (typeof currentState !== 'object' || currentState === null) {
      console.error('[State] updateState: currentState is not an object. Initializing to empty object before merge.');
      currentState = {};
    }
    currentState = { ...currentState, ...updates };
  }
  console.log('[State] Current State After Update:', JSON.parse(JSON.stringify(currentState)));
  notifyListeners();
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