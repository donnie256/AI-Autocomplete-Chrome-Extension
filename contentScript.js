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
    ghost = document.createElement('div');
    ghost.className = 'ghost-text';

    // Ensure parent is correctly positioned
    const parentStyle = window.getComputedStyle(input.parentElement);
    if (parentStyle.position === 'static') {
      input.parentElement.style.position = 'relative'; // Prevents misalignment
    }

    // Ghost text should match input field styling
    ghost.style.position = 'absolute';
    ghost.style.pointerEvents = 'none';
    ghost.style.color = 'rgba(150, 150, 150, 0.7)'; // Light gray suggestion text
    ghost.style.whiteSpace = 'pre-wrap';
    ghost.style.overflow = 'hidden';
    ghost.style.fontFamily = window.getComputedStyle(input).fontFamily;
    ghost.style.fontSize = window.getComputedStyle(input).fontSize;
    ghost.style.lineHeight = window.getComputedStyle(input).lineHeight;
    ghost.style.padding = window.getComputedStyle(input).padding;
    ghost.style.margin = window.getComputedStyle(input).margin;
    ghost.style.background = 'transparent';
    ghost.style.zIndex = '1';

    // **Fix alignment issues**
    ghost.style.left = `${input.offsetLeft}px`;
    ghost.style.top = `${input.offsetTop}px`;
    ghost.style.width = `${input.offsetWidth}px`;
    ghost.style.height = `${input.offsetHeight}px`;

    input.parentElement.appendChild(ghost);
  }

  // **Only display suggested text, not what is already typed**
  const cursorPosition = input.selectionStart || 0;
  const ghostText = suggestion.slice(cursorPosition); // AI suggestion after cursor

  console.log("🔍 Cursor Position:", cursorPosition);
  console.log("👻 Ghost Text Suggestion:", ghostText);

  // **Ensure ghost text only shows the AI-generated suggestion**
  ghost.textContent = ghostText ? ghostText : "";
};



// Attach event listeners to inputs
const addListeners = (input) => {
  let currentSuggestion = '';

  const debouncedFetch = debounce(async () => {
    const text = input.value.trim();
    if (text !== '') {
      currentSuggestion = await fetchSuggestion(text);
      console.log("💡 Current Suggestion:", currentSuggestion);
      if (currentSuggestion) {
        createGhostTextOverlay(input, currentSuggestion);
      }
    }
  }, 1500);

  input.addEventListener('input', () => {
    debouncedFetch(); // Trigger autocomplete after every new input
  });

  input.addEventListener('keydown', (e) => {
    console.log("🖮 Key Pressed:", e.key); // Log key presses

    if (e.key === 'Tab') {
      e.preventDefault(); // Stop default browser tab behavior
      console.log("✅ Tab key intercepted and prevented default behavior.");

      if (currentSuggestion && currentSuggestion.startsWith(input.value)) {
        console.log("✅ Tab pressed - Applying Suggestion:", currentSuggestion);

        input.value = currentSuggestion; // Apply the suggestion

        // Remove ghost text after accepting the suggestion
        let ghost = input.parentElement.querySelector('.ghost-text');
        if (ghost) ghost.remove();

        // 🔥 Fetch a new suggestion after applying the previous one
        setTimeout(() => debouncedFetch(), 300);
      }
    }
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
