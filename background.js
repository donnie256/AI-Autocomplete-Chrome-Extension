chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📩 Message received in background.js:", message);

  if (message.action === "testMessage") {
    console.log("✅ Test message received!");
    sendResponse({ status: "Background script is active!" });
    return true; // Keeps the message channel open
  }

  if (message.action === "fetchSuggestion") {
    chrome.storage.local.get("OPENROUTER_API_KEY", (data) => {
      if (!data.OPENROUTER_API_KEY) {
        console.error("❌ API key not found in storage!");
        sendResponse({ suggestion: "" }); // Always send a response
        return;
      }

      fetchSuggestionFromAPI(message.text, message.metadata, data.OPENROUTER_API_KEY)
        .then((suggestion) => {
          console.log("✅ API Response:", suggestion);
          sendResponse({ suggestion: suggestion || "" }); // Ensure valid response
        })
        .catch((error) => {
          console.error("❌ API request failed:", error);
          sendResponse({ suggestion: "" }); // Ensure an empty fallback response
        });

    });

    return true; // ✅ Keeps the message channel open for async calls
  }


  if (message.action === "getTabMetadata") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        console.warn("⚠️ No active tab found.");
        sendResponse({ title: "", url: "" });
      } else {
        const tab = tabs[0];
        console.log("🌍 Tab Metadata:", tab.title, tab.url);
        sendResponse({ title: tab.title, url: tab.url });
      }
    });

    return true;
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
              model: "cognitivecomputations/dolphin3.0-mistral-24b:free",
              messages: [
                  { "role": "system", "content": `The user is on a page titled "${metadata.title}" with URL "${metadata.url}". Complete the following sentence based on context.` },
                  { "role": "user", "content": text }
              ],
              temperature: 0.5,
              max_tokens: 50,
              stream: false
          })
      });

      if (!response.ok) throw new Error(`API error: ${response.status} ${response.statusText}`);

      const result = await response.json();
      return result.choices?.[0]?.message?.content?.trim() || '';
  } catch (error) {
      console.error("❌ API request failed:", error);
      return '';
  }
};
