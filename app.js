const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// State
let state = {
    language: 'ru',
    theme: 'dark',
    roblox: null,
    games: []
};

let translations = {};
const userId = tg.initDataUnsafe?.user?.id || 'guest';
const STORAGE_KEY = `roblox_stats_${userId}`;

// Загрузка переводов
async function loadTranslations() {
    try {
        const [ruRes, enRes] = await Promise.all([
            fetch('lang/ru.json'),
            fetch('lang/en.json')
        ]);
        translations.ru = await ruRes.json();
        translations.en = await enRes.json();
    } catch (e) {
        console.error('Ошибка загрузки переводов:', e);
        translations = {
            ru: { nav_dashboard: 'Главная', nav_games: 'Игры', nav_profile: 'Профиль' },
            en: { nav_dashboard: 'Dashboard', nav_games: 'Games', nav_profile: 'Profile' }
        };
    }
}

function t(key) {
    return translations[state.language]?.[key] || translations.ru?.[key] || key;
}

function updateTexts() {
    document.querySelectorAll('[data-lang]').forEach(el => {
        const key = el.getAttribute('data-lang');
        el.textContent = t(key);
    });

    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.options[0].text = t('dark');
        themeSelect.options[1].text = t('light');
    }
}

// Хранение в localStorage
function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) state = { ...state, ...JSON.parse(saved) };
    } catch (e) {
        console.error('Ошибка загрузки данных:', e);
    }
}

// Тема
function setTheme(theme) {
    state.theme = theme;
    document.body.dataset.theme = theme;
    document.getElementById('themeSelect').value = theme;
    save();
}

// Навигация
function initNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
            tg.HapticFeedback?.impactOccurred?.('light');
        });
    });
}

// Поиск Roblox пользователя
async function searchRobloxUser(query) {
    query = query.trim();
    if (!query) return null;

    try {
        let userId;
        if (/^\d+$/.test(query)) {
            userId = query;
        } else {
            const res = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(query)}&limit=10`);
            const data = await res.json();
            const exact = data.data?.find(u => u.name.toLowerCase() === query.toLowerCase());
            if (!exact) return null;
            userId = exact.id;
        }

        const userRes = await fetch(`https://users.roblox.com/v1/users/${userId}`);
        if (!userRes.ok) return null;
        const user = await userRes.json();

        const avatarRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`);
        const avatarData = await avatarRes.json();

        return {
            id: user.id,
            username: user.name,
            displayName: user.displayName || user.name,
            avatar: avatarData.data?.[0]?.imageUrl || ''
        };
    } catch (e) {
        console.error('Ошибка поиска Roblox:', e);
        return null;
    }
}

// Поиск игры
async function getGameInfo(universeId) {
    try {
        const res = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
        const data = await res.json();
        if (!data.data?.[0]) return null;

        const game = data.data[0];
        const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=150x150&format=Png`);
        const thumbData = await thumbRes.json();

        return {
            universeId: game.id,
            name: game.name,
            playing: game.playing || 0,
            visits: game.visits || 0,
            favoritedCount: game.favoritedCount || 0,
            thumbnail: thumbData.data?.[0]?.imageUrl || ''
        };
    } catch (e) {
        console.error('Ошибка загрузки игры:', e);
        return null;
    }
}

async function getUniverseId(placeId) {
    try {
        const res = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.universeId;
    } catch (e) {
        return null;
    }
}

// Форматирование чисел
function formatNumber(n) {
    if (!n) return '0';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
}

// Модальные окна
function showModal(id) {
    document.getElementById(id)?.classList.add('active');
}

function hideAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

// Привязка Roblox (в настройках)
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
            preview.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
                    <img src="${user.avatar}" width="48" height="48" style="border-radius:50%">
                    <div>
                        <div style="font-weight:600">${user.username}</div>
                        <div style="font-size:13px;color:var(--text-secondary)">${user.displayName}</div>
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
            setTimeout(() => { btn.disabled = false; }, 1500);
        }
    };

    btn.onclick = search;
    input.addEventListener('keypress', e => e.key === 'Enter' && search());
}

// Добавление игры
function showAddGameModal() {
    document.getElementById('modalTitle').textContent = t('add_game');
    document.getElementById('modalBody').innerHTML = `
        <input type="text" id="gameInput" placeholder="${t('enter_game_id')}">
        <div id="gamePreview" class="hidden" style="margin:16px 0"></div>
        <button class="btn btn-primary" id="searchGameBtn">${t('search')}</button>
    `;
    showModal('modal');

    const input = document.getElementById('gameInput');
    const btn = document.getElementById('searchGameBtn');
    const preview = document.getElementById('gamePreview');

    const search = async () => {
        let query = input.value.trim();
        if (!query) return;

        btn.textContent = '...';
        btn.disabled = true;

        const match = query.match(/games\/(\d+)/);
        if (match) query = match[1];

        let universeId = query;
        if (/^\d+$/.test(query)) {
            const uId = await getUniverseId(query);
            if (uId) universeId = uId;
        }

        const game = await getGameInfo(universeId);

        if (game) {
            preview.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
                    <img src="${game.thumbnail}" width="48" height="48" style="border-radius:8px">
                    <div>
                        <div style="font-weight:600">${game.name}</div>
                        <div style="font-size:13px;color:var(--text-secondary)">${formatNumber(game.visits)} визитов</div>
                    </div>
                </div>
            `;
            preview.classList.remove('hidden');
            btn.textContent = t('add');
            btn.onclick = () => {
                if (!state.games.find(g => g.universeId == game.universeId)) {
                    state.games.push(game);
                    save();
                    updateGamesUI();
                }
                hideAllModals();
            };
        } else {
            preview.innerHTML = `<p style="color:#ef4444">${t('not_found')}</p>`;
            preview.classList.remove('hidden');
            btn.textContent = t('search');
            setTimeout(() => { btn.disabled = false; }, 1500);
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
    } else {
        linked.classList.add('hidden');
        notLinked.classList.remove('hidden');
    }
}

// Обновление списка игр
async function updateGamesUI() {
    const list = document.getElementById('gamesList');
    const dash = document.getElementById('dashboardGames');
    const noGames = document.getElementById('noGames');

    if (state.games.length === 0) {
        list.innerHTML = '';
        dash.innerHTML = `<p class="text-secondary">${t('no_games')}</p>`;
        noGames.classList.remove('hidden');
        document.getElementById('totalGames').textContent = '0';
        document.getElementById('totalVisits').textContent = '0';
        document.getElementById('totalPlaying').textContent = '0';
        return;
    }

    noGames.classList.add('hidden');
    let totalVisits = 0;
    let totalPlaying = 0;
    let html = '';

    for (const game of state.games) {
        const fresh = await getGameInfo(game.universeId);
        if (fresh) {
            game.playing = fresh.playing;
            game.visits = fresh.visits;
            game.thumbnail = fresh.thumbnail;
        }
        totalVisits += game.visits || 0;
        totalPlaying += game.playing || 0;

        html += `
            <div class="game-item" onclick="showGameDetails(${game.universeId})">
                <img src="${game.thumbnail}" alt="">
                <div class="game-info">
                    <h4>${game.name}</h4>
                    <p>${formatNumber(game.visits)} визитов · ${formatNumber(game.playing)} играют</p>
                </div>
            </div>
        `;
    }

    list.innerHTML = html;
    dash.innerHTML = html;

    document.getElementById('totalGames').textContent = state.games.length;
    document.getElementById('totalVisits').textContent = formatNumber(totalVisits);
    document.getElementById('totalPlaying').textContent = formatNumber(totalPlaying);
}

// Профиль Telegram
function updateProfileUI() {
    const user = tg.initDataUnsafe?.user;
    if (user) {
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';
        document.getElementById('tgName').textContent = name;
        document.getElementById('tgUsername').textContent = user.username ? `@${user.username}` : '';
        document.getElementById('tgId').textContent = `ID: ${user.id}`;
        document.getElementById('tgAvatar').textContent = name.charAt(0).toUpperCase();
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
    updateGamesUI();
    updateProfileUI();

    initNav();

    // Кнопки
    document.getElementById('linkRobloxBtnProfile')?.addEventListener('click', showLinkRobloxModal);
    document.getElementById('unlinkRobloxBtn')?.addEventListener('click', () => {
        if (confirm(t('unlink_confirm'))) {
            state.roblox = null;
            save();
            updateRobloxUI();
        }
    });
    document.getElementById('addGameBtn')?.addEventListener('click', showAddGameModal);
    document.getElementById('addGameBtnDash')?.addEventListener('click', showAddGameModal);
    document.getElementById('addFirstGameBtn')?.addEventListener('click', showAddGameModal);

    // Настройки
    document.getElementById('langSelect').addEventListener('change', e => {
        state.language = e.target.value;
        save();
        updateTexts();
    });

    document.getElementById('themeSelect').addEventListener('change', e => {
        setTheme(e.target.value);
    });

    // Закрытие модалок
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
        el.addEventListener('click', hideAllModals);
    });

    // Скрыть лоадер
    setTimeout(() => {
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('main').classList.remove('hidden');
    }, 400);
}

document.addEventListener('DOMContentLoaded', init);