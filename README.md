# Amazon Rating Enhancer

### Overview
**The Problem:** Raw star ratings are statistically noisy. A single 5-star review can misleadingly outrank a 4.8-star product supported by thousands of buyers.

**The Solution:** This extension uses **Bayesian adjustment** to calculate a "true" score by weighting ratings against review counts. It injects dynamic, color-coded badges into search results and product pages based on **quantile ranking** to show how a product performs relative to its current competitors.

---

### Installation
1. Download and unzip the repository.
2. Navigate to `chrome://extensions` in your browser.
3. Enable **Developer Mode**.
4. Click **Load unpacked** and select the project folder.

### Compatibility
* **Browsers:** Chrome, Brave, Edge, and other Chromium browsers.
* **Regions:** Supports 19 global Amazon domains (e.g., .com, .au, .uk, .ca, .de, .jp)...
