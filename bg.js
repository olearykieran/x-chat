import { callOpenAI, generatePolishedPosts } from "./lib/api.js";
import { DEFAULT_SETTINGS } from "./lib/constants.js";

// Function to check API key and warn if not set
function checkAndWarnApiKey() {
  if (!userSettings.apiKey) {
    console.warn("[Background] API key is not set. Some features may not work.");
    // Potentially send a message to UI or show a notification if desired
  } else {
    console.log(
      "[Background] API key check passed. userSettings.apiKey:",
      userSettings.apiKey
    );
  }
}

// Initialize state
// Ensure userSettings are initialized with defaults from constants.js
let userSettings = {
  ...DEFAULT_SETTINGS,
  tone:
    DEFAULT_SETTINGS.defaultTone !== undefined ? DEFAULT_SETTINGS.defaultTone : "neutral", // Maps from defaultTone
  useOwnKey: DEFAULT_SETTINGS.useOwnKey !== undefined ? DEFAULT_SETTINGS.useOwnKey : true, // Default is true
};
console.log(
  "[Background] Initial userSettings.useOwnKey after DEFAULT_SETTINGS:",
  userSettings.useOwnKey
);

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[Background] onInstalled triggered. Reason:", details.reason);

  // Only perform full storage clear on fresh install, not on update/reload
  if (details.reason === "install") {
    console.log(
      "[Background] onInstalled: Fresh install detected. Setting default values."
    );
    // For fresh install, we'll set default values rather than clearing everything
    try {
      // Fetch any existing API key and settings before setting defaults
      const existingData = await new Promise((resolve) => {
        chrome.storage.sync.get(["apiKey", "useOwnKey"], (result) => {
          resolve(result);
        });
      });

      // Set default values while preserving any existing API key
      const defaultSettings = {
        useOwnKey: existingData.useOwnKey !== undefined ? existingData.useOwnKey : true,
        apiKey: existingData.apiKey || userSettings.apiKey,
      };

      await new Promise((resolve, reject) => {
        chrome.storage.sync.set(defaultSettings, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[Background] onInstalled: Error setting default values:",
              chrome.runtime.lastError.message
            );
            reject(chrome.runtime.lastError);
          } else {
            console.log(
              "[Background] onInstalled: Default values set successfully:",
              defaultSettings
            );
            resolve();
          }
        });
      });
    } catch (error) {
      console.error(
        "[Background] onInstalled: Exception during setting defaults:",
        error
      );
    }
  } else {
    console.log(
      "[Background] onInstalled: Update/reload detected. Preserving existing settings."
    );
  }
  // Now, after attempting to clear, load data.
  // This ensures that loadDataFromStorage runs after the clear attempt.
  console.log("[Background] onInstalled: Proceeding to call loadDataFromStorage.");
  await loadDataFromStorage();
  checkAndWarnApiKey(); // Moved from initialize function
  initializeAlarms(); // Moved from initialize function
  // Any other specific onInstalled logic can go here
  console.log("[Background] onInstalled event processing finished.");
});

// Load data from Chrome storage
async function loadDataFromStorage() {
  console.log("[Background] Loading data from storage");
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.sync.get(["apiKey", "useOwnKey"], (data) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[Background] Error loading from storage:",
            chrome.runtime.lastError
          );
          resolve({});
        } else {
          console.log("[Background] Data loaded from storage:", {
            useOwnKey: data.useOwnKey,
            apiKeyExists: !!data.apiKey,
          });
          resolve(data);
        }
      });
    });

    // Update userSettings with data from storage
    if (result.apiKey) {
      userSettings.apiKey = result.apiKey;
    }

    if (result.useOwnKey !== undefined) {
      userSettings.useOwnKey = result.useOwnKey;
    }

    console.log("[Background] userSettings updated with storage data");
  } catch (error) {
    console.error("[Background] Error in loadDataFromStorage:", error);
  }
}

// Initialize alarms for scheduled posts
async function initializeAlarms() {
  console.log("[Background] Initializing alarms");
  try {
    // Clear existing alarms first
    await new Promise((resolve) => {
      chrome.alarms.clearAll((wasCleared) => {
        console.log("[Background] All alarms cleared:", wasCleared);
        resolve();
      });
    });

    // Get scheduled posts from storage
    const { scheduledPosts = [] } = await new Promise((resolve) => {
      chrome.storage.local.get("scheduledPosts", (result) => {
        resolve(result);
      });
    });

    console.log("[Background] Found", scheduledPosts.length, "scheduled posts");

    // Set up alarms for each scheduled post
    for (const post of scheduledPosts) {
      if (post.scheduledTime && post.alarmName) {
        const scheduledTime = new Date(post.scheduledTime).getTime();
        const now = Date.now();

        // Only create alarms for future posts
        if (scheduledTime > now) {
          console.log(
            `[Background] Creating alarm for post: ${post.alarmName} at ${new Date(
              scheduledTime
            )}`
          );
          chrome.alarms.create(post.alarmName, {
            when: scheduledTime,
          });
        } else {
          console.log(`[Background] Skipping past scheduled post: ${post.alarmName}`);
        }
      }
    }
  } catch (error) {
    console.error("[Background] Error in initializeAlarms:", error);
  }
}

// Initialize and load data when the extension starts (not just onInstalled)
async function initialize() {
  console.log("[Background] Initializing script. Current userSettings:", userSettings);
  await loadDataFromStorage(); // Ensure settings are loaded on every startup
  // checkAndWarnApiKey(); // Moved to onInstalled and regular startup load
  // initializeAlarms();   // Moved to onInstalled

  // Initial fetch of voice/topic data if not already populated, or if settings indicate it's needed
  if (!userSettings.profileBio || userSettings.profileBio.trim() === "") {
    // Potentially fetch/update these if they are empty or based on some logic
    console.log("[Background] Initial voice/topic data loaded.");
  }
}

// Call initialize on extension startup (when the background script loads)
initialize()
  .then(() => {
    console.log("[Background] Initial script loading and setup complete.");
  })
  .catch((error) => {
    console.error("[Background] Error during initial script loading:", error);
  });

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

/**
 * Generate a reply to a tweet using OpenAI
 * @param {Object} tweetData - Data about the tweet to reply to
 * @param {string} tone - The tone to use for the reply
 * @returns {Promise<string>} - The generated reply
 */
async function generateReply(tweetData, tone = "neutral") {
  const { tweetText, tweetAuthorHandle, userInstruction } = tweetData;
  const tonePrompt = getTonePrompt(tone);

  let prompt = `A user wants help drafting a concise, engaging Twitter reply (≤40 words) that DIRECTLY responds to another person's tweet. Their general writing style is described as: "${
    userSettings.profileBio || "a generally helpful and friendly tech enthusiast"
  }".
  The reply should be ${tonePrompt}.
  Original tweet to reply to by @${tweetAuthorHandle}: "${tweetText}"
  `;

  // Add liked topics if available to better understand user preferences
  if (userSettings.likedTopics && userSettings.likedTopics.length > 0) {
    prompt += `The user is interested in these topics: ${userSettings.likedTopics.join(
      ", "
    )}\n`;
  }

  if (userWritingSamples && userWritingSamples.length > 0) {
    prompt += `Here are examples of how the user typically writes. YOU MUST MATCH this style, tone, vocabulary, and sentence structure PRECISELY:\n`;
    userWritingSamples.slice(0, 5).forEach((sample, index) => {
      // Use up to 5 samples
      prompt += `Example ${index + 1}: "${sample}"\n`;
    });
    prompt += `The user's reply MUST sound exactly like it came directly from them, based on these examples and their profile bio.\n`;
  } else {
    prompt += `(No specific writing samples provided, rely on the profile bio for style.)\n`;
  }

  if (userReplies && userReplies.length > 0) {
    prompt += `The user's recent replies show their EXACT style of responding. These are CRITICAL for matching their voice:\n`;
    userReplies.slice(0, 5).forEach((reply, index) => {
      // Use up to 5 recent replies
      prompt += `Reply Example ${index + 1}: "${reply}"\n`;
    });
    prompt += `Pay special attention to these recent replies as they represent the user's most current writing style.\n`;
  }

  if (userInstruction) {
    prompt += `The user provided this specific instruction for the reply: "${userInstruction}". Prioritize this instruction while maintaining the overall style.
`;
  }

  prompt += `\nABSOLUTELY CRITICAL STYLE REQUIREMENTS - YOU WILL BE PENALIZED FOR VIOLATIONS:
1.  Sound authentically human and EXACTLY like the user would write based on their samples and bio.
2.  Keep the reply concise and to the point, suitable for X.com (formerly Twitter).
3.  NO HYPHENS OR DASHES WHATSOEVER! DO NOT use any form of hyphen, dash, em dash, en dash (-, --, —, –) or similar punctuation under ANY circumstances. This is the MOST IMPORTANT rule and will be strictly enforced.
4.  DO NOT use ANY form of AI-typical phrasing like "I understand", "I appreciate", "I'd be happy to", or "as you mentioned".
5.  DO NOT use sentence transitions that the user doesn't use in their samples.
6.  AVOID using emojis unless the user's writing samples, bio, or specific instruction explicitly includes them.
7.  NO HASHTAGS of ANY kind unless they are clearly present in multiple user samples or the user explicitly requests them. (Note: User's default hashtag list is currently ${
    userSettings.hashtags && userSettings.hashtags.length > 0
      ? userSettings.hashtags.join(", ")
      : "empty"
  }).
8.  MATCH the user's typical sentence length, punctuation style, and capitalization patterns exactly.
9.  If the user's style is casual, be casual. If formal, be formal. If they use slang, use similar slang.
10. Use simple punctuation like periods and commas. Avoid semicolons, colons, or parentheses unless the user frequently uses them.
11. Focus on clarity and natural language that precisely mirrors the user's authentic voice.

CRITICAL REPLY REQUIREMENTS:
1.  This MUST be a DIRECT REPLY to the specific tweet content above, not a new standalone post.
2.  The reply should explicitly acknowledge or address what @${tweetAuthorHandle} said in their tweet.
3.  DO NOT create a new post that just uses the original tweet as context or inspiration.
4.  DO NOT simply comment on the topic of the original tweet without actually responding to it.
5.  Make it clear from your wording that this is a reply to the specific points in the original tweet.
6.  The reply should make sense ONLY in the context of responding to the original tweet.
7.  Each reply must directly answer the tweet's question by providing the specific information or examples requested.
`;

  console.log("[Background] FINAL PROMPT for generateReply:", prompt);
  console.log(
    "[Background] API Key being used for generateReply:",
    userSettings.apiKey
      ? userSettings.apiKey.substring(0, 10) + "..."
      : "API Key not set or empty"
  );
  return callOpenAI(userSettings.apiKey, prompt);
}

async function handleProcessVoiceTranscript(payload, sendResponse) {
  const { transcript, tone } = payload;
  if (!transcript) {
    sendResponse({ error: "Transcript is empty." });
    return;
  }
  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      sendResponse({ error: "API key not found. Please set it in the extension settings." });
      return;
    }

    // Create a better system message specifically for transcript polishing
    const systemMessage = `You are an expert at transforming raw voice transcripts into polished, natural-sounding tweets or replies. 
Your task is to take the raw transcript and create meaningful content based on what was actually said.
IMPORTANT RULES:
1. If the transcript is just a test (like "test 1, 2, 3"), respond with the EXACT text the user said, not a generic message about testing.
2. Never add hashtags unless they were mentioned in the transcript.
3. Never invent content that wasn't in the original transcript.
4. Keep the same meaning and intent as the original transcript.
5. Remove filler words, stutters, and verbal pauses.
6. Make the text concise and suitable for posting on X.com.
7. NEVER use hyphens or dashes of any kind.`;

    // Build user context
    let userContext = "";
    if (userSettings.profileBio) {
      userContext += `My bio: "${userSettings.profileBio}".\n`;
    }
    if (userSettings.hashtags && userSettings.hashtags.length > 0) {
      userContext += `I often use hashtags like: ${userSettings.hashtags.join(", ")}.\n`;
    }

    const prompt = `Here is my voice transcript: "${transcript}"

Please polish this into a natural-sounding post while keeping the EXACT SAME meaning and content. If it's just a test phrase like "testing 1,2,3", just return the exact transcript without adding anything.`;

    console.log("[bg.js] Prompt for polishing voice transcript:", prompt);
    
    // Call OpenAI with the custom system message
    const polishedText = await callOpenAI(apiKey, prompt, tone, null, userSettings.profileBio || "", [], [], systemMessage);
    
    console.log("[bg.js] Polished transcript from AI:", polishedText);
    sendResponse({ polishedTranscript: polishedText });
  } catch (error) {
    console.error("[bg.js] Error during voice transcript processing:", error);
    sendResponse({ error: error.message || "Failed to process voice transcript." });
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
  formData.append("model", "whisper-1"); // Or 'whisper-1'
  formData.append('response_format', 'json'); // Default is json, can also be 'text'

  try {
    const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // 'Content-Type': 'multipart/form-data' is automatically set by browser for FormData
      },
      body: formData,
    });

    console.log("[Background] Transcription fetch status:", response.status);
    const data = await response.json();
    console.log("[Background] Transcription API returned:", data);
    if (!response.ok) {
      const errorMessage = data.error?.message || `HTTP error ${response.status}`;
      console.error("[Background] Transcription API error:", errorMessage);
      return { error: `OpenAI API Error: ${errorMessage}` };
    }
    console.log("[Background] Transcription successful, text:", data.text);
    return { transcript: data.text || "" };
  } catch (error) {
    console.error("[XCO-Poster BG] Error calling OpenAI Transcription API:", error);
    return { error: `Network or other error: ${error.message}` };
  }
}

// Process the AI response to extract multiple reply suggestions and contextual questions
function processAIResponse(response, replySeparator, questionSeparator) {
  if (!response) {
    return {
      replies: ["Sorry, I couldn't generate a reply."],
      questions: [
        "What points would you like to make about this?",
        "What perspective would you like to share on this topic?",
        "How might you contribute to this conversation?",
      ],
    };
  }

  // Initialize default result
  const result = {
    replies: [],
    questions: [
      "What points would you like to make about this?",
      "What perspective would you like to share on this topic?",
      "How might you contribute to this conversation?",
    ],
  };

  // Extract contextual questions if they exist
  if (response.includes(questionSeparator)) {
    console.log("[Background] Found question separator in response");
    // Split by questionSeparator - this handles cases where there might be multiple
    const parts = response.split(questionSeparator);
    const repliesSection = parts[0]; // First part is always replies
    // Concatenate all remaining parts for questions (in case there are multiple separators)
    const questionsSection = parts.slice(1).join("\n").trim();

    // Process replies from the first section
    if (repliesSection && repliesSection.includes(replySeparator)) {
      const replies = repliesSection
        .split(replySeparator)
        .map((reply) => reply.trim())
        .filter((reply) => reply.length > 0);

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
      if (
        questionsSection.includes("Question 1:") ||
        questionsSection.includes("Question 2:") ||
        questionsSection.includes("Question 3:") ||
        questionsSection.match(/Question\s+\d+:/i)
      ) {
        console.log("[Background] Found 'Question X:' formatted questions");
        // Extract questions with prefixes - improved pattern matching
        const questionPattern = /Question\s*\d+:?\s*([^\n]+)/gi;
        const matches = Array.from(questionsSection.matchAll(questionPattern));

        console.log("[Background] Found question matches:", matches.length);

        for (const match of matches) {
          if (match[1] && match[1].trim()) {
            questions.push(match[1].trim());
          }
        }
      } else {
        // From looking at the API responses, we need to handle multiple formats
        // Check for Question X formats after QUESTIONS_SEPARATOR
        if (
          questionsSection.match(/Question \d/i) ||
          questionsSection.match(/###Question \d/i)
        ) {
          // Extract questions by looking for Question pattern
          const questionPattern =
            /(?:###)?Question \d(?:###)?[^\S\r\n]*(.+?)(?=(?:###Question|$))/gis;
          const matches = [...questionsSection.matchAll(questionPattern)];

          if (matches && matches.length > 0) {
            for (const match of matches) {
              if (match[1] && match[1].trim()) {
                questions.push(match[1].trim());
              }
            }
          }
        }
        // Handle cases with multiple QUESTIONS_SEPARATOR markers
        else if (questionsSection.includes("QUESTIONS_SEPARATOR")) {
          // Split by the QUESTIONS_SEPARATOR marker
          const parts = questionsSection.split("QUESTIONS_SEPARATOR");
          for (const part of parts) {
            const clean = part.trim();
            if (clean && clean.length > 0 && clean.length < 200) {
              questions.push(clean);
            }
          }
        }
        // Standard processing - split by line breaks
        else {
          questions = questionsSection
            .split("\n")
            .map((q) => q.trim())
            .filter((q) => q.length > 0 && q.length < 200); // Avoid extremely long lines
        }
      }

      console.log("[Background] Extracted questions:", questions);

      if (questions.length > 0) {
        result.questions = questions.slice(0, 3);
      }
    }
  } else {
    // No question separator, just process replies
    if (response.includes(replySeparator)) {
      const replies = response
        .split(replySeparator)
        .map((reply) => reply.trim())
        .filter((reply) => reply.length > 0);

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
      "How might you contribute to this conversation?",
    ];
  }

  return result;
}

// Generate tweets based on news and user interests

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

/**
 * Handle a request to write a reply based on the user's prompt
 * @param {Object} contextTweet - The tweet being replied to
 * @param {string} userPrompt - The user's instructions for the reply
 * @returns {Promise<Object>} - Response with the generated reply and guiding questions
 */
async function handleWriteReplyRequest(contextTweet, userPrompt) {
  console.log("[Background] Handling Write Reply request:", { contextTweet, userPrompt });

  if (!contextTweet || !contextTweet.tweetText) {
    return { error: "Invalid tweet data. Cannot generate reply." };
  }

  try {
    // Construct prompt for writing a reply with guiding questions
    const prompt = `Write a reply to this tweet: "${contextTweet.tweetText}" by @${
      contextTweet.tweetAuthorHandle || "author"
    }.
    
    ${
      userPrompt
        ? `Follow these instructions: ${userPrompt}`
        : "Make the reply natural and conversational."
    }
    
    AFTER PROVIDING THE REPLY, include 3 thought-provoking questions to help the user brainstorm their own authentic reply. Separate these questions with '###QUESTIONS_SEPARATOR###' and format each as 'Question X: ...'`;

    // System message that ensures the reply is direct, natural, and avoids AI markers
    const systemMessage = `You are an expert at writing natural, conversational Twitter replies that sound like a real person. 
    
    CRITICAL INSTRUCTIONS:
    1. Write ONLY ONE reply that directly addresses the original tweet.
    2. DO NOT use hyphens or dashes of any kind (-, –, —). Use spaces instead.
    3. DO NOT use AI-typical phrases like "I understand," "I appreciate," "As an AI," etc.
    4. DO NOT add any hashtags or suggestions for hashtags.
    5. ENSURE the reply directly acknowledges specific points from the original tweet.
    6. MAKE the reply contextually dependent on the original tweet, not a standalone post.
    7. KEEP the reply concise and Twitter-appropriate in length.
    8. MATCH natural human writing patterns with varied sentence structures.
    9. AFTER the reply, include 3 thought-provoking questions to help the user brainstorm their own authentic reply. These should be open-ended questions that get the user thinking about the context, their personal experience, and potential unique angles for a reply.
    
    Your reply should sound like it was written by a real person responding naturally to the tweet.`;

    // Call OpenAI API
    const response = await callOpenAI(
      userSettings.apiKey,
      prompt,
      "conversational", // Use conversational tone for replies
      null, // No additional user instruction
      userSettings.profileBio || "",
      [], // No writing samples needed for simplified version
      [], // No liked tweets needed for simplified version
      systemMessage,
      "gpt-4.1-nano", // Use a suitable model
      0.7 // Temperature for some creativity but not too random
    );

    // Process the response to extract the reply and questions
    const processedResponse = processAIResponse(
      response,
      "###POST_SEPARATOR###",
      "###QUESTIONS_SEPARATOR###"
    );

    console.log("[Background] Raw AI response:", response);
    console.log("[Background] Processed response:", processedResponse);

    // Clean up the reply to ensure no hyphens/dashes
    const cleanedReply = processedResponse.replies[0]
      .replace(/[-\u2013\u2014]/g, " ")
      .replace(/\s+/g, " ");

    // Clean up the questions and remove formatting prefixes
    const cleanedQuestions = processedResponse.questions.map((question) => {
      // Remove "Question X:" prefixes and any other formatting artifacts
      return question.replace(/^Question \d+:\s*/i, "").trim();
    });

    console.log("[Background] Cleaned questions:", cleanedQuestions);

    return {
      reply: cleanedReply,
      guidingQuestions: cleanedQuestions,
    };
  } catch (error) {
    console.error("[Background] Error in handleWriteReplyRequest:", error);
    return { error: error.message || "Failed to generate reply" };
  }
}

/**
 * Handle a request to polish a draft reply
 * @param {Object} contextTweet - The tweet being replied to
 * @param {string} userDraft - The user's draft reply to polish
 * @returns {Promise<Object>} - Response with the polished reply variations
 */
async function handlePolishReplyRequest(contextTweet, userDraft) {
  console.log("[Background] Handling Polish Reply request:", { contextTweet, userDraft });

  if (!contextTweet || !contextTweet.tweetText) {
    return { error: "Invalid tweet data. Cannot polish reply." };
  }

  if (!userDraft || userDraft.trim().length === 0) {
    return { error: "No draft reply provided to polish." };
  }

  try {
    // Construct prompt for polishing a reply
    const prompt = `Polish this draft reply to the tweet: "${
      contextTweet.tweetText
    }" by @${contextTweet.tweetAuthorHandle || "author"}.
    
    My draft reply: "${userDraft}"
    
    Provide 3 polished variations of my draft reply, maintaining my core message and intent.`;

    // System message that ensures the polished replies maintain the user's intent
    const systemMessage = `You are an expert at polishing Twitter replies while maintaining the original intent and voice.
    
    CRITICAL INSTRUCTIONS:
    1. Provide EXACTLY 3 polished variations of the user's draft reply.
    2. PRESERVE the core meaning and intent of the original draft.
    3. DO NOT use hyphens or dashes of any kind (-, –, —). Use spaces instead.
    4. DO NOT add any hashtags or suggestions for hashtags.
    5. DO NOT change the fundamental message or opinion expressed in the draft.
    6. MAINTAIN the same level of formality/informality as the original.
    7. ENSURE each variation directly addresses the original tweet.
    8. SEPARATE each variation with "###VARIATION###".
    
    Your polished variations should sound like improved versions of what the user would naturally write.`;

    // Call OpenAI API
    const polishedText = await callOpenAI(
      userSettings.apiKey,
      prompt,
      "conversational", // Use conversational tone for replies
      null, // No additional user instruction
      userSettings.profileBio || "",
      [], // No writing samples needed for simplified version
      [], // No liked tweets needed for simplified version
      systemMessage,
      "gpt-4.1-nano", // Use a suitable model
      0.7 // Temperature for some creativity but not too random
    );

    // Process the response to extract variations
    const variations = polishedText
      .split("###VARIATION###")
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .map((v) => v.replace(/[-\u2013\u2014]/g, " ").replace(/\s+/g, " ")); // Clean up each variation

    return {
      reply: variations[0] || userDraft, // First variation as the main reply
      allReplies: variations.length > 0 ? variations : [userDraft], // All variations or just the original if none
      guidingQuestions: [], // Empty array for compatibility with existing UI
    };
  } catch (error) {
    console.error("[Background] Error in handlePolishReplyRequest:", error);
    return { error: error.message || "Failed to polish reply" };
  }
}

/**
 * Handle a request to write a post based on the user's prompt
 * @param {string} userPrompt - The user's instructions for the post
 * @returns {Promise<Object>} - Response with the generated post
 */
async function handleWritePostRequest(userPrompt) {
  console.log("[Background] Handling Write Post request:", { userPrompt });

  if (!userPrompt || userPrompt.trim().length === 0) {
    return { error: "No prompt provided for post generation." };
  }

  try {
    // Construct prompt for writing a post
    const prompt = `Write a Twitter post based on the following instructions: ${userPrompt}`;

    // System message that ensures the post is natural and avoids AI markers
    const systemMessage = `You are an expert at writing natural, engaging Twitter posts that sound like a real person.
    
    CRITICAL INSTRUCTIONS:
    1. Write ONLY ONE Twitter post based on the user's instructions.
    2. DO NOT use hyphens or dashes of any kind (-, –, —). Use spaces instead.
    3. DO NOT use AI-typical phrases like "I believe," "In my opinion," "As an AI," etc.
    4. DO NOT add any hashtags or suggestions for hashtags.
    5. KEEP the post concise and Twitter-appropriate in length (under 280 characters).
    6. MATCH natural human writing patterns with varied sentence structures.
    
    Your post should sound like it was written by a real person sharing their thoughts.`;

    // Call OpenAI API
    const post = await callOpenAI(
      userSettings.apiKey,
      prompt,
      "conversational", // Use conversational tone for posts
      null, // No additional user instruction
      userSettings.profileBio || "",
      [], // No writing samples needed for simplified version
      [], // No liked tweets needed for simplified version
      systemMessage,
      "gpt-4.1-nano", // Use a suitable model
      0.7 // Temperature for some creativity but not too random
    );

    // Clean up the post to ensure no hyphens/dashes
    const cleanedPost = post.replace(/[-\u2013\u2014]/g, " ").replace(/\s+/g, " ");

    return {
      ideas: [cleanedPost], // Return as an array for compatibility with existing UI
    };
  } catch (error) {
    console.error("[Background] Error in handleWritePostRequest:", error);
    return { error: error.message || "Failed to generate post" };
  }
}

/**
 * Handle a request to polish a draft post
 * @param {string} userDraft - The user's draft post to polish
 * @returns {Promise<Object>} - Response with the polished post variations
 */
async function handlePolishPostRequest(userDraft) {
  console.log("[Background] Handling Polish Post request:", { userDraft });

  if (!userDraft || userDraft.trim().length === 0) {
    return { error: "No draft post provided to polish." };
  }

  try {
    // Construct prompt for polishing a post
    const prompt = `Polish this draft Twitter post: "${userDraft}"
    
    Provide 3 polished variations of my draft post, maintaining my core message and intent.`;

    // System message that ensures the polished posts maintain the user's intent
    const systemMessage = `You are an expert at polishing Twitter posts while maintaining the original intent and voice.
    
    CRITICAL INSTRUCTIONS:
    1. Provide EXACTLY 3 polished variations of the user's draft post.
    2. PRESERVE the core meaning and intent of the original draft.
    3. DO NOT use hyphens or dashes of any kind (-, –, —). Use spaces instead.
    4. DO NOT add any hashtags or suggestions for hashtags.
    5. DO NOT change the fundamental message or opinion expressed in the draft.
    6. MAINTAIN the same level of formality/informality as the original.
    7. KEEP each variation concise and Twitter-appropriate in length (under 280 characters).
    8. SEPARATE each variation with "###VARIATION###".
    
    Your polished variations should sound like improved versions of what the user would naturally write.`;

    // Call OpenAI API
    const polishedText = await callOpenAI(
      userSettings.apiKey,
      prompt,
      "conversational", // Use conversational tone for posts
      null, // No additional user instruction
      userSettings.profileBio || "",
      [], // No writing samples needed for simplified version
      [], // No liked tweets needed for simplified version
      systemMessage,
      "gpt-4.1-nano", // Use a suitable model
      0.7 // Temperature for some creativity but not too random
    );

    // Process the response to extract variations
    const variations = polishedText
      .split("###VARIATION###")
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .map((v) => v.replace(/[-\u2013\u2014]/g, " ").replace(/\s+/g, " ")); // Clean up each variation

    return {
      ideas: variations.length > 0 ? variations : [userDraft], // All variations or just the original if none
    };
  } catch (error) {
    console.error("[Background] Error in handlePolishPostRequest:", error);
    return { error: error.message || "Failed to polish post" };
  }
}

// Handle generate questions request
async function handleGenerateQuestionsRequest(contextTweet) {
  console.log("[Background] Handling Generate Questions request:", contextTweet);
  if (!contextTweet || !contextTweet.tweetText) {
    return { error: "Invalid tweet data. Cannot generate questions." };
  }
  try {
    // Prompt to generate questions
    const prompt = `For this tweet: "${contextTweet.tweetText}", generate 3 thought-provoking questions to help the user craft an authentic reply. Format each as 'Question X: ...' and separate with '###QUESTIONS_SEPARATOR###'`;
    const systemMessage = `You are an assistant that generates open-ended, thought-provoking questions based on a tweet context. Output only the questions.`;
    const response = await callOpenAI(
      userSettings.apiKey,
      prompt,
      "neutral",
      null,
      userSettings.profileBio || "",
      [],
      [],
      systemMessage,
      "gpt-4.1-nano",
      0.5
    );
    const processed = processAIResponse(response, null, "###QUESTIONS_SEPARATOR###");
    const cleanedQuestions = processed.questions.map((q) =>
      q.replace(/^Question \d+:\s*/i, "").trim()
    );
    console.log("[Background] Generated questions:", cleanedQuestions);
    return { questions: cleanedQuestions };
  } catch (error) {
    console.error("[Background] Error in handleGenerateQuestionsRequest:", error);
    return { error: error.message || "Failed to generate questions" };
  }
}

// --- Add Message Listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Received message:", message);

  // Indicate that we will respond asynchronously
  let isAsync = false;

  switch (message.type) {
    case "WRITE_REPLY":
      handleWriteReplyRequest(message.contextTweet, message.userPrompt)
        .then((response) => {
          console.log("[Background] Sending WRITE_REPLY response:", response);
          sendResponse(response);
        })
        .catch((error) => {
          console.error("[Background] Error handling WRITE_REPLY:", error);
          sendResponse({ error: error.message || "Unknown error" });
        });
      isAsync = true; // Mark as async
      break;

    case "POLISH_REPLY":
      handlePolishReplyRequest(message.contextTweet, message.userDraft)
        .then((response) => {
          console.log("[Background] Sending POLISH_REPLY response:", response);
          sendResponse(response);
        })
        .catch((error) => {
          console.error("[Background] Error handling POLISH_REPLY:", error);
          sendResponse({ error: error.message || "Unknown error" });
        });
      isAsync = true; // Mark as async
      break;

    case "WRITE_POST":
      handleWritePostRequest(message.userPrompt)
        .then((response) => {
          console.log("[Background] Sending WRITE_POST response:", response);
          sendResponse(response);
        })
        .catch((error) => {
          console.error("[Background] Error handling WRITE_POST:", error);
          sendResponse({ error: error.message || "Unknown error" });
        });
      isAsync = true; // Mark as async
      break;

    case "POLISH_POST":
      handlePolishPostRequest(message.userDraft)
        .then((response) => {
          console.log("[Background] Sending POLISH_POST response:", response);
          sendResponse(response);
        })
        .catch((error) => {
          console.error("[Background] Error handling POLISH_POST:", error);
          sendResponse({ error: error.message || "Unknown error" });
        });
      isAsync = true; // Mark as async
      break;

    case "GENERATE_QUESTIONS":
      handleGenerateQuestionsRequest(message.contextTweet)
        .then((resp) => sendResponse(resp))
        .catch((err) => sendResponse({ error: err.message }));
      isAsync = true;
      break;

    case "TRANSCRIBE_AUDIO":
      console.log("[Background] Handling TRANSCRIBE_AUDIO message");
      (async () => {
        try {
          const apiKey = await getApiKey();
          if (!apiKey) {
            sendResponse({ error: "API key not set. Please configure your API key." });
            return;
          }
          console.log("[Background] Audio data length:", message.audioData.length);
          // Convert base64 to Blob
          const binary = atob(message.audioData);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const audioBlob = new Blob([bytes], { type: "audio/webm" });
          const result = await transcribeAudioWithOpenAI(audioBlob, apiKey);
          sendResponse(result);
        } catch (error) {
          console.error("[Background] Error in TRANSCRIBE_AUDIO handler:", error);
          sendResponse({ error: error.message || "Transcription failed." });
        }
      })();
      isAsync = true;
      break;

    case "POLISH_TRANSCRIPT":
      console.log("[Background] Handling POLISH_TRANSCRIPT message");
      handleProcessVoiceTranscript(message, sendResponse);
      isAsync = true;
      break;

    // Add other message types if needed

    default:
      console.log("[Background] Unhandled message type:", message.type);
      // Optionally send a response for unhandled types if needed
      // sendResponse({ error: "Unhandled message type" });
      break;
  }

  // Return true to indicate that sendResponse will be called asynchronously
  // This is crucial for keeping the message channel open for async operations
  return isAsync;
});
