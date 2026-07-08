# Amazon Rating Enhancer

### Overview
This project was inspired by the [3b1b](https://members.3blue1brown.com/posts/which-rating-is-34856305) video about how to balance review count with review score when it comes to just about anything. In this case we're applying it to Amazon ratings. Essentially, we calculate a Bayesian adjusted rating which is inserted into the product listing on any Amazon search results page. It sits below the listing next to the unadjusted rating. There's also a convenient button in the bottom LHS of the search results that allow you to sort these listings in descending order of their adjusted rating (higest at the top) which is super useful for cutting out the rubbish and sponsored results.

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
