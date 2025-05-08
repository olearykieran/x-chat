import { subscribe, getState, sendMessage, changeTone, toggleSettings, useText, switchTab, prepareForNewAiReply, setCurrentInputText, setRecordingState } from '../state.js';
import { renderHeader } from './Header.js';
import { renderTabs } from './Tabs.js';
import { renderReplyTab } from './ReplyTab.js';
import { renderComposeTab } from './ComposeTab.js';
import { renderSettingsPanel } from './Settings.js';
import { renderInputArea } from './InputArea.js';
import { renderLoadingIndicator } from './LoadingIndicator.js';
import { renderErrorMessage } from './ErrorMessage.js';

let root = null;
let recognition = null; // To hold the SpeechRecognition instance

/**
 * Render the main application
 */
export function renderApp() {
  root = document.getElementById('root');
  if (!root) return;
  
  // Initial render
  render();
  
  // Subscribe to state changes
  subscribe(render);
}

/**
 * Render the app based on current state
 */
function render() {
  if (!root) return;
  
  const state = getState();
  
  root.innerHTML = '';
  
  // Header
  const header = renderHeader({
    onSettingsClick: toggleSettings
  });
  root.appendChild(header);
  
  // Tabs
  const tabs = renderTabs({
    activeTab: state.activeTab,
    onTabChange: switchTab
  });
  root.appendChild(tabs);
  
  // Content container
  const content = document.createElement('div');
  content.className = 'content';
  
  // Error message
  if (state.error) {
    content.appendChild(renderErrorMessage(state.error));
  }
  
  // Loading indicator
  if (state.loading) {
    content.appendChild(renderLoadingIndicator());
  }
  
  // Tab content
  if (state.activeTab === 'reply') {
    content.appendChild(renderReplyTab({
      tweet: state.currentTweet,
      messages: state.messages,
      onUseReply: useText,
      onRegenerateReply: handleRegenerateReply
    }));
  } else {
    content.appendChild(renderComposeTab({
      ideas: state.tweetIdeas,
      trending: state.trendingTopics,
      onUseTweet: useText
    }));
  }
  
  root.appendChild(content);
  
  // Input area
  const inputArea = renderInputArea({
    currentInput: state.currentInput,
    selectedTone: state.selectedTone,
    onInputChange: (text) => sendMessage(text),
    onToneChange: changeTone,
    onMicClick: handleMicClick,
    isRecording: state.isRecording
  });
  root.appendChild(inputArea);
  
  // Settings panel (if open)
  if (state.settingsOpen) {
    const settingsPanel = renderSettingsPanel({
      settings: state.settings,
      onClose: toggleSettings,
      error: state.settingsError, 
      message: state.settingsMessage,
      loading: state.settingsLoading
    });
    root.appendChild(settingsPanel);
  }
}

// Handler for regenerating a reply
function handleRegenerateReply(tweet) {
  console.log('[App.js] handleRegenerateReply called for tweet:', tweet);
  if (!tweet || !tweet.tweetText) {
    console.error('[App.js] Cannot regenerate reply, tweet data is missing.');
    return;
  }

  prepareForNewAiReply(); // Call before sending message

  // Clear previous AI messages for this context or set a loading state for replies
  // This might involve a function in state.js, e.g., clearAiReplies() or setLoadingReplies(true)
  // For now, let's assume we'll directly message the background/content script.

  // Send a message to the background script to generate a new reply.
  // This message type 'GET_AI_REPLY' or similar needs to be handled in bg.js/contentScript.js
  // to call OpenAI and then update the state with the new reply.
  chrome.runtime.sendMessage(
    {
      type: 'GENERATE_AI_REPLY', // Or a more specific type like 'REGENERATE_AI_REPLY'
      data: {
        tweetText: tweet.tweetText,
        tweetAuthorHandle: tweet.tweetAuthorHandle, // Pass author handle for context
        // tweetId: tweet.id // If you have a unique ID for the tweet context
      }
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('[App.js] Error sending GENERATE_AI_REPLY message:', chrome.runtime.lastError.message);
        // Potentially update UI with error
        return;
      }
      if (response && response.error) {
        console.error('[App.js] Error from GENERATE_AI_REPLY handler:', response.error);
        // Potentially update UI with error
      }
      // Successful response handling (new reply) should update the state, 
      // which will trigger a re-render through the subscription.
      // So, no direct UI update here, rely on state change.
      console.log('[App.js] GENERATE_AI_REPLY message sent. Response:', response);
    }
  );
}

// Handler for microphone click
function handleMicClick() {
  console.log('[App.js] Microphone button clicked.');
  const currentRecordingState = getState().isRecording;

  if (currentRecordingState) {
    if (recognition) {
      console.log('[App.js] Stopping speech recognition.');
      recognition.stop();
      // setRecordingState(false) will be called by onend or onerror
    } else {
      // Should not happen if state is managed correctly
      console.warn('[App.js] isRecording is true, but recognition object is null. Resetting state.');
      setRecordingState(false);
    }
    return;
  }

  // If not recording, start recognition
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.error('[App.js] Speech Recognition API not supported in this browser.');
    // Optionally, update UI to inform user: alert('Speech Recognition API not supported.');
    setCurrentInputText('Error: Speech recognition not supported.'); // Inform user via input area
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = false; // False: stop after first pause in speech
  recognition.interimResults = false; // False: only get final results

  recognition.onstart = () => {
    console.log('[App.js] Speech recognition started.');
    setRecordingState(true);
    // TODO: Update UI to indicate recording (e.g., change mic button icon/color)
    // For now, we can update the placeholder text
    const textarea = document.querySelector('.input-box');
    if (textarea) textarea.placeholder = 'Listening...'; 
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    console.log('[App.js] Speech recognition result:', transcript);
    setCurrentInputText(transcript); // Update the input area with the transcript

    // Automatically attempt to send if the user stops talking?
    // For now, user has to press send. If we want auto-send:
    // sendMessage(transcript); // This would also clear the input via its own logic
  };

  recognition.onerror = (event) => {
    console.error('[App.js] Speech recognition error:', event.error);
    let errorMessage = 'Speech recognition error: ' + event.error;
    if (event.error === 'no-speech') {
        errorMessage = 'No speech detected. Please try again.';
    }
    setCurrentInputText(errorMessage); // Show error in input area
    const textarea = document.querySelector('.input-box');
    if (textarea) textarea.placeholder = 'Type your instructions...';
    setRecordingState(false);
  };

  recognition.onend = () => {
    console.log('[App.js] Speech recognition ended.');
    setRecordingState(false);
    // TODO: Reset mic button UI
    const textarea = document.querySelector('.input-box');
    if (textarea && textarea.placeholder === 'Listening...') {
        textarea.placeholder = 'Type your instructions...';
    }
    recognition = null; // Allow starting a new recognition session
  };

  try {
    recognition.start();
  } catch (e) {
    console.error("[App.js] Error starting speech recognition: ", e);
    setCurrentInputText('Error: Could not start speech recognition.');
    setRecordingState(false);
    recognition = null; // Reset recognition object
  }
}