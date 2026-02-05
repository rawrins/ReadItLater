/**
 * Popup script for Read Later Offline Pro.
 * Handles UI, tagging, and saving with "Open Now" option.
 */

let currentStatus = 'unread', filterTag = null;

const init = () => {
    document.getElementById('saveBtn').addEventListener('click', saveArticle);
    document.getElementById('viewUnread').addEventListener('click', (e) => switchView(e, 'unread'));
    document.getElementById('viewArchive').addEventListener('click', (e) => switchView(e, 'archived'));
    document.getElementById('clearFilter').addEventListener('click', () => { filterTag = null; render(); });
    document.getElementById('articleList').addEventListener('click', handleListClick);
    render();
};

const showToast = (msg, artId = null) => {
    const t = document.getElementById('customToast');
    t.innerHTML = `<span>${msg}</span>`;

    if (artId) {
        const btn = document.createElement('button');
        btn.textContent = "OPEN";
        btn.style.cssText = "margin-left:12px; background:#fff; color:#2d3748; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.7rem; padding:3px 8px;";
        btn.onclick = () => {
            browser.tabs.create({ url: browser.runtime.getURL(`/reader/reader.html?id=${artId}`) });
        };
        t.appendChild(btn);
    }

    t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 5000); // 5 seconds to decide
};

const switchView = (e, status) => {
    document.querySelectorAll('.m-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    currentStatus = status; render();
};

const handleListClick = async (e) => {
    const t = e.target, id = parseInt(t.dataset.id);
    if (t.classList.contains('tag-pill')) { filterTag = t.textContent; render(); }
    else if (t.classList.contains('edit-trigger')) {
        const area = document.getElementById(`edit-area-${id}`);
        area.style.display = area.style.display === 'block' ? 'none' : 'block';
    }
    else if (t.classList.contains('btn-save-tags')) {
        const tags = document.getElementById(`edit-input-${id}`).value.split(',').map(x => x.trim()).filter(x => x);
        await updateArt(id, { tags }); render();
    }
    else if (t.classList.contains('btn-status')) {
        await updateArt(id, { status: t.dataset.status }); render();
    }
    else if (t.classList.contains('btn-delete')) {
        const { articles } = await browser.storage.local.get("articles");
        await browser.storage.local.set({ articles: articles.filter(a => a.id !== id) }); render();
    }
    else if (t.classList.contains('card-title')) {
        browser.tabs.create({ url: browser.runtime.getURL(`/reader/reader.html?id=${id}`) });
    }
};

// popup/popup.js - Updated saveArticle function
async function saveArticle() {
    const pCont = document.getElementById('progress-container'), pBar = document.getElementById('progress-bar');
    const tagIn = document.getElementById('tagInput');
    const tags = tagIn.value.split(',').map(x => x.trim()).filter(x => x);

    try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

        // Basic check for restricted URLs
        if (!tab.url || tab.url.startsWith('about:') || tab.url.startsWith('moz-extension:')) {
            return showToast("Cannot save browser system pages.");
        }

        pCont.style.display = 'block';
        pBar.style.width = '30%';

        const { articles = [] } = await browser.storage.local.get("articles");
        if (articles.some(a => a.url === tab.url)) {
            pCont.style.display = 'none';
            return showToast("Already saved!");
        }

        // Try injecting via Popup context
        await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ["reader/Readability.js"] });
        pBar.style.width = '60%';

        const res = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                try {
                    return new Readability(document.cloneNode(true)).parse();
                } catch (e) { return null; }
            }
        });

        const art = res[0].result;
        if (!art) throw new Error("Parsing failed");

        const newId = Date.now();
        articles.push({
            id: newId, url: tab.url, title: art.title || tab.title, content: art.content,
            tags: tags,
            status: 'unread', date: new Date().toLocaleString('pl-PL')
        });

        await browser.storage.local.set({ articles });
        pBar.style.width = '100%';
        setTimeout(() => pCont.style.display = 'none', 500);

        tagIn.value = "";
        showToast("Saved!", newId);
        render();

    } catch (e) {
        console.error("Popup save failed, trying background...", e);
        // FAILOVER: If popup cannot touch the tab, background.js might still be able to.
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

        // We notify the user that we are trying a different method
        pBar.style.width = '50%';
        pBar.style.background = '#f6ad55'; // Orange for warning state

        // Request background.js to do the work
        browser.runtime.sendMessage({
            action: "save_current_page",
            tab: tab,
            manualTags: tags // Pass tags entered in popup
        });

        // Close popup because background will handle the notification
        setTimeout(() => window.close(), 1000);
    }
}

async function render() {
    const listEl = document.getElementById('articleList'), filterBar = document.getElementById('activeFilter');
    const { articles = [] } = await browser.storage.local.get("articles");
    let filtered = articles.filter(a => a.status === currentStatus);
    if (filterTag) {
        filtered = filtered.filter(a => a.tags.includes(filterTag));
        filterBar.style.display = 'flex'; document.getElementById('filterName').textContent = filterTag;
    } else filterBar.style.display = 'none';

    listEl.innerHTML = filtered.length ? '' : '<p style="text-align:center;font-size:0.8rem;color:#999;">Empty.</p>';
    filtered.sort((a, b) => b.id - a.id).forEach(art => {
        const div = document.createElement('div'); div.className = 'card';
        div.innerHTML = `
            <span class="card-title" data-id="${art.id}">${art.title}</span>
            <div class="card-meta">${art.date}</div>
            <div class="tags-row">${art.tags.map(t => `<span class="tag-pill">${t}</span>`).join('')} <span class="edit-trigger" data-id="${art.id}" style="color:blue;cursor:pointer;">✎</span></div>
            <div id="edit-area-${art.id}" class="tag-edit-area">
                <input type="text" id="edit-input-${art.id}" value="${art.tags.join(', ')}">
                <button class="btn-main btn-save-tags" data-id="${art.id}" style="font-size:0.7rem; padding:4px;">Apply</button>
            </div>
            <div style="display:flex; gap:12px; margin-top:8px;">
                <span class="btn-status" data-id="${art.id}" data-status="${art.status === 'unread' ? 'archived' : 'unread'}" style="cursor:pointer; font-size:0.7rem; color:#4a5568">${art.status === 'unread' ? 'Archive' : 'Restore'}</span>
                <span class="btn-delete" data-id="${art.id}" style="cursor:pointer; font-size:0.7rem; color:#e53e3e">Delete</span>
            </div>`;
        listEl.appendChild(div);
    });
}

async function updateArt(id, data) {
    const { articles } = await browser.storage.local.get("articles");
    await browser.storage.local.set({ articles: articles.map(a => a.id === id ? { ...a, ...data } : a) });
}

document.addEventListener('DOMContentLoaded', init);