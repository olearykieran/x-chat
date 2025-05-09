import { callOpenAI, fetchTrendingTopics } from "./lib/api.js";

// Web search function using OpenAI's completions API with system instructions for web search
async function searchWeb(query, userLocation = null, contextSize = 'medium') {
  try {
    console.log('[Background] Performing web search for query:', query);
    
    if (!userSettings.apiKey) {
      throw new Error('API key is not set for web search');
    }
    
    // Instead of trying to use the web_search_preview tool directly,
    // we'll use a regular OpenAI call with instructions to summarize the latest information
    const systemMessage = 'You are a helpful assistant with access to the latest information. ' +
                        'Provide accurate, up-to-date information about the query, focusing on ' +
                        'developments from the last 24-48 hours when relevant.';
    
    const response = await callOpenAI(
      userSettings.apiKey, 
      query,
      'informative', // tone
      null, // user instruction
      null, // profile bio
      [], // writing samples
      [], // liked tweets
      systemMessage // custom system message
    );
    
    console.log('[Background] Web search results:', response);
    
    // Since we're using the existing callOpenAI function, the response is just text
    return {
      text: response,
      annotations: [],
      source: 'openai'
    };
  } catch (error) {
    console.error('[Background] Error in web search:', error);
    throw error;
  }
}
import { DEFAULT_SETTINGS } from "./lib/constants.js";

// Initialize state
let userSettings = {
  apiKey: null,
  profileBio: "",
  hashtags: [],
  tone: "neutral",
};

let userWritingSamples = []; // To store scraped user posts for voice training
let userLikedTopicsRaw = []; // To store scraped liked posts for topic generation

// Load settings and other stored data on startup
console.log(
  "[Background] Initializing script. Current userSettings:",
  JSON.parse(JSON.stringify(userSettings))
);
chrome.runtime.onStartup.addListener(() => {
  console.log("[Background] onStartup triggered. Calling loadDataFromStorage.");
  loadDataFromStorage();
});
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Background] onInstalled triggered. Calling loadDataFromStorage.");
  loadDataFromStorage();
});

function loadDataFromStorage() {
  console.log(
    "[Background] loadDataFromStorage called. Current userSettings BEFORE sync.get:",
    JSON.parse(JSON.stringify(userSettings))
  );
  chrome.storage.sync.get(
    ["apiKey", "profileBio", "hashtags", "tone", "settings"],
    (result) => {
      // also get 'settings' for broader view
      console.log("[Background] loadDataFromStorage - Data retrieved from sync:", result);
      if (chrome.runtime.lastError) {
        console.error(
          "[Background] Error loading data from storage:",
          chrome.runtime.lastError
        );
        return;
      }
      if (result.apiKey) {
        userSettings.apiKey = result.apiKey;
        globalThis.apiKeyInitialized = true; // Set flag indicating API key has been loaded
        console.log(
          "[Background] loadDataFromStorage: API Key loaded from storage:",
          userSettings.apiKey
        );
      } else {
        console.log(
          "[Background] loadDataFromStorage: API Key NOT found in storage result."
        );
        globalThis.apiKeyInitialized = false; // Mark explicitly that we've checked and didn't find it
      }
      if (result.profileBio) userSettings.profileBio = result.profileBio;
      if (result.hashtags) userSettings.hashtags = result.hashtags;
      if (result.tone) userSettings.tone = result.tone;
      // If there's a legacy 'settings' object, merge it carefully or prioritize individual keys
      if (result.settings && typeof result.settings === "object") {
        console.log(
          "[Background] loadDataFromStorage: Found a legacy settings object in storage:",
          result.settings
        );
        // Prioritize individual keys if they exist, otherwise take from settings object
        userSettings.profileBio =
          result.profileBio || result.settings.profileBio || DEFAULT_SETTINGS.profileBio;
        userSettings.hashtags =
          result.hashtags || result.settings.hashtags || DEFAULT_SETTINGS.hashtags;
        userSettings.tone =
          result.tone || result.settings.defaultTone || DEFAULT_SETTINGS.tone; // Note: settings uses defaultTone
        // API key is handled separately above
      }

      console.log(
        "[Background] loadDataFromStorage: userSettings AFTER sync.get and processing:",
        JSON.parse(JSON.stringify(userSettings))
      );
      console.log("[Background] Initial settings loaded:", userSettings);
      console.log("[Background] Initial voice/topic data loaded."); // Assuming this means samples/topics loaded elsewhere or default
    }
  );
}
// Call it once on script load as well, as onStartup/onInstalled might not cover all reload scenarios during development
loadDataFromStorage();

// Helper function to get API key from storage
async function getApiKey() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(["apiKey"], (result) => {
      if (result.apiKey) {
        resolve(result.apiKey);
      } else {
        reject("API key not found");
      }
    });
  });
}

// Handle messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    // console.log('[Background] Message received inside async IIFE:', message); // For debugging

    // Handlers that don't need an API key or have special handling first
    if (message.type === "SAVE_SETTINGS") {
      console.log(
        "[Background] SAVE_SETTINGS received. message.settings keys:",
        message.settings ? Object.keys(message.settings) : "null/undefined",
        "Full message.settings:",
        JSON.parse(JSON.stringify(message.settings))
      );
      try {
        if (message.settings && typeof message.settings === "object") {
          // Ensure that what we're saving to sync doesn't inadvertently include apiKey if it's not supposed to be here
          const settingsToSync = { ...message.settings };
          if ("apiKey" in settingsToSync) {
            // This case should ideally not happen if Settings.js correctly omits apiKey from newProfileSettings
            console.warn(
              "[Background] SAVE_SETTINGS: message.settings unexpectedly contained an apiKey property. Value:",
              settingsToSync.apiKey,
              "This should be handled by SAVE_API_KEY only. Not saving apiKey via SAVE_SETTINGS."
            );
            delete settingsToSync.apiKey; // Do not let SAVE_SETTINGS overwrite/save apiKey
          }
          await chrome.storage.sync.set(settingsToSync);

          // Object.assign will merge. If message.settings has no apiKey prop, userSettings.apiKey remains untouched.
          // If message.settings *did* have apiKey: '' (which it shouldn't anymore), it would overwrite.
          Object.assign(userSettings, message.settings);
          console.log(
            "[Background] SAVE_SETTINGS: userSettings after Object.assign:",
            JSON.parse(JSON.stringify(userSettings))
          );
          sendResponse({ success: true });
        } else {
          console.error(
            "[Background] SAVE_SETTINGS: message.settings was invalid or not an object.",
            message.settings
          );
          sendResponse({ success: false, error: "Invalid settings data received." });
        }
      } catch (error) {
        console.error("[Background] Error saving settings:", error);
        sendResponse({ success: false, error: error.message });
      }
      return; // Early return for this handler
    }
    if (message.type === "TOGGLE_SIDEPANEL") {
      chrome.sidePanel.open();
      sendResponse({ success: true });
      return; // Does not need API key
    }
    if (message.type === "SAVE_API_KEY") {
      // This was present in one of the diffs
      userSettings.apiKey = message.apiKey;
      await chrome.storage.sync.set({ apiKey: message.apiKey });
      console.log(
        "[Background] SAVE_API_KEY: userSettings.apiKey set to:",
        userSettings.apiKey,
        "Saved to sync."
      );
      sendResponse({ success: true }); // Simplified, add error handling if needed
      return;
    }
    if (message.type === "COLLECT_USER_DATA_FOR_TRAINING") {
      console.log(
        `[Background] Forwarding ${message.payload.dataType} data to side panel:`,
        message.payload.data
      );
      chrome.runtime
        .sendMessage({
          type: "USER_DATA_COLLECTED",
          payload: message.payload,
        })
        .catch((err) =>
          console.warn(
            "[Background] Error sending USER_DATA_COLLECTED to side panel:",
            err.message
          )
        );
      sendResponse({ success: true, message: "Data forwarded to side panel." });
      return;
    }
    // Add SAVE_USER_POSTS, SAVE_USER_LIKES if they are simple storage operations not needing the general apiKey
    if (message.type === "SAVE_USER_POSTS") {
      userWritingSamples = message.data.userPosts || [];
      await chrome.storage.local.set({ userWritingSamples: userWritingSamples });
      sendResponse({ success: true });
      return;
    }
    if (message.type === "SAVE_USER_LIKES") {
      userLikedTopicsRaw = message.data.likedTweets || [];
      await chrome.storage.local.set({ userLikedTopicsRaw: userLikedTopicsRaw });
      sendResponse({ success: true });
      return;
    }

    // Most other handlers will need an API key
    if (!userSettings.apiKey) {
      // Check if we're still initializing before showing an error
      if (globalThis.apiKeyInitialized) {
        console.error(
          "[Background] CRITICAL: API key check failed! userSettings.apiKey is:",
          userSettings.apiKey,
          "Full userSettings:",
          JSON.parse(JSON.stringify(userSettings))
        );
        sendResponse({ error: "API key not found" });
      } else {
        console.log("[Background] API key not loaded yet, attempting to load now...");
        // Try loading API key again
        try {
          const result = await new Promise(resolve => {
            chrome.storage.sync.get(["apiKey"], resolve);
          });
          if (result.apiKey) {
            userSettings.apiKey = result.apiKey;
            globalThis.apiKeyInitialized = true;
            console.log("[Background] Successfully loaded API key on demand");
          } else {
            console.warn("[Background] API key still not found in storage");
            sendResponse({ error: "API key not found" });
            return;
          }
        } catch (error) {
          console.error("[Background] Error loading API key:", error);
          sendResponse({ error: "Error loading API key" });
          return;
        }
      }
      
      if (!userSettings.apiKey) {
        // If we still don't have an API key after attempting to load it
        sendResponse({ error: "API key not found" });
        return; // Prevent further execution if no API key
      }
    }

    console.log(
      "[Background] API key check passed. userSettings.apiKey:",
      userSettings.apiKey
    ); // Log before using API key

    // Handlers that require API key (or are fine if it's null for their specific logic, like IS_API_KEY_SET)
    if (message.type === "GET_SETTINGS") {
      const settings = await loadDataFromStorage([
        "apiKey",
        "profileBio",
        "selectedTone",
        "hashtags",
      ]); // loadDataFromStorage is async
      sendResponse(settings);
    } else if (message.type === "IS_API_KEY_SET") {
      sendResponse({ isSet: !!userSettings.apiKey });
    } else if (message.type === "GENERATE_TWEETS") {
      try {
        console.log("[Background] Generating tweet ideas with news and interests");
        const { tone } = message;
        const results = await generateTweetsWithNews(tone || userSettings.tone);
        console.log("[Background] Generated tweet ideas:", results);
        sendResponse(results);
      } catch (error) {
        console.error("[Background] Error generating tweet ideas:", error);
        sendResponse({ error: `Error generating tweets: ${error.message}` });
      }
    } else if (message.type === "GET_TWEET_TEXT") {
      if (!message.payload || !message.payload.prompt) {
        sendResponse({ error: "No prompt provided for GET_TWEET_TEXT." });
        return;
      }
      try {
        console.log(
          "[Background] Generating tweet text for prompt:",
          message.payload.prompt
        );
        const tweetText = await generateTweetText(
          message.payload.prompt,
          message.payload.tone || userSettings.tone
        );
        console.log("[Background] Generated tweet text:", tweetText);
        sendResponse({ tweetText });
      } catch (error) {
        console.error("[Background] Error generating tweet text:", error);
        sendResponse({ error: `Error generating tweet: ${error.message}` });
      }
    } else if (message.type === "PROCESS_VOICE_TRANSCRIPT") {
      // Old flow, to be deprecated
      console.log("[Background] Received PROCESS_VOICE_TRANSCRIPT (old flow)");
      const { transcript, tone } = message.payload;
      try {
        const polishedText = await callOpenAI(
          userSettings.apiKey,
          transcript,
          tone,
          null,
          userSettings.profileBio,
          userSettings.userPosts,
          userSettings.likedTweets,
          "You are a helpful AI assistant. You will be given a raw voice transcript and should polish it into a coherent tweet or reply. IMPORTANT: Do not use hyphens (-) or double hyphens (--) in your output."
        );
        sendResponse({ type: "POLISHED_TEXT_READY", payload: { polishedText } });
      } catch (error) {
        sendResponse({ type: "POLISHING_ERROR", payload: { error: error.message } });
      }
    } else if (message.type === "TRANSCRIBE_AUDIO") {
      console.log("[Background] Received TRANSCRIBE_AUDIO request");
      if (!message.audioDataUrl) {
        sendResponse({ error: "No audio data URL provided for transcription." });
        return;
      }
      try {
        const audioBlob = dataURLtoBlob(message.audioDataUrl);
        if (!audioBlob) {
          sendResponse({ error: "Failed to convert audio data URL to Blob." });
          return;
        }
        const transcriptData = await transcribeAudioWithOpenAI(
          audioBlob,
          userSettings.apiKey
        );
        sendResponse(transcriptData);
      } catch (error) {
        console.error("[Background] Error in TRANSCRIBE_AUDIO handler:", error);
        sendResponse({ error: `Internal error during transcription: ${error.message}` });
      }
    } else if (message.type === "POLISH_RAW_TRANSCRIPT") {
      console.log("[Background] Received POLISH_RAW_TRANSCRIPT request", message.payload);
      if (!message.payload || !message.payload.rawTranscript) {
        sendResponse({ error: "No raw transcript provided for polishing." });
        return;
      }
      const { rawTranscript, tone } = message.payload;
      const systemMessage =
        "You are an AI assistant. Polish the following voice transcript into a coherent and natural-sounding text, suitable for a social media post or reply. Ensure the user's original meaning and tone are preserved. IMPORTANT: Do not use hyphens (-) or double hyphens (--) in your output.";
      try {
        // Ensure callOpenAI signature matches: (apiKey, prompt, tone, customInstruction, userBio, userPosts, userLikes, systemMessageOverride, context)
        const polishedText = await callOpenAI(
          userSettings.apiKey,
          rawTranscript,
          tone,
          null,
          userSettings.profileBio,
          userSettings.userPosts,
          userSettings.likedTweets,
          systemMessage
        );
        sendResponse({ polishedText: polishedText });
      } catch (error) {
        console.error("[Background] Error polishing transcript:", error);
        sendResponse({ error: `Error polishing transcript: ${error.message}` });
      }
    } else if (message.type === "GENERATE_REPLY") {
      const { tweetData, tone, userInstruction } = message;
      console.log("[Background] Generating reply for tweet:", tweetData);

      if (!tweetData || !tweetData.tweetText) {
        sendResponse({ error: "Invalid tweet data. Cannot generate reply." });
        return;
      }

      // Get user's writing samples for personalization
      let writingSamples = [];
      try {
        const result = await chrome.storage.local.get(["userWritingSamples"]);
        if (result.userWritingSamples && Array.isArray(result.userWritingSamples)) {
          writingSamples = result.userWritingSamples.slice(0, 5); // Take up to 5 samples
        }
      } catch (error) {
        console.error("[Background] Error retrieving user writing samples:", error);
        // Continue without samples
      }

      // Construct prompt with enhanced instructions and questions generation
      const postSeparator = "###POST_SEPARATOR###";
      const questionSeparator = "###QUESTIONS_SEPARATOR###";
      const prompt = `
        Generate 5 distinct reply suggestions and 3 contextual guiding questions for the following tweet by ${
          tweetData.tweetAuthorHandle || "the author"
        }:

        "${tweetData.tweetText}"

        ${
          userSettings.profileBio
            ? `IMPORTANT - Match this bio/style: ${userSettings.profileBio}`
            : ""
        }
        
        ${
          writingSamples.length > 0
            ? `IMPORTANT - Match the style, tone, and vocabulary of these writing samples:
          ${writingSamples.map((sample, i) => `Sample ${i + 1}: "${sample}"`).join("\n")}`
            : ""
        }
        
        STRICT REQUIREMENTS FOR REPLIES:
        1. Create 5 COMPLETELY DIFFERENT replies that match the user's writing style
        2. Each reply must have a distinct angle or approach
        3. DO NOT use ANY hyphens (- or --) in ANY of the replies - this is very important
        4. Each reply should be 1-3 sentences, concise and engaging
        5. Match the user's vocabulary level, sentence structure, and conversational style
        6. Format each reply separated by "${postSeparator}"
        7. Tone should be: ${tone || "neutral"}
        ${userInstruction ? `8. Additional instruction: ${userInstruction}` : ""}
        
        AFTER THE REPLIES, INCLUDE "${questionSeparator}" FOLLOWED BY 3 CONTEXTUAL GUIDING QUESTIONS:
        1. Create 3 thought-provoking questions that directly relate to the specific content of the tweet
        2. These questions should help the user formulate their own thoughtful response
        3. Make questions specific to the topic, events, people, or opinions mentioned in the tweet
        4. Avoid generic questions - they must clearly relate to this specific tweet's content
        5. Format: Question 1, then Question 2, then Question 3, each on its own line
        `;

      try {
        const response = await callOpenAI(
          userSettings.apiKey,
          prompt,
          tone,
          userInstruction,
          userSettings.profileBio,
          userWritingSamples,
          userSettings.likedTweets
        );

        // Process the response to get replies and contextual questions
        const processedResponse = processAIResponse(
          response,
          postSeparator,
          questionSeparator
        );

        // Ensure no hyphens in the final replies as a fallback
        const cleanedReplies = processedResponse.replies.map((reply) =>
          removeHyphens(reply)
        );

        // Format the response with replies and questions
        const formattedResponse = {
          allReplies: cleanedReplies,
          reply: cleanedReplies[0], // For backward compatibility
          guidingQuestions: processedResponse.questions, // Add the contextual questions
        };

        console.log(
          "[Background] Processed response with contextual questions:",
          formattedResponse
        );
        sendResponse(formattedResponse);
      } catch (error) {
        console.error("[Background] Error generating reply:", error);
        sendResponse({ error: `Error generating reply: ${error.message}` });
      }
    } else if (message.type === "GENERATE_AI_REPLY") {
      const { data, tone, userInstruction } = message; // Assuming data and userInstruction
      // ... (prompt construction as in the diff) ...
      let prompt = `A user wants help drafting a concise, engaging Twitter reply (≤40 words). Their general writing style is described as: "${
        userSettings.profileBio || "a generally helpful and friendly tech enthusiast"
      }".\nThe reply should be ${getTonePrompt(tone)}.\nOriginal tweet to reply to by @${
        data.tweetAuthorHandle
      }: "${data.tweetText}"\n`;
      // Add userWritingSamples and userInstruction to prompt if they exist...
      console.log("[Background] FINAL PROMPT for GENERATE_AI_REPLY:", prompt);
      const reply = await callOpenAI(
        userSettings.apiKey,
        prompt,
        tone,
        userInstruction,
        userSettings.profileBio,
        userSettings.userPosts,
        userSettings.likedTweets /*, systemMessage if needed for this call*/
      );
      sendResponse({ type: "AI_REPLY_GENERATED", reply });
    } else if (message.type === "GENERATE_TWEET_IDEAS") {
      const { trending, tone, userInstruction } = message;
      // ... (prompt construction as in the diff, using topicsForIdeas) ...
      let topicsForIdeas =
        "current technology, AI advancements, and software development trends";
      if (userLikedTopicsRaw && userLikedTopicsRaw.length > 0) {
        topicsForIdeas = userLikedTopicsRaw.slice(0, 5).join("... ");
      } else if (trending && trending.length > 0) {
        topicsForIdeas = trending.join(", ");
      }
      let prompt = `A user wants 3 original tweet ideas (≤280 characters each). Their general writing style is described as: "${
        userSettings.profileBio || "a generally insightful and engaging tech commentator"
      }".\nThe tweet ideas should be ${getTonePrompt(
        tone
      )}.\nThe ideas should revolve around these topics/themes: ${topicsForIdeas}.\n`;
      // Add userWritingSamples to prompt if they exist...
      console.log("[Background] FINAL PROMPT for generateTweetIdeas:", prompt);
      const ideas = await callOpenAI(
        userSettings.apiKey,
        prompt,
        tone,
        userInstruction,
        userSettings.profileBio,
        userSettings.userPosts,
        userSettings.likedTweets /*, systemMessage if needed */
      );
      sendResponse({
        ideas: ideas.split("\n\n").filter((idea) => idea.trim().length > 0),
      });
    } else if (message.type === "FETCH_TRENDING") {
      fetchTrendingTopics()
        .then((trending) => sendResponse({ trending }))
        .catch((error) => sendResponse({ error: error.message }));
      // This handler is async due to fetchTrendingTopics, but its own logic doesn't await the API key.
      // The return true below will keep the channel open for fetchTrendingTopics's promise.
    } else if (message.type === "FETCH_REAL_TRENDING_TOPICS") {
        console.log('[Background] Received request for real trending topics');
        
        // This will use web search to get actual trending topics
        (async () => {
          try {
            // Use web search to get current trending topics
            const query = 'What are the current trending tech topics on Twitter/X? List only 5-7 specific trending topics, separated by commas.';
            
            const searchResults = await searchWeb(query);
            if (searchResults && searchResults.text) {
              // Process the results to extract topics
              // First, check if the response already looks like a comma-separated list
              let topics = [];
              
              if (searchResults.text.includes(',')) {
                // If it contains commas, treat it as a comma-separated list
                topics = searchResults.text
                  .split(',')
                  .map(topic => topic.trim())
                  .filter(topic => topic.length > 0 && topic.length < 50); // Avoid extremely long topics
              } else {
                // Otherwise, try to split by newlines or other common separators
                topics = searchResults.text
                  .split(/[\n\r•\-\*]/) // Split by newlines, bullets, hyphens, etc.
                  .map(topic => topic.trim())
                  .filter(topic => topic.length > 0 && topic.length < 50);
              }
              
              // Check if we have at least one valid topic
              if (topics.length > 0) {
                console.log('[Background] Retrieved trending topics from web search:', topics);
                sendResponse({ trending: topics.slice(0, 7), source: 'web' }); // Return topics and source
              } else {
                // Don't show fallback data - just return empty result
                console.log('[Background] No valid topics extracted from search');
                sendResponse({ trending: [] });
              }
            } else {
              // Don't show fallback data - just return empty result
              console.log('[Background] Search failed to return valid text');
              sendResponse({ trending: [] });
            }
          } catch (error) {
            console.error('[Background] Error fetching real trending topics:', error);
            // Don't show fallback data - just return empty result
            sendResponse({ trending: [] });
          }
        })();
        
        return true; // Async response
    } else {
      console.warn("[Background] Unhandled message type in IIFE:", message.type);
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
async function generateReply(tweetData, tone = "neutral") {
  const { tweetText, tweetAuthorHandle, userInstruction } = tweetData;
  const tonePrompt = getTonePrompt(tone);

  let prompt = `A user wants help drafting a concise, engaging Twitter reply (≤40 words). Their general writing style is described as: "${
    userSettings.profileBio || "a generally helpful and friendly tech enthusiast"
  }".
  The reply should be ${tonePrompt}.
  Original tweet to reply to by @${tweetAuthorHandle}: "${tweetText}"
  `;

  if (userWritingSamples && userWritingSamples.length > 0) {
    prompt += `Here are examples of how the user typically writes. Strive to match this style, tone, and vocabulary PRECISELY:\n`;
    userWritingSamples.slice(0, 5).forEach((sample, index) => {
      // Use up to 5 samples
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
4.  AVOID using hashtags unless they are clearly present in the user's writing samples, bio, or if the user explicitly asks for them for this specific reply. (Note: User's default hashtag list is currently ${
    userSettings.hashtags && userSettings.hashtags.length > 0
      ? userSettings.hashtags.join(", ")
      : "empty"
  }).
5.  AVOID using double dashes ('--') for emphasis or as sentence connectors unless present in user's samples/bio.
6.  Focus on clarity and natural language.

Draft the reply now:`;

  console.log("[Background] FINAL PROMPT for generateReply:", prompt);
  console.log(
    "[Background] API Key being used for generateReply:",
    userSettings.apiKey
      ? userSettings.apiKey.substring(0, 10) + "..."
      : "API Key not set or empty"
  );
  return callOpenAI(userSettings.apiKey, prompt);
}

/**
 * Generate tweet ideas based on trending topics
 * @param {Array} trending - List of trending topics (will be replaced by liked topics)
 * @param {string} tone - The tone to use for the ideas
 * @param {string} userInstruction - User's specific instruction for the tweet ideas
 * @returns {Promise<Array>} - List of tweet ideas
 */
async function generateTweetIdeas(trending, tone = "neutral", userInstruction = null) {
  const tonePrompt = getTonePrompt(tone);

  // Determine topics: Use liked topics if available, otherwise fall back to generic/trending
  let topicsForIdeas =
    "current technology, AI advancements, and software development trends"; // Default
  if (userLikedTopicsRaw && userLikedTopicsRaw.length > 0) {
    // Simple approach: use snippets of liked tweets as topic indicators
    // More advanced: summarize themes from userLikedTopicsRaw with another AI call (future enhancement)
    topicsForIdeas = userLikedTopicsRaw.slice(0, 5).join("... "); // Using first 5 liked snippets
    console.log("[Background] Generating ideas based on liked topics:", topicsForIdeas);
  } else if (trending && trending.length > 0) {
    topicsForIdeas = trending.join(", ");
    console.log(
      "[Background] Generating ideas based on provided trending topics:",
      topicsForIdeas
    );
  }

  let prompt = `A user wants 3 original tweet ideas (≤280 characters each). Their general writing style is described as: "${
    userSettings.profileBio || "a generally insightful and engaging tech commentator"
  }".
  The tweet ideas should be ${tonePrompt}.
  The ideas should revolve around these topics/themes: ${topicsForIdeas}.
`;

  if (userWritingSamples && userWritingSamples.length > 0) {
    prompt += `User's general writing style based on their recent posts (use this to guide the voice, tone, and vocabulary of the tweet ideas):\n`;
    userWritingSamples.slice(0, 3).forEach((sample, index) => {
      // Use up to 3 samples for ideas
      prompt += `Example ${index + 1}: "${sample}"\n`;
    });
    prompt += `---`;
  }

  prompt += `\nIMPORTANT STYLE GUIDELINES (unless contradicted by user's samples/bio or liked topics):
1.  The ideas should sound authentically human and align with the user's described style.
2.  Tweet ideas should be concise and suitable for X.com (formerly Twitter).
3.  Consider adopting a clear viewpoint or a more opinionated/assertive stance if the user's style or liked topics suggest it. Avoid overly neutral or 'balanced' takes unless that's the user's explicit style. If in doubt, lean towards a more distinct perspective.
4.  AVOID using emojis in the tweet ideas unless the user's writing samples, bio, or specific instruction asks for them.
5.  AVOID using hashtags in the tweet ideas unless they are clearly present in the user's writing samples, bio, or if the user explicitly asks for them. (Note: User's default hashtag list is currently ${
    userSettings.hashtags && userSettings.hashtags.length > 0
      ? userSettings.hashtags.join(", ")
      : "empty"
  }).
6.  AVOID using double dashes ('--') for emphasis or as sentence connectors unless present in user's samples/bio.
7.  Aim for a mix of content: perhaps a question, a useful tip, a bold take, or an interesting observation.

Generate 3 distinct tweet ideas now, separated by double newlines (\n\n):`;

  console.log("[Background] FINAL PROMPT for generateTweetIdeas:", prompt);
  console.log(
    "[Background] API Key being used for generateTweetIdeas:",
    userSettings.apiKey
      ? userSettings.apiKey.substring(0, 10) + "..."
      : "API Key not set or empty"
  );
  const response = await callOpenAI(userSettings.apiKey, prompt);
  return response.split("\n\n").filter((idea) => idea.trim().length > 0);
}

/**
 * Get tone-specific prompt addition
 * @param {string} tone - The selected tone
 * @returns {string} - Tone-specific prompt addition
 */
function getTonePrompt(tone) {
  switch (tone) {
    case "fun":
      return "with a light, humorous tone";
    case "hot-take":
      return "with a bold, provocative stance";
    case "heartfelt":
      return "with a sincere, empathetic approach";
    default:
      return "with a balanced, professional tone";
  }
}

async function handleProcessVoiceTranscript(payload, sendResponse) {
  const { transcript, tone } = payload;
  if (!transcript) {
    sendResponse({ type: "POLISHING_ERROR", payload: { error: "Transcript is empty." } });
    return;
  }

  try {
    const apiKey = await getApiKey(); // Correctly fetch API key
    if (!apiKey) {
      sendResponse({
        type: "POLISHING_ERROR",
        payload: { error: "API key not found. Please set it in the extension settings." },
      });
      return;
    }

    let userContext = "";
    if (userSettings.profileBio) {
      userContext += `My bio: "${userSettings.profileBio}".\n`;
    }
    if (userSettings.hashtags && userSettings.hashtags.length > 0) {
      userContext += `I often use hashtags like: ${userSettings.hashtags.join(", ")}.\n`;
    }

    const prompt = `Given the following voice transcript, please refine it into a polished tweet or reply. 
User's preferred tone: "${tone || userSettings.tone || "neutral"}".
${userContext}
Ensure the output is concise, engaging, and ready for posting on X.com. Avoid conversational fillers and make it sound natural for a written post.

Voice Transcript: "${transcript}"

Polished Text:`;

    console.log("[bg.js] Prompt for polishing voice transcript:", prompt);

    const aiResponse = await callOpenAI(prompt, apiKey, [], 0.7); // Assuming callOpenAI handles an array for previous messages

    if (aiResponse && aiResponse.choices && aiResponse.choices.length > 0) {
      const polishedText = aiResponse.choices[0].message.content.trim();
      console.log("[bg.js] Polished text from AI:", polishedText);
      sendResponse({ type: "POLISHED_TEXT_READY", payload: { polishedText } });
    } else {
      console.error("[bg.js] Unexpected response structure from OpenAI API:", aiResponse);
      sendResponse({
        type: "POLISHING_ERROR",
        payload: { error: "Unexpected response from AI." },
      });
    }
  } catch (error) {
    console.error("[bg.js] Error during voice transcript processing:", error);
    sendResponse({
      type: "POLISHING_ERROR",
      payload: { error: error.message || "Failed to process voice transcript." },
    });
  }
}

const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";

async function transcribeAudioWithOpenAI(audioBlob, apiKey) {
  if (!apiKey) {
    return {
      error: "OpenAI API key is not set. Please set it in the extension settings.",
    };
  }

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm"); // Filename is required by the API
  formData.append("model", "gpt-4o-transcribe"); // Or 'whisper-1'
  // formData.append('response_format', 'json'); // Default is json, can also be 'text'

  try {
    const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // 'Content-Type': 'multipart/form-data' is automatically set by browser for FormData
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[XCO-Poster BG] OpenAI Transcription API error:", data);
      const errorMessage =
        data.error && data.error.message
          ? data.error.message
          : `HTTP error ${response.status}`;
      return { error: `OpenAI API Error: ${errorMessage}` };
    }

    console.log("[XCO-Poster BG] Transcription successful:", data);
    return { transcript: data.text }; // Assuming 'text' field contains the transcript
  } catch (error) {
    console.error("[XCO-Poster BG] Error calling OpenAI Transcription API:", error);
    return { error: `Network or other error: ${error.message}` };
  }
}

// Process the AI response to extract multiple reply suggestions and contextual questions
function processAIResponse(response, replySeparator, questionSeparator) {
  if (!response) {
    return { 
      replies: ['Sorry, I couldn\'t generate a reply.'],
      questions: [
        "What points would you like to make about this tweet?",
        "How do you personally feel about the content of this tweet?",
        "Is there a specific aspect of the tweet you want to respond to?"
      ]
    };
  }
  
  // Initialize default result
  const result = {
    replies: [],
    questions: [
      "What points would you like to make about this tweet?",
      "How do you personally feel about the content of this tweet?",
      "Is there a specific aspect of the tweet you want to respond to?"
    ]
  };

  // Extract contextual questions if they exist
  if (response.includes(questionSeparator)) {
    console.log('[Background] Found question separator in response');
    const [repliesSection, questionsSection] = response.split(questionSeparator);
    
    // Process replies from the first section
    if (repliesSection && repliesSection.includes(replySeparator)) {
      const replies = repliesSection.split(replySeparator)
        .map(reply => reply.trim())
        .filter(reply => reply.length > 0);
      
      if (replies.length > 0) {
        result.replies = replies.slice(0, 5);
      }
    } else if (repliesSection && repliesSection.trim()) {
      // If no separator but we have content, use it as a single reply
      result.replies = [repliesSection.trim()];
    }
    
    // Process questions from the second section
    if (questionsSection && questionsSection.trim()) {
      // Handle different formats of questions in the response
      let questions = [];
      
      // Check if questions are prefixed with "Question X:" format
      if (questionsSection.includes('Question 1:') || 
          questionsSection.includes('Question 2:') || 
          questionsSection.includes('Question 3:')) {
        
        // Extract questions with prefixes 
        const questionPattern = /Question \d+:\s*([^\n]+)/g;
        const matches = questionsSection.matchAll(questionPattern);
        
        for (const match of matches) {
          if (match[1] && match[1].trim()) {
            questions.push(match[1].trim());
          }
        }
      } else {
        // Standard processing - split by line breaks
        questions = questionsSection.split('\n')
          .map(q => q.trim())
          .filter(q => q.length > 0 && q.length < 200); // Avoid extremely long lines
      }
      
      console.log('[Background] Extracted questions:', questions);
      
      if (questions.length > 0) {
        result.questions = questions.slice(0, 3);
      }
    }
  } else {
    // No question separator, just process replies
    if (response.includes(replySeparator)) {
      const replies = response.split(replySeparator)
        .map(reply => reply.trim())
        .filter(reply => reply.length > 0);
      
      if (replies.length > 0) {
        result.replies = replies.slice(0, 5);
      }
    } else if (response.trim()) {
      // If no separator but we have content, use it as a single reply
      result.replies = [response.trim()];
    }
  }
  
  // Ensure we have at least one question
  if (!result.questions || result.questions.length === 0) {
    result.questions = [
      "What points would you like to make about this?",
      "What perspective would you like to share on this topic?",
      "How might you contribute to this conversation?"
    ];
  }
  
  return result;
}

// Remove hyphens from text (fallback safety measure)
function removeHyphens(text) {
  if (!text) return text;

  // Replace single hyphens with spaces or appropriate punctuation
  let result = text.replace(/([a-zA-Z])\s*-\s*([a-zA-Z])/g, "$1 $2"); // word - word -> word word

  // Replace double hyphens
  result = result.replace(/--/g, "—"); // Replace double hyphen with em dash

  // Replace any remaining single hyphens
  result = result.replace(/-/g, "·"); // Fallback replacement

  return result;
}

// Extract topics of interest from user's bio
async function extractTopicsFromBio(bio) {
  if (!bio || bio.trim().length === 0) {
    console.log("[Background] No bio provided for topic extraction");
    return [];
  }

  try {
    console.log("[Background] Extracting topics from bio:", bio);

    const prompt = `
      Extract the main topics, interests, professional fields, and areas of expertise from this Twitter/X bio.
      Return ONLY a comma-separated list of specific topics (nouns and noun phrases only).
      Example output format: "artificial intelligence, machine learning, tech startups, dog training"
      
      Bio: "${bio}"
    `;

    const response = await callOpenAI(userSettings.apiKey, prompt);

    // Process the response to get a clean array of topics
    if (response && response.trim()) {
      const topics = response
        .split(",")
        .map((topic) => topic.trim())
        .filter((topic) => topic.length > 0);

      console.log("[Background] Extracted topics from bio:", topics);
      return topics;
    }

    return [];
  } catch (error) {
    console.error("[Background] Error extracting topics from bio:", error);
    return [];
  }
}

// Analyze user's liked posts to identify patterns and topics
async function analyzeLikedPosts(likedPosts) {
  if (!likedPosts || !Array.isArray(likedPosts) || likedPosts.length === 0) {
    console.log("[Background] No liked posts provided for analysis");
    return [];
  }

  try {
    console.log("[Background] Analyzing liked posts. Post count:", likedPosts.length);

    // Use a subset of posts if there are too many (to avoid token limits)
    const postsToAnalyze = likedPosts
      .slice(0, 20)
      .map((post) => post.text || post)
      .filter(Boolean);

    const prompt = `
      Analyze these liked tweets and identify recurring topics, interests, and themes.
      Return ONLY a comma-separated list of specific topics that appear multiple times (nouns and noun phrases only).
      Focus on extracting topics that could be used for generating new tweet content.
      Example output format: "artificial intelligence, sports news, cooking tips, data science"
      
      Tweets:
      ${postsToAnalyze.join("\n")}
    `;

    const response = await callOpenAI(userSettings.apiKey, prompt);

    // Process the response to get a clean array of topics
    if (response && response.trim()) {
      const topics = response
        .split(",")
        .map((topic) => topic.trim())
        .filter((topic) => topic.length > 0);

      console.log("[Background] Extracted topics from liked posts:", topics);
      return topics;
    }

    return [];
  } catch (error) {
    console.error("[Background] Error analyzing liked posts:", error);
    return [];
  }
}

// Helper function to convert Data URL to Blob
function dataURLtoBlob(dataurl) {
  if (!dataurl) return null;
  let arr = dataurl.split(","),
    mime = arr[0].match(/:(.*?);/)[1],
    bstr = atob(arr[1]),
    n = bstr.length,
    u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Get fallback trending topics when web search fails
 * @returns {Array} - List of fallback trending topics
 */
function getFallbackTrendingTopics() {
  return [
    "GPT-5 release rumors",
    "React 19 performance improvements",
    "Chrome's new web APIs",
    "Startups tackling climate tech",
    "Edge computing breakthroughs",
    "AI regulations in Europe",
    "Quantum computing milestones"
  ];
}

// Generate tweets based on news and user interests
async function generateTweetsWithNews(tone = "neutral", userInstruction = null) {
  try {
    console.log("[Background] Generating tweets with news and interests");

    // 1. Extract topics from user bio
    const bioTopics = await extractTopicsFromBio(userSettings.profileBio);
    console.log("[Background] Topics from bio:", bioTopics);

    // 2. Analyze liked posts for topics
    const likedPostsTopics = await analyzeLikedPosts(userLikedTopicsRaw);
    console.log("[Background] Topics from liked posts:", likedPostsTopics);

    // 3. Combine topics and select up to 3 most relevant
    const allTopics = [...new Set([...bioTopics, ...likedPostsTopics])];
    const selectedTopics = allTopics.slice(0, 3);
    console.log("[Background] Selected topics for search:", selectedTopics);

    // 4. If we have topics, search for news; otherwise, use trending topics
    let newsContext = '';
    let newsSource = '';
    let trendingTopics = [];

    if (selectedTopics.length > 0) {
      try {
        // Search for news about the selected topics
        const searchQuery = `Summarize the latest news (from the last 24-48 hours) about ${selectedTopics.join(', ')}. Provide key points and developments in 3-5 paragraphs.`;

        console.log('[Background] Searching for news about topics:', selectedTopics);
        const searchResults = await searchWeb(searchQuery);

        if (searchResults && searchResults.text && searchResults.text.length > 50) {
          newsContext = searchResults.text;
          newsSource = 'topics';
          console.log('[Background] News search results acquired');

          // Also get trending topics as supplementary context
          try {
            trendingTopics = await fetchTrendingTopics();
          } catch (trendingError) {
            console.error('[Background] Error fetching trending topics:', trendingError);
            // Use default trending topics if fetch fails
            trendingTopics = getFallbackTrendingTopics();
          }
        } else {
          throw new Error('Insufficient news results');
        }
      } catch (error) {
        console.error('[Background] Error in news search:', error);
        // Fall back to trending topics
        try {
          trendingTopics = await fetchTrendingTopics();
        } catch (trendingError) {
          console.error('[Background] Error fetching trending topics:', trendingError);
          // Use default trending topics if fetch fails
          trendingTopics = getFallbackTrendingTopics();
        }
        newsSource = 'trending';
      }
    } else {
      // No user topics, use trending topics
      try {
        trendingTopics = await fetchTrendingTopics();
      } catch (trendingError) {
        console.error('[Background] Error fetching trending topics:', trendingError);
        // Use default trending topics if fetch fails
        trendingTopics = getFallbackTrendingTopics();
      }
      newsSource = 'trending';
    }

    // 5. Create a context for tweets based on either news or trending topics
    if (newsSource === "trending" && trendingTopics.length > 0) {
      newsContext = `Current trending topics: ${trendingTopics.join(", ")}.`;
    }

    // If we still don't have any context, provide a fallback
    if (!newsContext) {
      newsContext =
        "Focus on general topics like technology, business, entertainment, or personal development.";
    }

    // 6. Generate tweet ideas using the context
    const postSeparator = "###POST_SEPARATOR###";
    const questionSeparator = "###QUESTIONS_SEPARATOR###";

    const prompt = `
      Generate 5 distinct tweet ideas and 3 thought-provoking questions based on the following context:

      ${newsContext}

      ${
        userSettings.profileBio
          ? `IMPORTANT - Match this bio/style: ${userSettings.profileBio}`
          : ""
      }
      
      ${
        userWritingSamples.length > 0
          ? `IMPORTANT - Match the style, tone, and vocabulary of these writing samples:
        ${userWritingSamples
          .map((sample, i) => `Sample ${i + 1}: "${sample}"`)
          .join("\n")}`
          : ""
      }
      
      STRICT REQUIREMENTS FOR TWEETS:
      1. Create 5 COMPLETELY DIFFERENT tweet ideas with diverse angles and approaches
      2. Each tweet must be concise (max 280 characters) and engaging
      3. DO NOT use ANY hyphens (- or --) in ANY of the tweets - this is very important
      4. Match the user's vocabulary level, sentence structure, and conversational style
      5. Format each tweet separated by "${postSeparator}"
      6. Tone should be: ${tone || "neutral"}
      7. Include relevant hashtags where appropriate
      ${userInstruction ? `8. Additional instruction: ${userInstruction}` : ""}
      
      AFTER THE TWEETS, INCLUDE "${questionSeparator}" FOLLOWED BY 3 BRAINSTORMING QUESTIONS:
      1. Create 3 thought-provoking questions that help the user formulate their own tweet
      2. Questions should relate to trending topics or user interests
      3. Make questions specific and actionable for content creation
      4. Format: Question 1, then Question 2, then Question 3, each on its own line
    `;

    console.log("[Background] Calling OpenAI with tweet generation prompt");
    const response = await callOpenAI(
      userSettings.apiKey,
      prompt,
      tone,
      userInstruction,
      userSettings.profileBio,
      userWritingSamples
    );

    // 7. Process the response to extract tweets and questions
    const processedResponse = processAIResponse(
      response,
      postSeparator,
      questionSeparator
    );

    // 8. Ensure no hyphens in the final tweets
    const cleanedTweets = processedResponse.replies.map((tweet) => removeHyphens(tweet));

    // 9. Format the response
    const result = {
      ideas: cleanedTweets,
      trending: trendingTopics,
      newsSource: newsSource,
      guidingQuestions: processedResponse.questions,
    };

    console.log("[Background] Generated tweets with context:", result);
    return result;
  } catch (error) {
    console.error("[Background] Error generating tweets with news:", error);
    throw error;
  }
}

// Listen for side panel open to show extension
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Listener for scheduled post alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log("[Background] Alarm triggered:", alarm.name);

  if (alarm.name.startsWith("scheduledPost_")) {
    try {
      const { scheduledPosts = [] } = await chrome.storage.local.get("scheduledPosts");
      const postIndex = scheduledPosts.findIndex((p) => p.alarmName === alarm.name);

      if (postIndex > -1) {
        const postToProcess = scheduledPosts[postIndex];

        // Simulate posting (log to console for now)
        console.log(`[Background] Posting scheduled content for alarm ${alarm.name}:`);
        console.log(`--------------------------------------------------`);
        console.log(postToProcess.content);
        console.log(`--------------------------------------------------`);
        console.log(`Originally scheduled for: ${postToProcess.scheduledTime}`);

        // Update post status
        scheduledPosts[postIndex].status = "posted";
        scheduledPosts[postIndex].postedTime = new Date().toISOString();

        // Save updated posts list
        await chrome.storage.local.set({ scheduledPosts });
        console.log(`[Background] Post ${alarm.name} marked as posted.`);

        // Optional: Clear the alarm after it has fired and been processed
        // chrome.alarms.clear(alarm.name, (wasCleared) => {
        //   if (wasCleared) {
        //     console.log(`[Background] Alarm ${alarm.name} cleared successfully.`);
        //   } else {
        //     console.warn(`[Background] Could not clear alarm ${alarm.name}. It might have already been cleared or never existed.`);
        //   }
        // });
      } else {
        console.warn(
          `[Background] Scheduled post for alarm ${alarm.name} not found in storage.`
        );
      }
    } catch (error) {
      console.error(`[Background] Error processing alarm ${alarm.name}:`, error);
    }
  } else {
    console.log(`[Background] Received non-post alarm: ${alarm.name}`);
  }
});
