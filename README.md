# Amazon Rating Enhancer

### Overview
**The Problem:** Ratings on Amazon are useful, but they could be *more* useful. We often look for listings with high volume, not just high ratings. A single 5-star review can misleadingly outrank a 4.8-star product supported by thousands of buyers.

**The Solution:** This extension uses **Bayesian adjustment** to calculate a refined score by weighting ratings against review counts. It injects dynamic, color-coded badges into search results and product pages based on **quantile ranking** to show how a product performs relative to its current competitors.

---

### Features
* **Adjusted-rating badges** on search results and product pages, color-coded by quantile rank so you can see at a glance how each product compares to its on-page competitors.
* **Sort by adjusted rating** — a floating **⇅ Adj sort** button (bottom-left on search pages) reorders the results best-first in a single click, so you no longer have to scroll the whole page hunting for the strong listings.
    * Products with no ratings sink to the bottom, and duplicate listings (e.g. a sponsored and organic copy of the same item) are shown once.
    * Fully reversible — click again to restore Amazon's original order. Your choice is remembered for the current tab.

---

### Installation
1. Download and unzip (if zipped) all repository contents into a single folder.
2. Navigate to `chrome://extensions` in your browser.
3. Enable **Developer Mode**.
4. Click **Load unpacked** and select the project folder.

### Usage
* Browse or search Amazon as usual — adjusted-rating badges appear automatically.
* On a search results page, click the **⇅ Adj sort** button in the bottom-left corner to toggle sorting by adjusted rating on and off.

### Compatibility
* **Browsers:** Chrome, Brave, Edge, and other Chromium based browsers.
* **Regions:** Supports 19 global Amazon domains:
    * **Americas:** `.com`, `.ca`, `.com.mx`, `.com.br`
    * **Europe:** `.co.uk`, `.de`, `.fr`, `.it`, `.es`, `.nl`, `.se`, `.pl`
    * **Asia-Pacific:** `.com.au`, `.co.jp`, `.in`, `.sg`
    * **Middle East:** `.ae`, `.sa`, `.com.tr`
