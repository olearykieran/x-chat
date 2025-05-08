import { DEFAULT_SETTINGS, TONE_OPTIONS } from '../../lib/constants.js';

// Application state
let state = {
  // UI state
  activeTab: 'reply', // 'reply' or 'compose'
  settingsOpen: false,
  loading: false,
  error: null,
  message: null, // Success message
  isRecording: false, // Added for voice input state
  
  // Chat state
  messages: [],
  currentTweet: null,
  trendingTopics: [],
  tweetIdeas: [],
  
  // User settings
  settings: { ...DEFAULT_SETTINGS },
  
  // Current input
  currentInput: '',
  selectedTone: 'neutral'
};

// Listeners for state changes
const listeners = [];

/**
 * Initialize application state
 */
export async function initializeState() {
  try {
    // Load settings from storage
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      if (response && response.settings) {
        updateState({ settings: response.settings });
      }
    });
    
    // Check for current tweet
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
    updateState({ error: 'Failed to initialize. Please try again.' });
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
          // Even if GET_CURRENT_TWEET fails, check composer to set initial tab correctly.
          // TWEET_FOCUSED event will later update currentTweet if a tweet is focused.
          chrome.tabs.sendMessage(tabs[0].id, { type: 'CHECK_COMPOSER_EMPTY' }, (composerResponse) => {
            if (chrome.runtime.lastError) {
              console.log('Communication error with CHECK_COMPOSER_EMPTY:', chrome.runtime.lastError.message);
              // Default to compose if we can't determine state
              updateState({ activeTab: 'compose', currentTweet: null });
              fetchTrendingAndGenerateIdeas();
              return;
            }
            if (composerResponse && composerResponse.isEmpty) {
              updateState({ activeTab: 'compose', currentTweet: null });
              fetchTrendingAndGenerateIdeas();
            } else {
              // If composer is not empty or not found, but no tweet focused, perhaps default to reply with null tweet
              // or wait for TWEET_FOCUSED. For now, let's ensure activeTab is 'reply' if not clearly 'compose'.
              updateState({ activeTab: 'reply', currentTweet: null });
            }
          });
          return; // Exit GET_CURRENT_TWEET callback
        }
        
        if (response && response.tweetData) {
          updateState({ 
            currentTweet: response.tweetData,
            activeTab: 'reply'
          });
          generateReply();
        } else {
          // No tweetData from GET_CURRENT_TWEET, check composer
          chrome.tabs.sendMessage(tabs[0].id, { type: 'CHECK_COMPOSER_EMPTY' }, (composerResponse) => {
            if (chrome.runtime.lastError) {
              console.log('Communication error with CHECK_COMPOSER_EMPTY (after no tweetData):', chrome.runtime.lastError.message);
              updateState({ activeTab: 'reply', currentTweet: null }); // Default to reply, wait for TWEET_FOCUSED
              return;
            }
            if (composerResponse && composerResponse.isEmpty) {
              updateState({ activeTab: 'compose', currentTweet: null });
              fetchTrendingAndGenerateIdeas();
            } else {
              updateState({ activeTab: 'reply', currentTweet: null }); // Default to reply if composer not empty/found
            }
          });
        }
      });
    } else {
      // Not on Twitter/X.com, default to compose mode
      updateState({ activeTab: 'compose', currentTweet: null });
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
          tone: state.selectedTone
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
 * Generate reply for current tweet
 */
function generateReply() {
  if (!state.currentTweet) return;
  
  updateState({ loading: true });
  
  try {
    chrome.runtime.sendMessage({ 
      type: 'GENERATE_REPLY',
      tweetData: state.currentTweet,
      tone: state.selectedTone
    }, (response) => {
      updateState({ loading: false });
      
      if (response && response.reply) {
        addMessage('ai', response.reply);
      } else if (response && response.error) {
        updateState({ error: response.error });
      }
    });
  } catch (error) {
    console.error('Error generating reply:', error);
    updateState({ 
      loading: false,
      error: 'Failed to generate reply. Please try again.'
    });
  }
}

/**
 * Prepares the state for a new AI-generated reply by clearing old AI messages and setting loading state.
 */
export function prepareForNewAiReply() {
  updateState({
    messages: state.messages.filter(msg => msg.sender !== 'ai'), // Keep only user messages or non-AI messages
    loading: true,
    error: null
  });
}

/**
 * Add a message to the chat
 * @param {string} sender - 'user' or 'ai'
 * @param {string} text - Message text
 */
export function addMessage(sender, text) {
  const newMessage = {
    id: Date.now(),
    sender,
    text,
    timestamp: new Date().toISOString()
  };
  
  updateState({
    messages: [...state.messages, newMessage]
  });
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
  
  if (state.activeTab === 'reply') {
    // Get AI to refine reply
    chrome.runtime.sendMessage({
      type: 'GENERATE_REPLY',
      tweetData: {
        ...state.currentTweet,
        userInstruction: text
      },
      tone: state.selectedTone
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
      trending: state.trendingTopics,
      userInstruction: text,
      tone: state.selectedTone
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
      const messageType = state.activeTab === 'reply' ? 'USE_REPLY' : 'USE_TWEET';
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
  if (state.activeTab === 'reply' && state.currentTweet) {
    generateReply();
  } else if (state.activeTab === 'compose') {
    fetchTrendingAndGenerateIdeas();
  }
}

/**
 * Save user settings
 * @param {Object} newSettings - Updated settings
 */
export function saveSettings(newSettings) {
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
  updateState({ loading: true, error: null });
  
  chrome.runtime.sendMessage({ 
    type: 'SAVE_API_KEY',
    apiKey
  }, (response) => {
    updateState({ loading: false });
    
    if (response && response.success) {
      updateState({ 
        settings: { ...state.settings, apiKey },
        error: null
      });
      // Give visual feedback that API key was saved
      updateState({ message: 'API key saved successfully!' });
      // Clear success message after 3 seconds
      setTimeout(() => {
        updateState({ message: null });
      }, 3000);
      
      // If compose tab is active, re-fetch ideas with the new key
      if (getState().activeTab === 'compose') {
        fetchTrendingAndGenerateIdeas();
      }
    } else {
      console.error('Failed to save API key:', response?.error || 'Unknown error');
      updateState({ 
        error: response?.error || 'Failed to save API key. Please try again.'
      });
    }
  });
}

/**
 * Toggle settings panel
 */
export function toggleSettings() {
  updateState({ settingsOpen: !state.settingsOpen });
}

/**
 * Switch active tab
 * @param {string} tab - Tab to switch to
 */
export function switchTab(tab) {
  updateState({ activeTab: tab });
  
  if (tab === 'compose' && state.tweetIdeas.length === 0) {
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
 * Update state and notify listeners
 * @param {Object} updates - State updates
 */
export function updateState(updates) {
  state = { ...state, ...updates };
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
  listeners.forEach(listener => listener(state));
}

/**
 * Get current state
 * @returns {Object} - Current state
 */
export function getState() {
  return state;
}