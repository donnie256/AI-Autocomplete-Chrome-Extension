// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchSuggestion") {
    // Retrieve API key securely from Chrome Storage
    chrome.storage.local.get("OPENROUTER_API_KEY", (data) => {
      if (!data.OPENROUTER_API_KEY) {
        console.error("❌ API key not found! Set it manually in Chrome storage.");
        sendResponse({ suggestion: "" }); // Ensure sendResponse is always called
        return;
      }

      // Fetch suggestion with API key
      fetchSuggestionFromAPI(message.text, message.metadata, data.OPENROUTER_API_KEY)
        .then(suggestion => {
          sendResponse({ suggestion }); // Ensure response is sent
        })
        .catch(error => {
          console.error("❌ Error fetching suggestion:", error);
          sendResponse({ suggestion: "" });
        });
    });

    return true; // ✅ Keeps the connection open for asynchronous response
  }

  if (message.action === "getTabMetadata") {
    // Get the active tab's title and URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ title: "", url: "" });
      } else {
        const tab = tabs[0];
        sendResponse({ title: tab.title, url: tab.url });
      }
    });

    return true; // ✅ Keeps the connection open for asynchronous response
  }
});


// Function to fetch suggestion from OpenRouter API with metadata
const fetchSuggestionFromAPI = async (text, metadata, apiKey) => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-thinking-exp:free",
        messages: [
          { "role": "system", "content": `The user is on a page titled "${metadata.title}" with URL "${metadata.url}". Complete the following sentence based on context.` },
          { "role": "user", "content": text }
        ],
        temperature: 0.5,
        max_tokens: 50,
        stream: false
      })
    });

    const result = await response.json();
    return result.choices?.[0]?.message?.content?.trim() || '';
  } catch (error) {
    console.error("❌ API request failed:", error);
    return '';
  }
};
