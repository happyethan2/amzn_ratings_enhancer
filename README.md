# Amazon Rating Enhancer

### Overview
**The Problem:** Ratings on Amazon are useful, but they could be *more* useful. We often look for listings with high volume, not just high ratings. A single 5-star review can misleadingly outrank a 4.8-star product supported by thousands of buyers.

**The Solution:** This extension uses **Bayesian adjustment** to calculate a refined score by weighting ratings against review counts. It injects dynamic, color-coded badges into search results and product pages based on **quantile ranking** to show how a product performs relative to its current competitors. You can also **sort search results by adjusted score** with a single click, so the strongest listings jump straight to the top.

---

### Installation
1. Download and unzip (if zipped) all repository contents into a single folder.
2. Navigate to `chrome://extensions` in your browser.
3. Enable **Developer Mode**.
4. Click **Load unpacked** and select the project folder.

### Compatibility
* **Browsers:** Chrome, Brave, Edge, and other Chromium based browsers.
* **Regions:** Supports 19 global Amazon domains:
    * **Americas:** `.com`, `.ca`, `.com.mx`, `.com.br`
    * **Europe:** `.co.uk`, `.de`, `.fr`, `.it`, `.es`, `.nl`, `.se`, `.pl`
    * **Asia-Pacific:** `.com.au`, `.co.jp`, `.in`, `.sg`
    * **Middle East:** `.ae`, `.sa`, `.com.tr`
