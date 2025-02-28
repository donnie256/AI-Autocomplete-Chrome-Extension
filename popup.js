document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggleAutocomplete');
    // Retrieve the saved state from chrome.storage
    chrome.storage.sync.get('autocompleteEnabled', (data) => {
      toggle.checked = data.autocompleteEnabled || false;
    });
  
    // Listen for toggle changes
    toggle.addEventListener('change', () => {
      chrome.storage.sync.set({ autocompleteEnabled: toggle.checked });
    });
  });
  