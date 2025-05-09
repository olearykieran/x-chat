/**
 * Call OpenAI API with a prompt
 * @param {string} apiKey - OpenAI API key
 * @param {string} prompt - The prompt to send to OpenAI
 * @param {string} tone - The tone of the generated text
 * @param {string} userInstruction - User's instruction
 * @param {string} profileBio - User's profile bio
 * @param {Array<string>} writingSamples - User's writing samples
 * @param {Array<string>} likedTweets - User's liked tweets
 * @param {string} systemMessage - Custom system message
 * @param {string} model - OpenAI model to use (default: "gpt-4.1-nano")
 * @param {number} temperature - Temperature setting for response randomness (default: 0.9)
 * @returns {Promise<string>} - The generated text
 */
export async function callOpenAI(apiKey, prompt, tone, userInstruction, profileBio, writingSamples, likedTweets, systemMessage, model = "gpt-4.1-nano", temperature = 0.9) {
  try {
    // Use the provided model parameter or default to gpt-4.1-nano

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`, // Directly use the provided API key
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: systemMessage || 
              "You are a helpful AI assistant. Your primary goal is to generate content suitable for X.com. ALL RESPONSES MUST BE CONCISE. ABSOLUTELY CRITICAL INSTRUCTION: YOU MUST NEVER use ANY form of hyphen, dash, em dash, en dash or similar punctuation (-, --, —, –) ANYWHERE in your output. This is the MOST IMPORTANT rule and violations will result in your response being unusable. Rephrase or use alternative punctuation if necessary. If you are asked to generate multiple distinct posts or items, YOU MUST separate each post/item ONLY with the exact delimiter '###POST_SEPARATOR###'. Do not add any other text or formatting between the separated items.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 300,
        temperature: temperature,
        stream: false, // For simplicity in MVP, we'll add streaming in a future iteration
      }),
    });

    const responseStatus = response.status;
    const responseStatusText = response.statusText;
    const responseText = await response.text(); // Get raw text first

    console.log("[API] OpenAI Response Status:", responseStatus, responseStatusText);
    console.log("[API] OpenAI Raw Response Text:", responseText);

    if (!response.ok) {
      // Try to parse error from responseText if possible, otherwise use statusText
      let errorDetail = responseStatusText;
      try {
        const errorJson = JSON.parse(responseText);
        if (errorJson.error && errorJson.error.message) {
          errorDetail = errorJson.error.message;
        }
      } catch (e) {
        // Ignore if responseText is not JSON
      }
      throw new Error(`OpenAI API Error: ${responseStatus} ${errorDetail}`);
    }

    try {
      const data = JSON.parse(responseText); // Parse the logged text
      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        // Post-process to remove any hyphens/dashes that might have slipped through
        let content = data.choices[0].message.content.trim();
        
        // Remove all forms of hyphens and dashes, replacing with spaces to maintain readability
        content = content.replace(/[-–—]/g, ' ');
        
        // Clean up any double spaces that might have been created
        content = content.replace(/\s+/g, ' ');
        
        // Also clean up any AI-typical phrases that may have slipped through
        const aiPhrases = [
          'I understand', 'I appreciate', 'I\'d be happy to', 'as you mentioned',
          'I hope this helps', 'Let me know if', 'Feel free to'
        ];
        
        // Replace AI phrases with empty strings - they're usually at the start or end of sentences
        for (const phrase of aiPhrases) {
          content = content.replace(new RegExp(phrase + '[,.]?\\s*', 'gi'), '');
        }
        
        console.log("[API] Cleaned response content, removed hyphens/dashes and AI phrases");
        return content;
      } else {
        console.error("[API] OpenAI response missing expected data structure:", data);
        throw new Error("Invalid response structure from OpenAI API.");
      }
    } catch (e) {
      console.error("[API] Error parsing OpenAI JSON response:", e);
      console.error("[API] Raw response text that failed to parse:", responseText);
      throw new Error(`Failed to parse OpenAI response: ${e.message}`);
    }
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    throw error;
  }
}

/**
 * Fetch trending tech topics
 * @returns {Promise<Array>} - List of trending topics
 */
export async function fetchTrendingTopics() {
  try {
    // Try to get trending topics from the background script
    console.log("[API] Requesting trending topics");

    // Return a promise that sends a message to the background script
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "FETCH_REAL_TRENDING_TOPICS" }, (response) => {
        if (chrome.runtime.lastError) {
          console.log(
            "[API] Error fetching trending topics from background:",
            chrome.runtime.lastError.message
          );
          // Just return an empty array instead of fallback topics
          resolve([]);
          return;
        }

        if (response && response.trending && Array.isArray(response.trending)) {
          console.log("[API] Received trending topics:", response.trending);
          // Include the source information if available
          resolve(response.trending);
        } else {
          console.log("[API] Invalid or empty response from background script");
          // Return empty array instead of fallback
          resolve([]);
        }
      });

      // Set a timeout to handle cases where background script doesn't respond in time
      setTimeout(() => {
        console.log("[API] Trending topics request timed out");
        resolve([]);
      }, 5000); // 5 second timeout
    });
  } catch (error) {
    console.log("[API] Error in fetchTrendingTopics:", error.message);
    // Return empty array instead of fallback topics
    return [];
  }
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
    "Quantum computing milestones",
  ];
}

/**
 * Stream OpenAI responses (for future implementation)
 * @param {string} apiKey - OpenAI API key
 * @param {string} prompt - The prompt to send to OpenAI
 * @param {Function} onChunk - Callback for each text chunk
 * @returns {Promise<string>} - The complete generated text
 */
export async function streamOpenAI(apiKey, prompt, onChunk) {
  // This will be implemented in a future iteration
  // For now, we'll use the non-streaming version
  const result = await callOpenAI(apiKey, prompt, null, null, null, [], [], null, "gpt-4.1-nano", 0.8);
  onChunk(result);
  return result;
}

/**
 * Generate 5 scheduled posts based on user summary and persona.
 * @param {string} apiKey - OpenAI API key
 * @param {string} summary - User's daily summary.
 * @param {object} persona - User's persona (profileBio, hashtags, defaultTone).
 * @returns {Promise<Array<string>>} - Array of 5 generated post strings.
 */
/**
 * Generate 5 polished variations of a user's post idea
 * @param {string} apiKey - OpenAI API key
 * @param {string} userIdea - The user's raw post idea
 * @param {object} userProfile - User's profile data (bio, writing samples)
 * @param {string} tone - Desired tone for the posts
 * @returns {Promise<Array<string>>} - Array of 5 polished post variations
 */
export async function generatePolishedPosts(apiKey, userIdea, userProfile) {
  const { profileBio = "", writingSamples = [], tone = "neutral" } = userProfile;
  
  // Create prompt to generate polished posts from user's idea
  const prompt = `I have a post idea that I need help cleaning up. Please create 5 SLIGHT variations of my post, focusing on minor improvements in grammar, clarity, and conciseness without changing my meaning or style significantly.

My original post idea: "${userIdea}"

About me (to match my writing style): "${profileBio || "A social media user who values authentic expression."}"

Desired tone: ${tone}

Generation requirements:
1. Create 5 SLIGHT variations that are very close to my original text
2. Only make minor grammar, punctuation, and wording improvements
3. Keep my exact meaning, key phrases, and overall structure
4. DO NOT embellish, expand, or significantly rewrite my content
5. Each post must be under 280 characters
6. DO NOT use hashtags in any of the posts
7. Make the changes subtle - each variation should be at least 80% similar to my original text
8. Present each post separated ONLY by the delimiter '###POST_SEPARATOR###'
9. Do not add any numbering, labels, or other text before or after each post`;

  try {
    // Call OpenAI with the specially crafted prompt
    const response = await callOpenAI(
      apiKey,
      prompt,
      tone,
      null,
      profileBio,
      writingSamples,
      [],
      null,
      "gpt-4.1-nano",
      0.9
    );
    
    // Process the response to extract the individual posts
    let posts = response
      .split("###POST_SEPARATOR###")
      .map(post => post.trim())
      .filter(post => post.length > 0);
    
    // Ensure we have valid posts (handle potential formatting issues)
    if (posts.length === 0 && response.length > 0) {
      // Fallback if the separator wasn't used
      posts = response.split("\n\n")
        .map(post => post.trim())
        .filter(post => {
          // Filter out any lines that look like instructions or headings
          return post.length > 5 && 
                 !post.toLowerCase().includes("variation") &&
                 !post.toLowerCase().includes("post #");
        });
    }
    
    // Limit to 5 posts maximum
    return posts.slice(0, 5);
  } catch (error) {
    console.error("[API] Error generating polished posts:", error);
    throw error;
  }
}

export async function generateScheduledPosts(apiKey, summary, persona) {
  const { profileBio, hashtags, defaultTone } = persona; // hashtags will no longer be used in the prompt directly

  let prompt = `Given the following user summary for their day: "${summary}"

And their persona, which should heavily influence the writing style and tone of the generated posts:
- Writing Style Reference (Examples of their posts): "${
    profileBio ||
    "Not provided. In this case, use a general, engaging, and authentic social media style."
  }"
- Desired Tone: ${defaultTone || "neutral"}

Generate 5 distinct, engaging posts suitable for X.com based on the user's summary.
Key instructions for generation:
1. Strictly adhere to the Desired Tone.
2. Closely emulate the writing style found in the 'Writing Style Reference'. If no reference is provided, use a general, engaging, and authentic social media style.
3. Each post should be short, ideally under 280 characters.
4. IMPORTANT: DO NOT include any hashtags (words starting with #).
5. IMPORTANT: YOU MUST NOT use any hyphens (-) or double hyphens (--). This rule is critical.
6. Present each of the 5 posts separated ONLY by the delimiter '###POST_SEPARATOR###'. Do not add any other text, numbering, or formatting before or after the posts or the separator.`;

  try {
    const fullResponse = await callOpenAI(apiKey, prompt, defaultTone || "neutral", null, profileBio, [], [], null, "gpt-4.1-nano", 0.9);
    // Split the response into individual posts
    let posts = fullResponse
      .split("###POST_SEPARATOR###")
      .map((post) => {
        // Remove potential numbering like "1. ", "2. " etc.
        let cleanedPost = post.replace(/^\d+\.\s*/, "");
        // Aggressively remove hyphens as per user preference
        cleanedPost = cleanedPost.replace(/--|-/g, " "); // Replace with space
        // Trim whitespace
        return cleanedPost.trim();
      })
      .filter((post) => post.length > 0);

    // Fallback if the primary separator wasn't used effectively or resulted in too few posts
    if (posts.length < 5 && fullResponse.includes("\n\n")) {
      console.warn(
        '[API] Primary separator "###POST_SEPARATOR###" yielded less than 5 posts. Attempting fallback split by double newline.'
      );
      posts = fullResponse
        .split("\n\n")
        .map((post) => {
          let cleanedPost = post.replace(/^\d+\.\s*/, "");
          cleanedPost = cleanedPost.replace(/--|-/g, " ");
          return cleanedPost.trim();
        })
        .filter((post) => post.length > 0);
    }

    if (posts.length > 5) {
      console.warn(
        `[API] Expected 5 posts, but got ${posts.length}. Returning the first 5.`
      );
      return posts.slice(0, 5);
    }
    if (posts.length < 5) {
      console.warn(
        `[API] Expected 5 posts, but only generated ${posts.length} valid posts after parsing. Raw response: ${fullResponse}`
      );
      // The UI will need to handle displaying fewer than 5 if this happens.
      // For now, we return what we have, even if it's less than 5, to prioritize quality over padding.
    }
    return posts; // Return the (up to) 5 cleaned posts
  } catch (error) {
    console.error("Error generating scheduled posts:", error);
    throw error; // Re-throw the error to be handled by the caller
  }
}
