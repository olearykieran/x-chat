# Comprehensive Plan: Enhancing Compose Tab Functionality

**Overall Goal:** Refine the "Compose" tab's tweet and question generation to significantly improve personalization (voice, style), content quality (search, topics), question utility, and fix data ingestion issues. All generated tweets must be free of hashtags and hyphens.

## I. Voice & Writing Style Personalization

**Objective:** Make generated tweets closely emulate the user's unique writing style, tone, vocabulary, and sentence structure.

1.  **Fix User Liked Data Ingestion:**

    - **Task:** Diagnose and resolve the `TypeError: Cannot read properties of undefined (reading 'likedTweets')` occurring in `generateTweetsWithNews`.
    - **Details:** Ensure that `userLikedTopicsRaw` (or a similar variable representing user's own posts/replies if 'likedTweets' refers to tweets they liked by others) is correctly populated from storage within `generateTweetsWithNews` or that the correct data source is accessed.
    - **Verification:** Confirm via logging that user's posts/replies data is successfully loaded and available for topic/style analysis.

2.  **Enhance AI Prompt for Voice Matching in `generateTweetsWithNews`:**
    - **Task:** Modify the main AI prompt sent to `callOpenAI`.
    - **Details:**
      - Explicitly instruct the AI to prioritize and meticulously match the user's writing style, tone, vocabulary, sentence structure, and overall voice.
      - The prompt must state that `userSettings.profileBio` AND the collection of the user's own past tweets/replies (once correctly ingested, e.g., `userWritingSamples` or `userLikedTopicsRaw` if it contains their own content) are the **primary references** for the desired output style.
      - This instruction should be as strong and clear as any similar voice-matching instructions used in other parts of the application (e.g., reply generation).
    - **Verification:** Generated tweets should qualitatively sound much more like the user and less generic/robotic.

## II. Output Formatting: No Hashtags or Hyphens

**Objective:** Ensure all generated tweets are clean and free of unwanted hashtags and hyphens.

1.  **Explicit No-Hashtag Instruction in Prompt:**

    - **Task:** Update the AI prompt in `generateTweetsWithNews`.
    - **Details:** Remove any existing instruction that might encourage hashtags. Add a new, unequivocal instruction: `"DO NOT use any hashtags in the generated tweets. Tweets must be completely free of hashtags."`
    - **Verification:** Generated tweets must not contain any `#` symbols.

2.  **Post-Processing to Remove Hyphens:**
    - **Task:** Implement or refine a post-processing step after AI generation but before displaying tweets.
    - **Details:** The `removeHyphens` function (mentioned in logs as `cleanedTweets = processedResponse.replies.map((tweet) => removeHyphens(tweet));`) should be robustly applied to all generated tweet suggestions to remove all instances of hyphens (`-`). This includes hyphens used for emphasis, lists, or compound words if the goal is complete removal.
    - **Verification:** Generated tweets must not contain any `-` symbols.

## III. Improving Guiding Questions

**Objective:** Make the 3 guiding questions significantly more insightful, specific, and genuinely helpful for brainstorming unique post ideas.

1.  **Revamp AI Prompt for Question Generation:**
    - **Task:** Modify the section of the AI prompt in `generateTweetsWithNews` that requests guiding questions.
    - **Details:**
      - Instruct the AI to generate questions that are deeply contextualized by the `newsContext` and the `combinedTopics` (user's interests).
      - Demand questions that are specific, non-obvious, and designed to spark deeper thought or unique angles, rather than generic prompts.
      - Provide new, better examples of the _type_ of insightful questions desired, focusing on stimulating creativity (e.g., "How might [specific aspect of news] challenge a common assumption in [user_topic]?" or "What's an overlooked connection between [user_interest_A] and [recent_event_from_news]?").
      - Emphasize avoiding generic templates like "What's your take on X?" unless X is highly specific and the question probes a unique angle.
    - **Verification:** Generated questions should be noticeably more tailored, thought-provoking, and less generic.

## IV. Enhancing Web Search & Topic Discovery

**Objective:** Improve the relevance and quality of information used for news context by refining the web search and topic discovery process.

1.  **Refine Web Search Prompt & Model (Consider `gpt-4.1-mini`):**

    - **Task:** Modify the `searchWeb` function or how it's called within `generateTweetsWithNews`.
    - **Details:**
      - The prompt used within `searchWeb` (which itself calls `callOpenAI`) needs to be optimized for retrieving concise, relevant summaries of current news or information related to the `searchQuery` (user's combined topics).
      - It should specifically ask for **5 distinct, current trending topics/news items** related to the input query, ensuring diversity in the results.
      - Evaluate using `gpt-4.1-mini` (or a similar capable and cost-effective model available via `callOpenAI`) specifically for the `searchWeb` task if it's expected to yield better summarization or factual retrieval for search-like queries compared to the default model used for creative generation. This involves passing the desired model name to `callOpenAI` from `searchWeb`.
    - **Verification:** The `newsContext` logged should contain 5 distinct and relevant news items/topics, and its quality should be subjectively better.

2.  **Ensure Correct `fetchTrendingTopics` Usage (if still applicable):**
    - **Task:** Review how `fetchTrendingTopics` is integrated, especially in light of the `searchWeb` enhancement.
    - **Details:** If `searchWeb` is now tasked with getting 5 diverse topics, the role of a separate `fetchTrendingTopics` might need to be re-evaluated or made supplementary. Ensure it doesn't lead to redundant or conflicting information. The logs showed `Trending topics request timed out`, which also needs to be addressed if this function remains critical.
    - **Verification:** Topic discovery should be robust and provide a good foundation for tweet generation.

## V. Implementation & Verification Workflow

1.  **Iterative Changes:** Implement changes section by section (e.g., I, then II, etc.).
2.  **Logging:** Maintain and enhance logging (as previously implemented) to monitor the inputs and outputs of key functions (`extractTopicsFromBio`, `analyzeLikedPosts`, `searchWeb`, `generateTweetsWithNews`, `callOpenAI`).
3.  **Testing:** After each significant change:
    - Reload the extension.
    - Trigger the Compose tab functionality multiple times with varied user bio/settings.
    - Review console logs for expected data flow and values.
    - Critically assess the quality of generated tweets (voice, style, no hashtags/hyphens) and guiding questions.
    - Ensure other functionalities (e.g., Reply tab) remain unaffected.

By systematically addressing these areas, the Compose tab should provide a significantly more valuable and personalized experience.
