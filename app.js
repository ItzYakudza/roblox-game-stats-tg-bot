const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

let state = {
    language: 'ru',
    theme: 'dark',
    roblox: null,
    games: []
};

let translations = {};
const userId = tg.initDataUnsafe?.user?.id || 'guest';
const STORAGE_KEY = `roblox_stats_${userId}`;

async function loadTranslations() {
    try {
        const [ruRes, enRes] = await Promise.all([
            fetch('lang/ru.json'),
            fetch('lang/en.json')
        ]);
        translations.ru = await ruRes.json();
        translations.en = await enRes.json();
    } catch (e) {
        console.error('Translations error:', e);
    }
}

function t(key) {
    return translations[state.language]?.[key] || key;
}

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) state = { ...state, ...JSON.parse(saved) };
    } catch (e) {}
}

function setTheme(theme) {
    state.theme = theme;
    document.body.dataset.theme = theme;
    document.getElementById('themeSelect').value = theme;
    save();
}

// === НОВЫЕ API ROBLOX ===
async function getUserByUsername(username) {
    try {
        const res = await fetch(`https://api.roblox.com/users/get-by-username?username=${username}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.Id ? data.Id : null;
    } catch (e) {
        return null;
    }
}

async function getUserInfo(userId) {
    try {
        const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function getUserStatus(userId) {
    try {
        const res = await fetch(`https://users.roblox.com/v1/users/${userId}/status`);
        if (!res.ok) return '';
        const data = await res.json();
        return data.status || '';
    } catch (e) {
        return '';
    }
}

async function getFriendsCount(userId) {
    try {
        const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`);
        if (!res.ok) return 0;
        const data = await res.json();
        return data.count || 0;
    } catch (e) {
        return 0;
    }
}

async function getPresence(userId) {
    try {
        const res = await fetch('https://presence.roblox.com/v1/presence/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: [userId] })
        });
        const data = await res.json();
        const presence = data.userPresences?.[0];
        if (!presence) return { status: 'offline' };
        
        return {
            status: presence.userPresenceType === 2 ? 'in_game' : 
                   presence.userPresenceType === 1 ? 'online' : 'offline',
            lastLocation: presence.lastLocation || '',
            gameId: presence.gameId || null,
            placeId: presence.placeId || null
        };
    } catch (e) {
        return { status: 'offline' };
    }
}

async function getPreviousUsernames(userId) {
    try {
        const res = await fetch(`https://users.roblox.com/v1/users/${userId}/username-history?limit=5`);
        const data = await res.json();
        return data.data?.map(u => u.name) || [];
    } catch (e) {
        return [];
    }
}

async function getUserAvatar(userId) {
    try {
        const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`);
        const data = await res.json();
        return data.data?.[0]?.imageUrl || '';
    } catch (e) {
        return '';
    }
}

// Поиск пользователя (по username или ID)
async function searchRobloxUser(query) {
    query = query.trim();
    if (!query) return null;

    let userId;
    
    if (/^\d+$/.test(query)) {
        userId = parseInt(query);
    } else {
        userId = await getUserByUsername(query);
        if (!userId) return null;
    }

    const [info, avatar, friends, presence, prevNames] = await Promise.all([
        getUserInfo(userId),
        getUserAvatar(userId),
        getFriendsCount(userId),
        getPresence(userId),
        getPreviousUsernames(userId)
    ]);

    if (!info) return null;

    return {
        id: userId,
        username: info.name,
        displayName: info.displayName || info.name,
        description: info.description || '',
        created: info.created ? new Date(info.created).toLocaleDateString('ru-RU') : '',
        avatar,
        friends,
        presence,
        previousUsernames: prevNames
    };
}

// Привязка Roblox
function showLinkRobloxModal() {
    document.getElementById('modalTitle').textContent = t('link_roblox');
    document.getElementById('modalBody').innerHTML = `
        <input type="text" id="robloxInput" placeholder="${t('enter_username')}" autofocus>
        <div id="robloxPreview" class="hidden" style="margin:16px 0"></div>
        <button class="btn btn-primary" id="searchBtn">${t('search')}</button>
    `;
    showModal('modal');

    const input = document.getElementById('robloxInput');
    const btn = document.getElementById('searchBtn');
    const preview = document.getElementById('robloxPreview');

    const search = async () => {
        const query = input.value.trim();
        if (!query) return;

        btn.textContent = '...';
        btn.disabled = true;
        preview.classList.add('hidden');

        const user = await searchRobloxUser(query);

        if (user) {
            const status = user.presence.status === 'in_game' ? 'В игре' : 
                          user.presence.status === 'online' ? 'Онлайн' : 'Оффлайн';

            preview.innerHTML = `
                <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;">
                    <div style="display:flex;gap:12px;align-items:center;">
                        <img src="${user.avatar}" width="60" height="60" style="border-radius:50%">
                        <div>
                            <div style="font-weight:600">${user.username}</div>
                            <div style="font-size:13px;color:var(--text-secondary)">${user.displayName}</div>
                            <div style="font-size:12px;margin-top:4px">${status}</div>
                        </div>
                    </div>
                    <div style="margin-top:12px;font-size:13px;color:var(--text-secondary)">
                        Друзья: ${user.friends} · Зарегистрирован: ${user.created}
                    </div>
                </div>
            `;
            preview.classList.remove('hidden');
            btn.textContent = t('confirm');
            btn.onclick = () => {
                state.roblox = user;
                save();
                updateRobloxUI();
                hideAllModals();
            };
        } else {
            preview.innerHTML = `<p style="color:#ef4444">${t('not_found')}</p>`;
            preview.classList.remove('hidden');
            btn.textContent = t('search');
            btn.disabled = false;
        }
    };

    btn.onclick = search;
    input.addEventListener('keypress', e => e.key === 'Enter' && search());
}

// Обновление интерфейса Roblox
function updateRobloxUI() {
    const linked = document.getElementById('robloxLinked');
    const notLinked = document.getElementById('robloxNotLinked');

    if (state.roblox) {
        notLinked.classList.add('hidden');
        linked.classList.remove('hidden');

        document.getElementById('robloxAvatarProfile').src = state.roblox.avatar;
        document.getElementById('robloxUsernameProfile').textContent = state.roblox.username;
        document.getElementById('robloxDisplayNameProfile').textContent = state.roblox.displayName;

        const status = state.roblox.presence.status === 'in_game' ? 'В игре' :
                      state.roblox.presence.status === 'online' ? 'Онлайн' : 'Оффлайн';

        document.getElementById('profileRoblox').innerHTML = `
            <div class="roblox-profile">
                <img src="${state.roblox.avatar}" alt="">
                <div class="roblox-details">
                    <h3>${state.roblox.username}</h3>
                    <p>${state.roblox.displayName}</p>
                    <p style="font-size:13px;color:var(--text-secondary;margin-top:4px">
                        ${status} · Друзья: ${state.roblox.friends}
                    </p>
                </div>
            </div>
        `;
    } else {
        linked.classList.add('hidden');
        notLinked.classList.remove('hidden');
    }
}

// Инициализация
async function init() {
    load();
    await loadTranslations();

    setTheme(state.theme);
    document.getElementById('langSelect').value = state.language;
    document.getElementById('themeSelect').value = state.theme;
    updateTexts();
    updateRobloxUI();

    initNav();

    document.getElementById('linkRobloxBtnProfile')?.addEventListener('click', showLinkRobloxModal);
    document.getElementById('unlinkRobloxBtn')?.addEventListener('click', () => {
        if (confirm(t('unlink_confirm'))) {
            state.roblox = null;
            save();
            updateRobloxUI();
        }
    });

    document.getElementById('langSelect').addEventListener('change', e => {
        state.language = e.target.value;
        save();
        updateTexts();
    });

    document.getElementById('themeSelect').addEventListener('change', e => {
        setTheme(e.target.value);
    });

    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
        el.onclick = hideAllModals;
    });

    setTimeout(() => {
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('main').classList.remove('hidden');
    }, 400);
}

document.addEventListener('DOMContentLoaded', init);