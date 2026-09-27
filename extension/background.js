const CLEAR_URL = 'http://127.0.0.1:4444/clear';

function sendClear() {
  fetch(CLEAR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => {});
}

function isYouTubeTab(tab) {
  return !!(tab && tab.url && /^https:\/\/www\.youtube\.com\//.test(tab.url));
}

function clearIfNoYouTubeTabsLeft() {
  chrome.tabs.query({}, (tabs) => {
    if (!tabs.some(isYouTubeTab)) sendClear();
  });
}

chrome.tabs.onRemoved.addListener(clearIfNoYouTubeTabsLeft);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab && tab.url && !isYouTubeTab(tab)) {
    clearIfNoYouTubeTabsLeft();
  }
});