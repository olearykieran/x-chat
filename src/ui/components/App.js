import { subscribe, getState, sendMessage, changeTone, toggleSettings, useText, switchTab, prepareForNewAiReply, setCurrentInputText, setRecordingState, setLoadingState, setInputPlaceholder } from '../state.js';
import { renderHeader } from './Header.js';
import { renderTabs } from './Tabs.js';
import { renderReplyTab } from './ReplyTab.js';
import { renderComposeTab } from './ComposeTab.js';
import { renderSettingsPanel } from './Settings.js';
import { renderInputArea } from './InputArea.js';
import { renderLoadingIndicator } from './LoadingIndicator.js';
import { renderErrorMessage } from './ErrorMessage.js';

let root = null;
let mediaRecorder = null;
let audioChunks = [];

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
    inputPlaceholder: state.inputPlaceholder,
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
async function handleMicClick() {
  const state = getState();
  if (state.isRecording) {
    // Stop recording
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop(); // This will trigger the onstop event
      setRecordingState(false);
      // UI updates like placeholder and loading are handled in onstop or after it
    }
  } else {
    // Start recording
    let stream; // Declare here for broader scope if needed by onchange or onstop

    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
      console.log('[App.js] Microphone permission status:', permissionStatus.state);

      // Handle permission changes
      permissionStatus.onchange = () => {
        console.log('[App.js] Microphone permission status changed to:', permissionStatus.state);
        if (permissionStatus.state !== 'granted' && mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop(); // Triggers onstop
          setRecordingState(false);
          setInputPlaceholder('Microphone permission revoked.');
          setCurrentInputText('');
          // The onstop handler will also attempt to stop stream tracks
          // alert('Microphone permission was revoked during recording.');
        }
      };

      if (permissionStatus.state === 'denied') {
        alert('Microphone access is permanently denied. Please go to your browser\'s site settings for this extension, change the microphone permission to "Allow" or "Ask", and then reload the extension.');
        setInputPlaceholder('Microphone access denied.');
        setRecordingState(false);
        setCurrentInputText('');
        return;
      }

      // If 'granted' or 'prompt', attempt to get the stream
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = []; // Clear previous chunks

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        setLoadingState(true); // Indicate processing starts as soon as recording stops
        setInputPlaceholder('Processing audio...');
        setCurrentInputText(''); // Clear input while processing

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        console.log('[App.js] Audio blob created:', audioBlob);

        // Convert Blob to Data URL
        const reader = new FileReader();
        reader.onloadend = () => {
          const audioDataUrl = reader.result;
          console.log('[App.js] Audio Data URL created, sending to background.');
          chrome.runtime.sendMessage(
            { type: 'TRANSCRIBE_AUDIO', audioDataUrl: audioDataUrl }, // Send Data URL
            (response) => {
              if (chrome.runtime.lastError) {
                console.error('[App.js] Error sending audio to background:', chrome.runtime.lastError.message);
                setCurrentInputText('');
                setInputPlaceholder(`Error: ${chrome.runtime.lastError.message.substring(0, 100)}`);
                setLoadingState(false);
              } else if (response && response.transcript) {
                console.log('[App.js] Raw transcript received:', response.transcript);
                setCurrentInputText(response.transcript); // Show raw transcript temporarily
                setInputPlaceholder('Polishing transcript...');
                // Send for polishing
                chrome.runtime.sendMessage(
                  { type: 'POLISH_RAW_TRANSCRIPT', rawTranscript: response.transcript },
                  (polishResponse) => {
                    setLoadingState(false);
                    if (chrome.runtime.lastError) {
                      console.error('[App.js] Error sending transcript for polishing:', chrome.runtime.lastError.message);
                      setInputPlaceholder(`Polish error: ${chrome.runtime.lastError.message.substring(0, 100)}`);
                    } else if (polishResponse && polishResponse.polishedTranscript) {
                      console.log('[App.js] Polished transcript received:', polishResponse.polishedTranscript);
                      setCurrentInputText(polishResponse.polishedTranscript);
                      setInputPlaceholder('Polished transcript ready.');
                    } else if (polishResponse && polishResponse.error) {
                      console.error('[App.js] Polishing error from background:', polishResponse.error);
                      setInputPlaceholder(`Polish failed: ${polishResponse.error.substring(0, 100)}`);
                    } else {
                      console.warn('[App.js] No polished transcript or error in response from background during polishing.');
                      setInputPlaceholder('Polishing failed. Raw transcript shown.');
                    }
                  }
                );
              } else if (response && response.error) {
                console.error('[App.js] Transcription error from background:', response.error);
                setCurrentInputText('');
                setInputPlaceholder(`Transcription failed: ${response.error.substring(0, 100)}`);
                setLoadingState(false);
              } else {
                console.warn('[App.js] No transcript or error in response from background during transcription.');
                setCurrentInputText('');
                setInputPlaceholder('Transcription failed. Try again.');
                setLoadingState(false);
              }
            }
          );
        };
        reader.readAsDataURL(audioBlob);
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setRecordingState(true);
      setInputPlaceholder('Recording... Click mic to stop.');
      setCurrentInputText('');

    } catch (err) {
      console.error('[App.js] Error accessing microphone:', err);
      setRecordingState(false);
      setCurrentInputText('');

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert(
          'Microphone access was denied.\n\nIf you are using a Chrome extension, Chrome may not show a microphone prompt if the permission is set to "Ask".\n\nTo use the microphone, go to Chrome settings for this extension and set Microphone to "Allow". (chrome://settings/content/microphone)\n\nReload the extension after changing this setting.'
        );
        setInputPlaceholder('Microphone access denied. Set to Allow in Chrome settings for this extension.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        alert('No microphone found. Please ensure a microphone is connected, enabled in your OS, and not in use by another application.');
        setInputPlaceholder('No microphone found.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        alert('Microphone is already in use or cannot be accessed. Please ensure it\'s not being used by another application or browser tab, and try again.');
        setInputPlaceholder('Microphone in use or error.');
      } else {
        alert(`An unexpected error occurred while accessing the microphone: ${err.name}. Check the console for more details.`);
        setInputPlaceholder('Microphone error.');
      }
      // Ensure stream tracks are stopped if an error occurs after stream was obtained but before recording started/completed
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    }
  }
}