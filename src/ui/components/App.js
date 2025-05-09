import { subscribe, getState, sendMessage, changeTone, toggleSettings, useText, switchTab, prepareForNewAiReply, setCurrentInputText, setRecordingState, setLoadingState, setInputPlaceholder, setGeneratedPosts, setIsGeneratingPosts, setError, setMessage, updateState } from '../state.js';
import { renderHeader } from './Header.js';
import { renderTabs } from './Tabs.js';
import { renderReplyTab } from './ReplyTab.js';
import { renderComposeTab } from './ComposeTab.js';
import { renderSettingsPanel } from './Settings.js';
import { renderSchedulePanel } from './Schedule.js'; // Import SchedulePanel
import { renderInputArea } from './InputArea.js';
import { renderLoadingIndicator } from './LoadingIndicator.js';
import { renderErrorMessage } from './ErrorMessage.js';
import { generateScheduledPosts } from '../../../lib/api.js'; // Corrected path

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
  console.log('[App.js render()] Called. Current state.settings.apiKey from getState():', state.settings ? state.settings.apiKey : 'state.settings is undefined/null');
  
  root.innerHTML = '';
  
  // Header
  const header = renderHeader({
    onSettingsClick: toggleSettings
  });
  root.appendChild(header);
  
  // Tabs
  const tabs = renderTabs({
    activeTab: state.activeTab,
    onTabChange: (tabName) => {
      switchTab(tabName);
      // Update placeholder based on tab
      if (tabName === 'schedule') {
        setInputPlaceholder('Describe your day or what you want to post about...');
      } else if (tabName === 'reply') {
        setInputPlaceholder('Crafting a reply... (or type your reply here)');
      } else if (tabName === 'compose') {
        setInputPlaceholder('Composing a new masterpiece... (or type your tweet here)');
        // Automatically generate tweets with news when switching to Compose tab
        handleGenerateTweetsWithNews();
      }
    }
  });
  root.appendChild(tabs);
  
  // Content section
  let content;
  
  // Loading indicator takes priority
  if (state.loading) {
    content = renderLoadingIndicator();
  } 
  // Then error messages
  else if (state.error) {
    content = renderErrorMessage(state.error);
  } 
  // Then message display if no error
  else if (state.message) {
    const messageElement = renderErrorMessage(state.message);
    // Customize styling for non-error messages
    messageElement.style.backgroundColor = 'rgba(29, 161, 242, 0.1)';
    messageElement.style.borderColor = 'var(--primary-color)';
    content = messageElement;
  }
  // Then tab-specific content
  else if (state.activeTab === 'reply') {
    content = renderReplyTab({
      tweet: state.currentTweet,
      messages: state.messages,
      onUseReply: (text) => useText(text), // Function to use the selected reply
      onRegenerateReply: (tweet) => handleRegenerateReply(tweet)
    });
  } else if (state.activeTab === 'compose') {
    content = renderComposeTab({
      ideas: state.tweetIdeas || [],
      trending: state.trendingTopics || [],
      newsSource: state.newsSource || '',
      guidingQuestions: state.guidingQuestions || [],
      onUseTweet: (text) => useText(text), // Function to use the selected tweet
      isLoading: !state.tweetIdeas || state.tweetIdeas.length === 0 // Show loading if we have no ideas yet
    });
  } else if (state.activeTab === 'schedule') {
    content = renderSchedulePanel({
      settings: state.settings,
      onGeneratePosts: handleGeneratePosts,
      onSchedulePosts: handleSchedulePosts,
      generatedPosts: state.generatedPosts || [],
      isGenerating: state.isGeneratingPosts
    });
  }
  
  root.appendChild(content);
  
  // Input area
  const inputArea = renderInputArea({
    currentInput: state.currentInput,
    selectedTone: state.selectedTone,
    inputPlaceholder: state.inputPlaceholder, // This will now be updated by onTabChange
    onInputChange: (text) => {
      setCurrentInputText(text); // Ensure state.currentInput is updated
    },
    onSendClick: handleInputSend, // New prop
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

// Handler for the main input area's send action
function handleInputSend(text) {
  const currentActiveTab = getState().activeTab;
  // Ensure text is passed to setCurrentInputText one last time before action
  // This is because onInputChange updates on key press, send is an action
  setCurrentInputText(text); 

  if (currentActiveTab === 'schedule') {
    handleGeneratePosts(); // handleGeneratePosts reads from state.currentInput
  } else if (currentActiveTab === 'reply') {
    // Logic for sending a reply, e.g., if you have a function like handleSendReply(text)
    // For now, assuming sendMessage might be part of it or a placeholder
    prepareForNewAiReply(); // Clears old AI replies, sets loading
    sendMessage(text); // This will trigger AI response for reply
    console.log('[App.js] Send action for Reply tab with text:', text);
  } else if (currentActiveTab === 'compose') {
    // Logic for composing/sending a tweet, e.g., handleSendTweet(text)
    // For now, assuming sendMessage might be part of it or a placeholder
    // Or, if compose is just for ideas, this might trigger idea generation based on input
    sendMessage(text); // This might trigger AI for tweet ideas based on input
    console.log('[App.js] Send action for Compose tab with text:', text);
  }
}

// Handler for generating scheduled posts
async function handleGeneratePosts() { 
  const currentGlobalState = getState(); // Get state once at the beginning
  console.log('[App.js] handleGeneratePosts called.');
  console.log('[App.js] currentGlobalState.currentInput:', currentGlobalState.currentInput);
  console.log('[App.js] Full currentGlobalState.settings from getState():', JSON.stringify(currentGlobalState.settings));
  console.log('[App.js] Checking API key from currentGlobalState.settings.apiKey:', currentGlobalState.settings ? currentGlobalState.settings.apiKey : 'currentGlobalState.settings is undefined');

  if (!currentGlobalState.settings || !currentGlobalState.settings.apiKey) {
    alert('API key is not set. Please set it in the extension settings before generating posts.');
    console.warn('[App.js] handleGeneratePosts: API key check failed. Aborting. currentGlobalState.settings was:', JSON.stringify(currentGlobalState.settings));
    return;
  }

  const summary = currentGlobalState.currentInput;

  if (!summary || summary.trim() === '') {
    alert('Please provide a summary for your day.'); 
    console.warn('[App.js] handleGeneratePosts: Summary is empty.');
    return;
  }

  updateState({ loading: true, error: null }); // Update loading state via central state manager

  setIsGeneratingPosts(true);
  setError(null); // Clear previous errors
  setMessage(null); // Clear previous messages

  try {
    const posts = await generateScheduledPosts(currentGlobalState.settings.apiKey, summary, currentGlobalState.settings);
    setGeneratedPosts(posts.map(content => ({ content }))); // Wrap in object as Schedule.js expects
  } catch (err) {
    console.error('[App.js] Error generating scheduled posts:', err);
    setError(err.message || 'Failed to generate posts.');
    setGeneratedPosts([]); // Clear any previous posts on error
  } finally {
    setIsGeneratingPosts(false);
  }
}

// Handler for scheduling posts
async function handleSchedulePosts(postsToSchedule, scheduleDetail) { // scheduleDetail can be hours_from_now or a datetime-local string
  console.log('[App.js] handleSchedulePosts called with:', { postsToSchedule, scheduleDetail });
  setError(null);
  setMessage(null);

  if (!postsToSchedule || postsToSchedule.length === 0) {
    setMessage('No post selected to schedule.');
    return;
  }

  const postToSchedule = postsToSchedule[0];

  if (!postToSchedule.content) {
    setMessage('Post content is empty.');
    return;
  }

  let whenToScheduleMs;
  const nowMs = Date.now();

  if (postToSchedule.scheduledTime === 'custom') {
    if (scheduleDetail && typeof scheduleDetail === 'string') { // scheduleDetail is the datetime-local string
        const parsedCustomTime = new Date(scheduleDetail).getTime();
        if (isNaN(parsedCustomTime) || parsedCustomTime <= nowMs) {
            setError('Invalid custom time provided or time is not in the future. Please enter a future date/time.');
            return;
        }
        whenToScheduleMs = parsedCustomTime;
        console.log(`[App.js] Custom schedule time raw string: ${scheduleDetail}, Parsed to ms: ${whenToScheduleMs}, Date: ${new Date(whenToScheduleMs)}`);
    } else {
        setError('Custom time was selected, but no time value was provided.');
        return;
    }
  } else if (scheduleDetail && !isNaN(parseFloat(scheduleDetail))) { // scheduleDetail is hours from now ('1' or '2')
    const hoursFromNow = parseFloat(scheduleDetail);
    if (hoursFromNow <= 0) {
      setMessage('Please select a valid future time interval.');
      return;
    }
    whenToScheduleMs = nowMs + (hoursFromNow * 60 * 60 * 1000);
    console.log(`[App.js] Scheduling ${hoursFromNow} hours from now: ${new Date(whenToScheduleMs)}`);
  } else {
    setError('Invalid scheduling option or detail provided.');
    return;
  }

  try {
    const { scheduledPosts = [] } = await chrome.storage.local.get('scheduledPosts');
    
    const alarmName = `scheduledPost_${Date.now()}`;

    const scheduledPostEntry = {
      alarmName,
      content: postToSchedule.content,
      scheduledTime: new Date(whenToScheduleMs).toISOString(),
      status: 'pending'
    };

    scheduledPosts.push(scheduledPostEntry);
    chrome.alarms.create(alarmName, { when: whenToScheduleMs });
    console.log(`[App.js] Alarm created: ${alarmName} for time: ${new Date(whenToScheduleMs)}`);

    await chrome.storage.local.set({ scheduledPosts });
    
    // OPTIONAL: Remove only the scheduled post from generatedPosts in UI
    // This requires posts to have a unique ID or to be identified by content/index
    // For simplicity now, we might still clear all or handle this in a more advanced way later.
    // For now, let's assume the user wants to clear the list after scheduling one, or we handle UI update separately.
    // updateState({ generatedPosts: getState().generatedPosts.filter(p => p.content !== postToSchedule.content) }); // Example
    setMessage(`Post scheduled successfully for ${new Date(whenToScheduleMs).toLocaleString()}!`);
    // Consider if we should clear all generatedPosts or just the one scheduled.
    // If just one, App.js needs to manage generatedPosts state more granularly.
    // For now, let's leave generatedPosts as is, allowing user to schedule others.

  } catch (err) {
    console.error('[App.js] Error scheduling post:', err);
    setError(`Failed to schedule post: ${err.message}`);
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
  // Ensure we use the same message type as in our bg.js implementation
  chrome.runtime.sendMessage(
    {
      type: 'GENERATE_REPLY', // Using the same message type as expected by bg.js
      tweetData: tweet, // Pass the entire tweet object as expected by bg.js
      tone: getState().selectedTone // Pass the selected tone
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

// Handler for generating tweets with news and user interests
function handleGenerateTweetsWithNews() {
  console.log('[App.js] Generating tweets with news and interests');
  const state = getState();
  
  // Clear trending topics and set loading state
  updateState({
    tweetIdeas: [],          // Clear existing tweet ideas
    trendingTopics: [],      // Clear trending topics completely
    newsSource: '',          // Clear news source 
    guidingQuestions: [],    // Clear guiding questions
    loading: true            // Show loading indicator
  });
  
  setError(null);
  
  // Send message to background script to generate tweets with news
  chrome.runtime.sendMessage(
    { 
      type: 'GENERATE_TWEETS',
      tone: state.selectedTone 
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('[App.js] Error generating tweets:', chrome.runtime.lastError);
        setError(`Error generating tweets: ${chrome.runtime.lastError.message}`);
        setLoadingState(false);
        return;
      }
      
      if (response && response.error) {
        console.error('[App.js] Error from GENERATE_TWEETS handler:', response.error);
        setError(response.error);
        setLoadingState(false);
        return;
      }
      
      // Only include trending topics if they actually exist and have a valid source
      const trendingTopics = (response.trending && response.trending.length > 0 && response.newsSource) 
        ? response.trending 
        : [];
      
      // Update state with generated tweets and context
      updateState({
        tweetIdeas: response.ideas || [],
        trendingTopics: trendingTopics,
        newsSource: response.newsSource || '',
        guidingQuestions: response.guidingQuestions || [],
        loading: false
      });
      
      console.log('[App.js] Generated tweets with news:', response);
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