# Plan: Enhancing Compose Tab Tweet Generation

## 1. Understand Existing Data Flow for Compose Tab

*   **Objective:** Identify precisely how user data (bio, posts, replies, liked content) is accessed and used for generating tweet suggestions specifically in the Compose tab.
*   **Data Storage Summary:**
    *   User data (bio, `userWritingSamples` for posts/tweets, `userReplies`, `userLikedTopicsRaw` for liked tweet content) is primarily stored using `chrome.storage.local`.
    *   Key scripts: `bg.js` (central data handling, AI interaction), `src/contentScript.js` (scraping), `src/ui/components/App.js` & `src/ui/state.js` (UI, state management).
*   **Action:**
    *   Confirm the primary function in `bg.js` called by `App.js` (likely `handleGenerateTweetsWithNews`) for Compose tab tweet generation. Based on memory, this is `generateTweetsWithNews` and potentially `generateTweetIdeas`.
    *   Analyze these functions in `bg.js` to understand how `userWritingSamples`, `userReplies`, and `profileBio` are currently incorporated into AI prompts for the Compose tab.

## 2. Enhance Tone and Writing Style Matching

*   **Objective:** Modify AI prompts to heavily leverage the user's historical posts and replies, enabling the AI to learn and mimic their specific tone, vocabulary, sentence structure, and common phrases.
*   **Actions (in `bg.js` for relevant functions):**
    *   Ensure a comprehensive and representative set of examples from `userWritingSamples` and `userReplies` is passed to the AI. Implement a selection strategy if necessary to manage token limits (e.g., most recent, most engaged).
    *   Update the system prompt to explicitly instruct the AI to:
        *   "Thoroughly analyze the provided writing samples (user's past tweets and replies)."
        *   "Emulate the user's distinct writing style, including word choice, sentence complexity, typical use of punctuation, and overall tone."
        *   "The goal is to generate tweets that sound authentically like they were written by the user."
        *   "Pay close attention to recurring phrases, aversions, and preferences evident in the user's writing history."

## 3. Disable Hashtag Suggestions

*   **Objective:** Strictly prevent the AI from suggesting or including hashtags in any tweet generated for the Compose tab.
*   **Actions (in `bg.js` for relevant functions):**
    *   Add a direct and unambiguous instruction to the system prompt: "**CRITICAL INSTRUCTION: Absolutely DO NOT use or suggest any hashtags in the generated tweet suggestions for the Compose tab, regardless of any other settings or past user behavior.**"
    *   Review and explicitly override any existing logic that might attempt to add hashtags based on `userSettings.hashtags` or analyze content for potential hashtags when generating for the Compose tab. The functions `generateReply` and `generateTweetIdeas` already have some logic to avoid hashtags, but this needs to be an absolute prohibition for Compose.

## 4. Improve Guiding Questions

*   **Objective:** Make the guiding questions more insightful, creative, and better aligned with the user's typical content themes and style, prompting unique tweet ideas.
*   **Actions (in `bg.js`, likely within `generateTweetsWithNews` or `generateTweetIdeas` or a dedicated question-generation function):**
    *   Identify/Confirm the function in `bg.js` responsible for generating these guiding questions.
    *   Update the prompt for question generation to:
        *   "Based on the user's provided bio, past tweets (`userWritingSamples`), replies (`userReplies`), and liked content (`userLikedTopicsRaw`), generate 3 open-ended, thought-provoking questions."
        *   "These questions should inspire the user to brainstorm their own tweet content that reflects their unique perspective, interests, and typical style."
        *   "The questions should encourage reflection, creativity, or commentary on topics relevant to the user."
        *   "Avoid generic questions. Aim for specificity and relevance to the user's established voice and content themes."

## 5. Execution Order

*   First, thoroughly analyze `bg.js` (specifically functions like `generateTweetsWithNews`, `generateTweetIdeas`, and any related helper functions) to confirm how user data is currently used in prompts for the Compose tab.
*   Implement changes related to disabling hashtags (Section 3).
*   Implement changes to enhance tone and style matching (Section 2).
*   Implement changes to improve guiding questions (Section 4).
*   Test thoroughly after each major change.