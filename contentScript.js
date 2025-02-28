let isAutocompleteEnabled = false;
let observer;

// Function to request page metadata
const fetchPageMetadata = async () => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getTabMetadata" }, (response) => {
      resolve(response);
    });
  });
};

// Function to request autocompletion from the background script
const fetchSuggestion = async (text) => {
  return new Promise(async (resolve) => {
    const metadata = await fetchPageMetadata();
    chrome.runtime.sendMessage({ action: "fetchSuggestion", text, metadata }, (response) => {
      resolve(response.suggestion);
    });
  });
};

// Debounce function to reduce API calls (2-second delay)
const debounce = (func, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
};

// Function to create or update ghost text overlay
const createGhostTextOverlay = (input, suggestion, cursorPosition) => {
  let ghost = input.parentElement.querySelector('.ghost-text');
  if (!ghost) {
    ghost = document.createElement('div');
    ghost.className = 'ghost-text';
    ghost.style.position = 'absolute';
    ghost.style.pointerEvents = 'none';
    ghost.style.color = '#ccc';
    ghost.style.fontFamily = window.getComputedStyle(input).fontFamily;
    ghost.style.fontSize = window.getComputedStyle(input).fontSize;
    ghost.style.left = input.offsetLeft + 'px';
    ghost.style.top = input.offsetTop + 'px';
    ghost.style.padding = window.getComputedStyle(input).padding;
    input.parentElement.style.position = 'relative';
    input.parentElement.appendChild(ghost);
  }

  // Show only the part of the suggestion after the cursor position
  ghost.textContent = input.value.substring(0, cursorPosition) + suggestion.slice(cursorPosition);
};

// Attach event listeners to inputs
const addListeners = (input) => {
  if (!isAutocompleteEnabled) return;

  let currentSuggestion = '';
  let cursorPosition = 0;
  let lastInputValue = ''; // Store last input value

  const debouncedFetch = debounce(async () => {
    if (!isAutocompleteEnabled) return;
    const text = input.value.trim();

    if (text !== '' && text !== lastInputValue) {
      lastInputValue = text;
      currentSuggestion = await fetchSuggestion(text);
      if (currentSuggestion) {
        createGhostTextOverlay(input, currentSuggestion, cursorPosition);
      }
    }
  }, 2000);

  input.addEventListener('input', (e) => {
    cursorPosition = e.target.selectionStart;
    debouncedFetch();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && currentSuggestion.startsWith(input.value)) {
      e.preventDefault();
      input.value = currentSuggestion;
      let ghost = input.parentElement.querySelector('.ghost-text');
      if (ghost) ghost.remove();
    }

    // Remove ghost text if user keeps typing
    if (e.key.length === 1) {
      let ghost = input.parentElement.querySelector('.ghost-text');
      if (ghost) ghost.remove();
    }
  });
};

// Initialize autocomplete
const initAutocomplete = () => {
  chrome.storage.sync.get('autocompleteEnabled', (data) => {
    isAutocompleteEnabled = data.autocompleteEnabled || false;
    if (isAutocompleteEnabled) {
      document.querySelectorAll('input[type="text"], textarea').forEach(addListeners);
      startObserver();
    }
  });
};

// Start observing the DOM for dynamically added input fields
const startObserver = () => {
  if (observer) observer.disconnect();
  observer = new MutationObserver((mutations) => {
    if (!isAutocompleteEnabled) return;
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.matches?.('input[type="text"], textarea')) addListeners(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
};

// Listen for toggle changes in real-time
chrome.storage.onChanged.addListener((changes) => {
  if ('autocompleteEnabled' in changes) {
    isAutocompleteEnabled = changes.autocompleteEnabled.newValue;

    if (!isAutocompleteEnabled) {
      console.log("🚫 Autocompletion Disabled");
      if (observer) observer.disconnect(); // Stop observing DOM changes
      document.querySelectorAll('input[type="text"], textarea').forEach((input) => {
        input.removeEventListener('input', addListeners);
        input.removeEventListener('keydown', addListeners);
        let ghost = input.parentElement.querySelector('.ghost-text');
        if (ghost) ghost.remove();
      });
    } else {
      console.log("✅ Autocompletion Enabled");
      initAutocomplete();
    }
  }
});

// Ensure script runs after the page fully loads
if (document.readyState === "complete") {
  initAutocomplete();
} else {
  window.addEventListener("load", initAutocomplete);
}
