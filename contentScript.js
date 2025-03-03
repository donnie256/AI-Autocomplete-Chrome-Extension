console.log("🚀 Content script is running!");

chrome.runtime.sendMessage({ action: "testMessage" }, (response) => {
  if (chrome.runtime.lastError) {
    console.error("❌ Message failed:", chrome.runtime.lastError);
  } else {
    console.log("📩 Response from background:", response);
  }
});


// Function to request page metadata
const fetchPageMetadata = async () => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "getTabMetadata" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("❌ Failed to fetch metadata:", chrome.runtime.lastError);
        reject(new Error("Extension context invalidated."));
        return;
      }
      resolve(response);
    });
  });
};

// Function to request autocompletion from the background script
const fetchSuggestion = async (text) => {
  return new Promise(async (resolve) => {
    try {
      const metadata = await fetchPageMetadata();
      console.log("🔎 Metadata fetched:", metadata);

      chrome.runtime.sendMessage({ action: "fetchSuggestion", text, metadata }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("❌ Message failed:", chrome.runtime.lastError);
          resolve(""); // Ensure we return an empty string instead of undefined
          return;
        }
        console.log("📩 Suggestion response received:", response);

        if (!response || !response.suggestion) {
          console.warn("⚠️ No suggestion found in response:", response);
          resolve(""); // Prevent undefined values
          return;
        }

        resolve(response.suggestion);
      });
    } catch (error) {
      console.error("❌ Error in fetchSuggestion:", error);
      resolve(""); // Prevent undefined values
    }
  });
};


// Debounce function to reduce API calls (500ms delay for testing)
const debounce = (func, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
};

// Function to create or update ghost text overlay
const createGhostTextOverlay = (input, suggestion) => {
  let ghost = input.parentElement.querySelector('.ghost-text');

  if (!ghost) {
    console.log("🆕 Creating new ghost text overlay.");
    ghost = document.createElement('span');
    ghost.className = 'ghost-text';

    // Match the input field styling
    ghost.style.position = 'absolute';
    ghost.style.pointerEvents = 'none';
    ghost.style.color = 'rgba(150, 150, 150, 0.7)'; 
    ghost.style.fontFamily = window.getComputedStyle(input).fontFamily;
    ghost.style.fontSize = window.getComputedStyle(input).fontSize;
    ghost.style.lineHeight = window.getComputedStyle(input).lineHeight;
    ghost.style.whiteSpace = 'pre-wrap';
    ghost.style.background = 'transparent';
    ghost.style.opacity = '0.8';

    // Align ghost text correctly inside input field
    ghost.style.left = `${input.offsetLeft}px`;
    ghost.style.top = `${input.offsetTop}px`;
    ghost.style.width = `${input.clientWidth}px`;
    ghost.style.height = `${input.clientHeight}px`;

    input.parentElement.appendChild(ghost);
  }

  // **Only display the suggested part, not user input**
  const userText = input.value;
  const ghostText = suggestion.startsWith(userText) ? suggestion.slice(userText.length) : '';

  console.log("👻 Ghost Text Updated:", ghostText);

  // **Ensure ghost text only shows the AI-generated suggestion**
  ghost.textContent = ghostText || "";
};




// Attach event listeners to inputs
const addListeners = (input) => {
  let currentSuggestion = '';

  // ✅ Define Debounced Fetch Function
  const debouncedFetch = debounce(async () => {
    const text = input.value.trim();
    if (text !== '') {
      currentSuggestion = await fetchSuggestion(text);
      console.log("💡 Updated Suggestion:", currentSuggestion);

      if (currentSuggestion) {
        createGhostTextOverlay(input, currentSuggestion);
      }
    }
  }, 1500); // Adjusted debounce time for responsiveness

  // ✅ Handle Input Changes (Triggers Suggestions Dynamically)
  input.addEventListener('input', () => {
    debouncedFetch(); // 🔥 Ensure new suggestions are retrieved while typing

    // 🛑 **Fix: Prevent ghost text from disappearing too soon**
    let ghost = input.parentElement.querySelector('.ghost-text');
    if (ghost && input.value.length === 0) {
      console.log("❌ Removing ghost text because input is empty.");
      ghost.remove();
    }
  });

  // ✅ Handle Keydown Events
  input.addEventListener('keydown', async (e) => {
    console.log("🖮 Key Pressed:", e.key);

    // 🛑 **Fix: Remove ghost text if user presses a normal key**
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') {
      let ghost = input.parentElement.querySelector('.ghost-text');
      if (ghost) {
        console.log("❌ Removing ghost text due to key press.");
        ghost.remove();
      }
    }

    // ✅ Handle Tab Key to Accept Suggestion
    if (e.key === 'Tab') {
      e.preventDefault();
      console.log("✅ Tab key detected.");

      if (currentSuggestion && currentSuggestion.startsWith(input.value)) {
        console.log("✅ Tab pressed - Applying Suggestion:", currentSuggestion);

        input.value = currentSuggestion; // Apply the suggestion

        // Remove ghost text after accepting the suggestion
        let ghost = input.parentElement.querySelector('.ghost-text');
        if (ghost) {
          console.log("❌ Removing ghost text after Tab key.");
          ghost.remove();
        }

        // 🔄 **Fix: Immediately fetch a new suggestion after Tab**
        console.log("🔄 Fetching new suggestion after Tab...");
        setTimeout(() => debouncedFetch(), 200);
      } else {
        console.warn("⚠️ No valid suggestion available when Tab was pressed.");
      }
    }
  });

  // ✅ Ensure a new suggestion appears when focusing on the input field
  input.addEventListener("focus", () => {
    debouncedFetch();
  });
};



document.addEventListener("focusin", (event) => {
  const input = event.target;
  if (input.matches('input[type="text"], textarea')) {
    if (!input.dataset.autocompleteEnabled) { // Prevent duplicate listeners
      input.dataset.autocompleteEnabled = "true"; 
      addListeners(input);
    }
  }
});


// Observe the DOM for dynamically added input fields
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.matches?.('input[type="text"], textarea')) {
        console.log("🆕 New input field detected:", node);

        // Force re-enable autocomplete for new inputs
        node.dataset.autocompleteEnabled = "false";

        node.addEventListener("focus", () => {
          if (!node.dataset.autocompleteEnabled) {
            node.dataset.autocompleteEnabled = "true";
            addListeners(node);
          }
        }, { once: true });
      }
    });
  });
});

// Restart observer every time a suggestion is applied
const restartObserver = () => {
  observer.disconnect();
  observer.observe(document.body, { childList: true, subtree: true });
};

restartObserver();
