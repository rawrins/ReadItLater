/**
 * Background script for Read Later Offline Pro.
 * Handles context menus, background saving, and interactive notifications.
 * English comments included as per project requirements.
 */

browser.runtime.onInstalled.addListener(async () => {
    // Clear old menu items to prevent duplicates
    await browser.contextMenus.removeAll();

    // Create menu for right-clicking links
    browser.contextMenus.create({
        id: "rl-save-link",
        title: "Save Linked Article",
        contexts: ["link"]
    });

    // Create menu for right-clicking the page body
    browser.contextMenus.create({
        id: "rl-save-page",
        title: "Save Current Page",
        contexts: ["page"]
    });
});

// Context Menu Click Handler
browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "rl-save-page") {
        await saveContent(tab, tab.url);
    } else if (info.menuItemId === "rl-save-link") {
        await saveLinkDirectly(info.linkUrl);
    }
});

// Message Listener (Handles fallbacks from popup.js)
browser.runtime.onMessage.addListener((request) => {
    if (request.action === "save_current_page") {
        // We accept manualTags passed from the popup if it encountered an error
        saveContent(request.tab, request.tab.url, request.manualTags || []);
    }
});

/**
 * Listener for Notification Clicks.
 * Opens the reader view for the specific article ID stored as notificationId.
 */
browser.notifications.onClicked.addListener((notificationId) => {
    // check if notificationId is a numeric timestamp (our article ID)
    if (!isNaN(notificationId)) {
        browser.tabs.create({
            url: browser.runtime.getURL(`/reader/reader.html?id=${notificationId}`)
        });
        browser.notifications.clear(notificationId);
    }
});

/**
 * Saves a linked article by opening it in a silent background tab.
 */
async function saveLinkDirectly(targetUrl) {
    try {
        const tempTab = await browser.tabs.create({ url: targetUrl, active: false });

        const onUpdated = async (tabId, changeInfo, tab) => {
            if (tabId === tempTab.id && changeInfo.status === 'complete') {
                browser.tabs.onUpdated.removeListener(onUpdated);

                // Wait 1.5s to ensure dynamic content and title are loaded
                setTimeout(async () => {
                    await saveContent(tab, targetUrl);
                    browser.tabs.remove(tabId);
                }, 1500);
            }
        };
        browser.tabs.onUpdated.addListener(onUpdated);
    } catch (error) {
        showSimpleNotify("Error processing link.");
    }
}

/**
 * Core Logic: Injects Readability, parses content, fixes relative URLs, and saves.
 * @param {object} tab - The tab object to process.
 * @param {string} baseUrl - Original URL of the page.
 * @param {Array} tags - Optional tags passed from UI.
 */
async function saveContent(tab, baseUrl, tags = []) {
    try {
        // Inject Readability library into the tab
        await browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["reader/Readability.js"]
        });

        // Execute parsing logic
        const results = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: (url) => {
                // Fix relative URLs for images and links before saving
                const makeAbsolute = (doc, selector, attr) => {
                    doc.querySelectorAll(selector).forEach(el => {
                        const val = el.getAttribute(attr);
                        if (val && !val.startsWith('http') && !val.startsWith('data:')) {
                            try { el.setAttribute(attr, new URL(val, url).href); } catch (e) { }
                        }
                    });
                };

                const docClone = document.cloneNode(true);
                makeAbsolute(docClone, 'a', 'href');
                makeAbsolute(docClone, 'img', 'src');
                makeAbsolute(docClone, 'video', 'src');
                makeAbsolute(docClone, 'iframe', 'src');

                const reader = new Readability(docClone);
                const parsed = reader.parse();

                // Fallback for missing title
                if (parsed && !parsed.title) parsed.title = document.title;
                return parsed;
            },
            args: [baseUrl]
        });

        const art = results[0].result;
        if (!art) throw new Error("Parsing failed");

        const { articles = [] } = await browser.storage.local.get("articles");

        // Check for duplicates based on URL
        if (articles.some(a => a.url === baseUrl)) {
            showSimpleNotify("Already saved!");
            return;
        }

        const newId = Date.now();
        articles.push({
            id: newId,
            url: baseUrl,
            title: art.title || "Untitled Article",
            content: art.content,
            tags: tags,
            status: 'unread',
            date: new Date().toLocaleString('pl-PL')
        });

        await browser.storage.local.set({ articles });

        // Show interactive notification
        browser.notifications.create(newId.toString(), {
            "type": "basic",
            "iconUrl": browser.runtime.getURL("popup/icon.png"),
            "title": "Read Later",
            "message": "Saved! Click here to read now: " + (art.title || "Article")
        });

    } catch (error) {
        console.error("Save error:", error);
        showSimpleNotify("Failed to save content. Site might be too restricted.");
    }
}

/**
 * Helper to show simple non-interactive notifications.
 */
function showSimpleNotify(msg) {
    browser.notifications.create(Date.now().toString(), {
        "type": "basic",
        "iconUrl": browser.runtime.getURL("popup/icon.png"),
        "title": "Read Later",
        "message": msg
    });
}