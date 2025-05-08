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

// Helper function to get API key from storage
async function getApiKey() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['apiKey'], (result) => {
      if (result.apiKey) {
        resolve(result.apiKey);
      } else {
        reject('API key not found');
      }
    });
  });
}

// Handle messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    // console.log('[Background] Message received inside async IIFE:', message); // For debugging

    // Handlers that don't need an API key or have special handling first
    if (message.type === 'SAVE_SETTINGS') {
      console.log('[Background] Saving settings:', message.payload); // Assuming payload is message.settings from previous context
      try {
        await chrome.storage.sync.set(message.payload); // Ensure message.payload has the correct structure
        Object.assign(userSettings, message.payload); // Update in-memory cache
        sendResponse({ success: true });
      } catch (error) {
        console.error('[Background] Error saving settings:', error);
        sendResponse({ success: false, error: error.message });
      }
      return; // Early return for this handler
    }
    if (message.type === 'TOGGLE_SIDEPANEL') {
        chrome.sidePanel.open();
        sendResponse({ success: true });
        return; // Does not need API key
    }
    if (message.type === 'SAVE_API_KEY') { // This was present in one of the diffs
      userSettings.apiKey = message.apiKey;
      await chrome.storage.sync.set({ apiKey: message.apiKey });
      sendResponse({ success: true }); // Simplified, add error handling if needed
      return;
    }
    if (message.type === 'COLLECT_USER_DATA_FOR_TRAINING') {
        console.log(`[Background] Forwarding ${message.payload.dataType} data to side panel:`, message.payload.data);
        chrome.runtime.sendMessage({
            type: 'USER_DATA_COLLECTED',
            payload: message.payload
        }).catch(err => console.warn("[Background] Error sending USER_DATA_COLLECTED to side panel:", err.message));
        sendResponse({ success: true, message: 'Data forwarded to side panel.' });
        return;
    }
    // Add SAVE_USER_POSTS, SAVE_USER_LIKES if they are simple storage operations not needing the general apiKey
    if (message.type === 'SAVE_USER_POSTS') {
        userWritingSamples = message.data.userPosts || []; 
        await chrome.storage.local.set({ userWritingSamples: userWritingSamples });
        sendResponse({ success: true });
        return;
    }
    if (message.type === 'SAVE_USER_LIKES') {
        userLikedTopicsRaw = message.data.likedTweets || []; 
        await chrome.storage.local.set({ userLikedTopicsRaw: userLikedTopicsRaw });
        sendResponse({ success: true });
        return;
    }

    // Most other handlers will need an API key
    const apiKey = await getApiKey();
    if (!apiKey) {
      if (message.type !== 'GET_SETTINGS' && message.type !== 'IS_API_KEY_SET' && message.type !== 'FETCH_TRENDING') { // Add any other types that don't need an API key
        sendResponse({ error: 'OpenAI API key is not set. Please set it in the extension settings.' });
        return;
      }
    }

    // Handlers that require API key (or are fine if it's null for their specific logic, like IS_API_KEY_SET)
    if (message.type === 'GET_SETTINGS') {
      const settings = await loadDataFromStorage(['apiKey', 'profileBio', 'selectedTone', 'hashtags']); // loadDataFromStorage is async
      sendResponse(settings);
    } else if (message.type === 'IS_API_KEY_SET') {
        sendResponse({ isSet: !!apiKey });
    } else if (message.type === 'GET_TWEET_TEXT') {
      if (!message.payload || !message.payload.prompt) {
        sendResponse({ error: 'No prompt provided for GET_TWEET_TEXT.' });
        return;
      }
      try {
        const { prompt, tone, instruction, context } = message.payload;
        const systemMessage = "You are an AI assistant. Generate a tweet based on the provided prompt, context, and instructions. IMPORTANT: Do not use hyphens (-) or double hyphens (--) in your output.";
        const tweetText = await callOpenAI(apiKey, prompt, tone, instruction, userSettings.profileBio, userSettings.userPosts, userSettings.likedTweets, systemMessage, context);
        sendResponse({ tweetText });
      } catch (error) {
        console.error('[Background] Error generating tweet text:', error);
        sendResponse({ error: `Error generating tweet: ${error.message}` });
      }
    } else if (message.type === 'PROCESS_VOICE_TRANSCRIPT') { // Old flow, to be deprecated
      console.log('[Background] Received PROCESS_VOICE_TRANSCRIPT (old flow)');
      const { transcript, tone } = message.payload;
      try {
        const polishedText = await callOpenAI(apiKey, transcript, tone, null, userSettings.profileBio, userSettings.userPosts, userSettings.likedTweets, 'You are a helpful AI assistant. You will be given a raw voice transcript and should polish it into a coherent tweet or reply. IMPORTANT: Do not use hyphens (-) or double hyphens (--) in your output.');
        sendResponse({ type: 'POLISHED_TEXT_READY', payload: { polishedText } });
      } catch (error) {
        sendResponse({ type: 'POLISHING_ERROR', payload: { error: error.message } });
      }
    } else if (message.type === 'TRANSCRIBE_AUDIO') {
      console.log('[Background] Received TRANSCRIBE_AUDIO request');
      if (!message.audioDataUrl) {
        sendResponse({ error: 'No audio data URL provided for transcription.' });
        return;
      }
      try {
        const audioBlob = dataURLtoBlob(message.audioDataUrl);
        if (!audioBlob) {
          sendResponse({ error: 'Failed to convert audio data URL to Blob.' });
          return;
        }
        const transcriptData = await transcribeAudioWithOpenAI(audioBlob, apiKey);
        sendResponse(transcriptData);
      } catch (error) {
        console.error('[Background] Error in TRANSCRIBE_AUDIO handler:', error);
        sendResponse({ error: `Internal error during transcription: ${error.message}` });
      }
    } else if (message.type === 'POLISH_RAW_TRANSCRIPT') {
      console.log('[Background] Received POLISH_RAW_TRANSCRIPT request', message.payload);
      if (!message.payload || !message.payload.rawTranscript) {
        sendResponse({ error: 'No raw transcript provided for polishing.' });
        return;
      }
      const { rawTranscript, tone } = message.payload;
      const systemMessage = "You are an AI assistant. Polish the following voice transcript into a coherent and natural-sounding text, suitable for a social media post or reply. Ensure the user's original meaning and tone are preserved. IMPORTANT: Do not use hyphens (-) or double hyphens (--) in your output.";
      try {
        // Ensure callOpenAI signature matches: (apiKey, prompt, tone, customInstruction, userBio, userPosts, userLikes, systemMessageOverride, context)
        const polishedText = await callOpenAI(apiKey, rawTranscript, tone, null, userSettings.profileBio, userSettings.userPosts, userSettings.likedTweets, systemMessage);
        sendResponse({ polishedText: polishedText });
      } catch (error) {
        console.error('[Background] Error polishing transcript:', error);
        sendResponse({ error: `Error polishing transcript: ${error.message}` });
      }
    } else if (message.type === 'GENERATE_REPLY') {
        const { tweetData, tone, userInstruction } = message; // Assuming userInstruction comes from message
        // ... (prompt construction as in the diff) ...
        let prompt = `A user wants help drafting a concise, engaging Twitter reply (≤40 words). Their general writing style is described as: "${userSettings.profileBio || 'a generally helpful and friendly tech enthusiast'}".\nThe reply should be ${getTonePrompt(tone)}.\nOriginal tweet to reply to by @${tweetData.tweetAuthorHandle}: "${tweetData.tweetText}"\n`;
        // Add userWritingSamples and userInstruction to prompt if they exist...
        console.log('[Background] FINAL PROMPT for generateReply:', prompt);
        const reply = await callOpenAI(apiKey, prompt, tone, userInstruction, userSettings.profileBio, userSettings.userPosts, userSettings.likedTweets /*, systemMessage if needed for this call*/ );
        sendResponse({ reply });
    } else if (message.type === 'GENERATE_AI_REPLY') {
        const { data, tone, userInstruction } = message; // Assuming data and userInstruction
        // ... (prompt construction as in the diff) ...
        let prompt = `A user wants help drafting a concise, engaging Twitter reply (≤40 words). Their general writing style is described as: "${userSettings.profileBio || 'a generally helpful and friendly tech enthusiast'}".\nThe reply should be ${getTonePrompt(tone)}.\nOriginal tweet to reply to by @${data.tweetAuthorHandle}: "${data.tweetText}"\n`;
        // Add userWritingSamples and userInstruction to prompt if they exist...
        console.log('[Background] FINAL PROMPT for GENERATE_AI_REPLY:', prompt);
        const reply = await callOpenAI(apiKey, prompt, tone, userInstruction, userSettings.profileBio, userSettings.userPosts, userSettings.likedTweets /*, systemMessage if needed for this call*/ );
        sendResponse({ type: 'AI_REPLY_GENERATED', reply });
    } else if (message.type === 'GENERATE_TWEET_IDEAS') {
        const { trending, tone, userInstruction } = message;
        // ... (prompt construction as in the diff, using topicsForIdeas) ...
        let topicsForIdeas = 'current technology, AI advancements, and software development trends';
        if (userLikedTopicsRaw && userLikedTopicsRaw.length > 0) { topicsForIdeas = userLikedTopicsRaw.slice(0, 5).join('... '); }
        else if (trending && trending.length > 0) { topicsForIdeas = trending.join(', '); }
        let prompt = `A user wants 3 original tweet ideas (≤280 characters each). Their general writing style is described as: "${userSettings.profileBio || 'a generally insightful and engaging tech commentator'}".\nThe tweet ideas should be ${getTonePrompt(tone)}.\nThe ideas should revolve around these topics/themes: ${topicsForIdeas}.\n`;
        // Add userWritingSamples to prompt if they exist...
        console.log('[Background] FINAL PROMPT for generateTweetIdeas:', prompt);
        const ideas = await callOpenAI(apiKey, prompt, tone, userInstruction, userSettings.profileBio, userSettings.userPosts, userSettings.likedTweets /*, systemMessage if needed */);
        sendResponse({ ideas: ideas.split('\n\n').filter(idea => idea.trim().length > 0) });
    } else if (message.type === 'FETCH_TRENDING') {
        fetchTrendingTopics()
            .then(trending => sendResponse({ trending }))
            .catch(error => sendResponse({ error: error.message }));
        // This handler is async due to fetchTrendingTopics, but its own logic doesn't await the API key.
        // The return true below will keep the channel open for fetchTrendingTopics's promise.
    } else {
      console.warn('[Background] Unhandled message type in IIFE:', message.type);
      // sendResponse({ error: 'Unknown message type handled in IIFE' }); // Optional: send error for unhandled types
    }
  })(); // END OF ASYNC IIFE

  return true; // Crucial for all async sendResponse calls
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

async function handleProcessVoiceTranscript(payload, sendResponse) {
  const { transcript, tone } = payload;
  if (!transcript) {
    sendResponse({ type: 'POLISHING_ERROR', payload: { error: 'Transcript is empty.' } });
    return;
  }

  try {
    const apiKey = await getApiKey(); // Correctly fetch API key
    if (!apiKey) {
      sendResponse({ type: 'POLISHING_ERROR', payload: { error: 'API key not found. Please set it in the extension settings.' } });
      return;
    }

    let userContext = "";
    if (userSettings.profileBio) {
      userContext += `My bio: "${userSettings.profileBio}".\n`;
    }
    if (userSettings.hashtags && userSettings.hashtags.length > 0) {
      userContext += `I often use hashtags like: ${userSettings.hashtags.join(', ')}.\n`;
    }

    const prompt = `Given the following voice transcript, please refine it into a polished tweet or reply. 
User's preferred tone: "${tone || userSettings.tone || 'neutral'}".
${userContext}
Ensure the output is concise, engaging, and ready for posting on X.com. Avoid conversational fillers and make it sound natural for a written post.

Voice Transcript: "${transcript}"

Polished Text:`;

    console.log("[bg.js] Prompt for polishing voice transcript:", prompt);

    const aiResponse = await callOpenAI(prompt, apiKey, [], 0.7); // Assuming callOpenAI handles an array for previous messages
    
    if (aiResponse && aiResponse.choices && aiResponse.choices.length > 0) {
      const polishedText = aiResponse.choices[0].message.content.trim();
      console.log("[bg.js] Polished text from AI:", polishedText);
      sendResponse({ type: 'POLISHED_TEXT_READY', payload: { polishedText } });
    } else {
      console.error("[bg.js] Unexpected response structure from OpenAI API:", aiResponse);
      sendResponse({ type: 'POLISHING_ERROR', payload: { error: 'Unexpected response from AI.' } });
    }
  } catch (error) {
    console.error("[bg.js] Error during voice transcript processing:", error);
    sendResponse({ type: 'POLISHING_ERROR', payload: { error: error.message || 'Failed to process voice transcript.' } });
  }
}

const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';

async function transcribeAudioWithOpenAI(audioBlob, apiKey) {
  if (!apiKey) {
    return { error: 'OpenAI API key is not set. Please set it in the extension settings.' };
  }

  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm'); // Filename is required by the API
  formData.append('model', 'gpt-4o-transcribe'); // Or 'whisper-1'
  // formData.append('response_format', 'json'); // Default is json, can also be 'text'

  try {
    const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        // 'Content-Type': 'multipart/form-data' is automatically set by browser for FormData
      },
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[XCO-Poster BG] OpenAI Transcription API error:', data);
      const errorMessage = data.error && data.error.message ? data.error.message : `HTTP error ${response.status}`;
      return { error: `OpenAI API Error: ${errorMessage}` };
    }

    console.log('[XCO-Poster BG] Transcription successful:', data);
    return { transcript: data.text }; // Assuming 'text' field contains the transcript

  } catch (error) {
    console.error('[XCO-Poster BG] Error calling OpenAI Transcription API:', error);
    return { error: `Network or other error: ${error.message}` };
  }
}

// Helper function to convert Data URL to Blob
function dataURLtoBlob(dataurl) {
  if (!dataurl) return null;
  let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
  while(n--){
      u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], {type:mime});
}

// Listen for side panel open to show extension
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });