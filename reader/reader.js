/**
 * Reader.js - Enhanced with internal link handling and delete functionality.
 * English comments for project localization.
 */

let currentId = null;

async function init() {
    const params = new URLSearchParams(window.location.search);
    currentId = parseInt(params.get('id'));

    if (!currentId) return;

    const { articles = [] } = await browser.storage.local.get("articles");
    const art = articles.find(a => a.id === currentId);

    if (art) {
        document.getElementById('loader').style.display = 'none';
        document.getElementById('reader-container').style.display = 'block';
        document.title = art.title;
        document.getElementById('title').textContent = art.title;

        const content = document.getElementById('content');
        content.innerHTML = art.content;

        // SMART LINK HANDLING (Table of Contents)
        content.querySelectorAll('a').forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.startsWith('#')) {
                link.classList.add('internal-link');
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const target = document.getElementById(href.substring(1)) || document.getElementsByName(href.substring(1))[0];
                    if (target) target.scrollIntoView({ behavior: 'smooth' });
                });
            } else {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener');
            }
        });

        setupControls();
        applySettings();
    }
}

function setupControls() {
    document.getElementById('sizePlus').onclick = () => updateFS(2);
    document.getElementById('sizeMinus').onclick = () => updateFS(-2);
    document.getElementById('toggleSans').onclick = () => { document.body.classList.toggle('sans'); saveSets(); };
    document.getElementById('setLight').onclick = () => setT('light');
    document.getElementById('setSepia').onclick = () => setT('sepia');
    document.getElementById('setDark').onclick = () => setT('dark');

    // Archive Article
    document.getElementById('archiveThis').onclick = async () => {
        const { articles = [] } = await browser.storage.local.get("articles");
        const updated = articles.map(a => a.id === currentId ? { ...a, status: 'archived' } : a);
        await browser.storage.local.set({ articles: updated });
        closeCurrentTab();
    };

    // NEW: Delete Article
    document.getElementById('deleteThis').onclick = async () => {
        if (confirm("Are you sure you want to delete this article forever?")) {
            const { articles = [] } = await browser.storage.local.get("articles");
            const updated = articles.filter(a => a.id !== currentId);
            await browser.storage.local.set({ articles: updated });
            closeCurrentTab();
        }
    };
}

function closeCurrentTab() {
    browser.tabs.getCurrent().then(t => browser.tabs.remove(t.id));
}

async function setT(t) {
    document.body.classList.remove('sepia', 'dark');
    if (t !== 'light') document.body.classList.add(t);
    saveSets();
}

async function updateFS(d) {
    const s = parseInt(getComputedStyle(document.body).getPropertyValue('--fs')) + d;
    document.body.style.setProperty('--fs', s + 'px');
    saveSets();
}

async function saveSets() {
    const settings = {
        theme: document.body.classList.contains('dark') ? 'dark' : (document.body.classList.contains('sepia') ? 'sepia' : 'light'),
        fs: parseInt(document.body.style.getPropertyValue('--fs')),
        sans: document.body.classList.contains('sans')
    };
    await browser.storage.local.set({ settings });
}

async function applySettings() {
    const { settings = {} } = await browser.storage.local.get("settings");
    if (settings.theme) setT(settings.theme);
    if (settings.fs) document.body.style.setProperty('--fs', settings.fs + 'px');
    if (settings.sans) document.body.classList.add('sans');
}

init();