import {
  subscribe,
  getState,
  sendMessage,
  changeTone,
  toggleSettings,
  useText,
  switchTab,
  prepareForNewAiReply,
  setCurrentInputText,
  setRecordingState,
  setLoadingState,
  setInputPlaceholder,
  setGeneratedPosts,
  setIsGeneratingPosts,
  setError,
  setMessage,
  updateState,
  addMessage, // Import addMessage to display AI responses
} from "../state.js";
import { renderHeader } from "./Header.js";
import { renderTabs } from "./Tabs.js";
import { renderReplyTab } from "./ReplyTab.js";
// Removed ComposeTab import
import { renderSettingsPanel } from "./Settings.js";
// Schedule panel import removed as it's not currently needed
import { renderInputArea } from "./InputArea.js";
import { renderLoadingIndicator } from "./LoadingIndicator.js";
import { renderErrorMessage } from "./ErrorMessage.js"; // Corrected path

let root = null;
let mediaRecorder = null;
let audioChunks = [];

/**
 * Render the main application
 */
export function renderApp() {
  root = document.getElementById("root");
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
  console.log(
    "[App.js render()] Called. Current state.settings.apiKey from getState():",
    state.settings ? state.settings.apiKey : "state.settings is undefined/null"
  );

  root.innerHTML = "";

  // Header
  const header = renderHeader({
    onSettingsClick: toggleSettings,
  });
  root.appendChild(header);

  // Tabs - simplified to just show Reply tab
  const tabs = renderTabs({
    activeTab: "reply", // Always reply tab now
    onTabChange: null, // No tab changes anymore
  });
  root.appendChild(tabs);

  // Content section
  let content;

  // Error messages take priority
  if (state.error) {
    content = renderErrorMessage(state.error);
  }
  // Then general info messages (if any), but only if not also in a loading state that would be shown elsewhere
  else if (state.message && !state.loading) { 
    const messageElement = renderErrorMessage(state.message);
    // Customize styling for non-error messages
    messageElement.style.backgroundColor = "rgba(29, 161, 242, 0.1)";
    messageElement.style.borderColor = "var(--primary-color)";
    content = messageElement;
  }
  // Always render ReplyTab otherwise, passing loading state to it
  else {
    content = renderReplyTab({
      tweet: state.currentTweet,
      messages: state.messages,
      isLoading: state.loading, // Pass loading state down
      onUseReply: (text) => useText(text),
      onRegenerateReply: (tweet) => handleRegenerateReply(tweet),
      tweetContextCache: state.tweetContextCache,
      fetchingQuestionsForTweetId: state.fetchingQuestionsForTweetId,
    });
  }
  root.appendChild(content);

  // Input area
  const inputArea = renderInputArea({
    currentInput: state.currentInput,
    selectedTone: state.selectedTone,
    inputPlaceholder: state.inputPlaceholder, // This will now be updated by onTabChange
    onInputChange: (text) => {
      // Only update the input text in state; do not trigger any AI actions here.
      setCurrentInputText(text);
    },
    onSendClick: handleInputSend, // New prop
    onToneChange: changeTone,
    onMicClick: handleMicClick,
    isRecording: state.isRecording,
    activeTab: state.activeTab, // Pass current active tab to control input field behavior
    tweet: state.currentTweet, // Always pass the tweet context
  });
  root.appendChild(inputArea);

  // Settings panel (if open)
  if (state.settingsOpen) {
    const settingsPanel = renderSettingsPanel({
      settings: state.settings,
      onClose: toggleSettings,
      error: state.settingsError,
      message: state.settingsMessage,
      loading: state.settingsLoading,
    });
    root.appendChild(settingsPanel);
  }
}

// Handler for the main input area's send action
function handleInputSend(text, mode) {
  const state = getState();
  const tweet = state.currentTweet;

  console.log("[App.js] Current tweet:", tweet);
  console.log("[App.js] Polish mode with text:", text);

  // Add the user's draft message to the chat
  addMessage("user", text);

  setCurrentInputText(""); // Clear input
  setLoadingState(true);

  // Always use Polish Reply mode
  chrome.runtime.sendMessage(
    {
      type: "POLISH_REPLY",
      contextTweet: tweet,
      userDraft: text,
    },
    (response) => {
      setLoadingState(false);

      // Handle chrome runtime errors
      if (chrome.runtime.lastError) {
        console.error("[App.js] Error sending POLISH_REPLY:", chrome.runtime.lastError);
        setError("Error sending POLISH_REPLY: " + chrome.runtime.lastError.message);
        return;
      }

      console.log("[App.js] POLISH_REPLY full response:", response);

      // Handle the response - try multiple potential response formats
      if (response && response.reply) {
        // Standard response format
        addMessage("ai", response.reply, response.allReplies || null);
        console.log("[App.js] Added AI reply to chat:", response.reply);
      } else if (response && response.error) {
        setError(response.error);
      } else {
        // Handle other response formats
        console.log("[App.js] Response received but no reply property");
        if (response) {
          // Try to extract any usable text from the response
          const replyText =
            response.text || response.content || JSON.stringify(response);
          addMessage("ai", replyText);
          console.log("[App.js] Added fallback AI reply to chat:", replyText);
        }
      }
    }
  );
}

// Helper function to render brainstorming questions
function renderBrainstormQuestions(questions) {
  if (!questions || !questions.length) return;

  // Create a brainstorming section
  const brainstormSection = document.createElement("div");
  brainstormSection.className = "brainstorm-section";
  brainstormSection.style.margin = "12px 0";
  brainstormSection.style.padding = "12px";
  brainstormSection.style.backgroundColor = "rgba(29, 161, 242, 0.1)";
  brainstormSection.style.borderRadius = "8px";

  // Add heading
  const heading = document.createElement("h3");
  heading.textContent = "Brainstorm Your Own Reply";
  heading.style.margin = "0 0 8px 0";
  heading.style.fontSize = "14px";
  heading.style.fontWeight = "bold";
  heading.style.color = "#1DA1F2";
  brainstormSection.appendChild(heading);

  // Add questions
  const questionsList = document.createElement("ul");
  questionsList.style.margin = "8px 0 0 0";
  questionsList.style.paddingLeft = "20px";

  questions.forEach((question) => {
    const item = document.createElement("li");
    item.textContent = question;
    item.style.margin = "4px 0";
    item.style.fontSize = "13px";
    questionsList.appendChild(item);
  });

  brainstormSection.appendChild(questionsList);

  // Add to chat area
  const chatArea = document.querySelector(".chat-area") || document.querySelector("main");
  if (chatArea) {
    chatArea.appendChild(brainstormSection);
    console.log("[App.js] Added brainstorming questions:", questions);
  }
}

// Handler for regenerating a reply
function handleRegenerateReply(tweet) {
  if (!tweet) {
    setError("No tweet selected to reply to.");
    return;
  }

  setLoadingState(true);
  setError(null);

  // Clear previous AI messages
  prepareForNewAiReply();

  chrome.runtime.sendMessage(
    {
      type: "REGENERATE_REPLY",
      tweetData: tweet,
      tone: getState().selectedTone,
    },
    (response) => {
      setLoadingState(false);

      if (response && response.reply) {
        addMessage("ai", response.reply, response.allReplies || null);
      } else if (response && response.error) {
        setError(response.error);
      } else {
        setError("Failed to generate reply. Please try again.");
      }
    }
  );
}

// Handler for generating polished posts from user input
function generatePolishedPosts(userInput) {
  if (!userInput || !userInput.trim()) {
    setError("Please enter your post idea before generating polished versions.");
    return;
  }

  setLoadingState(true);
  setError(null);
  setIsGeneratingPosts(true);

  chrome.runtime.sendMessage(
    {
      type: "GENERATE_TWEET_IDEAS",
      userInstruction: userInput,
      tone: getState().selectedTone,
    },
    (response) => {
      setLoadingState(false);
      setIsGeneratingPosts(false);

      if (response && response.ideas && response.ideas.length > 0) {
        // Update the state with the generated posts
        setGeneratedPosts(response.ideas);

        // Also add the first idea to the chat for consistency
        addMessage("ai", response.ideas[0]);

        console.log("[App.js] Generated polished posts:", response.ideas);
      } else if (response && response.error) {
        setError(response.error);
      } else {
        setError("Failed to generate post ideas. Please try again.");
      }
    }
  );
}

// Handler for microphone click
function handleMicClick() {
  const state = getState();

  // If already recording, stop recording
  if (state.isRecording) {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
    setRecordingState(false);
    setInputPlaceholder("Processing audio...");
    return;
  }

  // Start new recording
  let stream;
  try {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((audioStream) => {
        stream = audioStream;
        audioChunks = [];

        // Create media recorder
        mediaRecorder = new MediaRecorder(stream);

        // Handle permission changes
        navigator.permissions.query({ name: "microphone" }).then((permissionStatus) => {
          permissionStatus.onchange = function () {
            if (this.state === "denied") {
              console.log("[App.js] Microphone permission denied");
              if (mediaRecorder && mediaRecorder.state === "recording") {
                mediaRecorder.stop();
              }
              setRecordingState(false);
              setInputPlaceholder(
                "Microphone permission denied. Please allow in browser settings."
              );

              // Ensure stream tracks are stopped
              if (stream) {
                stream.getTracks().forEach((track) => track.stop());
              }
            }
          };
        });

        // Handle data available event
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        // Handle recording stop
        mediaRecorder.onstop = () => {
          // Create audio blob from chunks
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          const reader = new FileReader();

          reader.onloadend = () => {
            const base64Audio = reader.result.split(",")[1];
            setLoadingState(true);
            setInputPlaceholder("Transcribing audio...");

            // Send to background script for transcription
            chrome.runtime.sendMessage(
              {
                type: "TRANSCRIBE_AUDIO",
                audioData: base64Audio,
              },
              (response) => {
                console.log("[App.js] TRANSCRIBE_AUDIO response:", response, chrome.runtime.lastError);
                if (chrome.runtime.lastError) {
                  console.error("[App.js] Error sending TRANSCRIBE_AUDIO:", chrome.runtime.lastError);
                  setCurrentInputText("");
                  setInputPlaceholder("Transcription failed. Try again.");
                  setLoadingState(false);
                  return;
                }

                if (response && response.transcript) {
                  console.log("[App.js] Transcript received:", response.transcript);
                  setLoadingState(true);
                  setInputPlaceholder("Polishing transcript...");

                  // Send for polishing
                  chrome.runtime.sendMessage(
                    {
                      type: "POLISH_TRANSCRIPT",
                      transcript: response.transcript,
                    },
                    (polishResponse) => {
                      setLoadingState(false);
                      if (chrome.runtime.lastError) {
                        console.error(
                          "[App.js] Error during transcript polishing:",
                          chrome.runtime.lastError
                        );
                        setCurrentInputText(response.transcript);
                        setInputPlaceholder("Polishing failed. Raw transcript shown.");
                        return;
                      }

                      if (polishResponse && polishResponse.polishedTranscript) {
                        console.log(
                          "[App.js] Polished transcript received:",
                          polishResponse.polishedTranscript
                        );
                        setCurrentInputText(polishResponse.polishedTranscript);
                        setInputPlaceholder("Polished transcript ready.");
                      } else if (polishResponse && polishResponse.error) {
                        console.error(
                          "[App.js] Polishing error from background:",
                          polishResponse.error
                        );
                        setInputPlaceholder(
                          `Polish failed: ${polishResponse.error.substring(0, 100)}`
                        );
                      } else {
                        console.warn(
                          "[App.js] No polished transcript or error in response from background during polishing."
                        );
                        setInputPlaceholder("Polishing failed. Raw transcript shown.");
                      }
                    }
                  );
                } else if (response && response.error) {
                  console.error(
                    "[App.js] Transcription error from background:",
                    response.error
                  );
                  setCurrentInputText("");
                  setInputPlaceholder(
                    `Transcription failed: ${response.error.substring(0, 100)}`
                  );
                  setLoadingState(false);
                } else {
                  console.warn(
                    "[App.js] No transcript or error in response from background during transcription."
                  );
                  setCurrentInputText("");
                  setInputPlaceholder("Transcription failed. Try again.");
                  setLoadingState(false);
                }
              }
            );
          };
          reader.readAsDataURL(audioBlob);
          if (stream) {
            stream.getTracks().forEach((track) => track.stop());
          }
        };

        mediaRecorder.start();
        setRecordingState(true);
        setInputPlaceholder("Recording... Click mic to stop.");
        setCurrentInputText("");
      })
      .catch((err) => {
        console.error("[App.js] Error accessing microphone:", err);
        setRecordingState(false);
        setCurrentInputText("");

        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          alert(
            'Microphone access was denied.\n\nIf you are using a Chrome extension, Chrome may not show a microphone prompt if the permission is set to "Ask".\n\nTo use the microphone, go to Chrome settings for this extension and set Microphone to "Allow". (chrome://settings/content/microphone)\n\nReload the extension after changing this setting.'
          );
          setInputPlaceholder(
            "Microphone access denied. Set to Allow in Chrome settings for this extension."
          );
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          alert(
            "No microphone found. Please ensure a microphone is connected, enabled in your OS, and not in use by another application."
          );
          setInputPlaceholder("No microphone found.");
        } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
          alert(
            "Microphone is already in use or cannot be accessed. Please ensure it's not being used by another application or browser tab, and try again."
          );
          setInputPlaceholder("Microphone in use or error.");
        } else {
          alert(
            `An unexpected error occurred while accessing the microphone: ${err.name}. Check the console for more details.`
          );
          setInputPlaceholder("Microphone error.");
        }
      });
  } catch (err) {
    console.error("[App.js] Error in microphone setup:", err);
    setRecordingState(false);
    setInputPlaceholder("Microphone error. Check console for details.");
  }
}
