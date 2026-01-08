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

// Load translations from files
async function loadTranslations() {
    try {
        const [ruRes, enRes] = await Promise.all([
            fetch('lang/ru.json'),
            fetch('lang/en.json')
        ]);
        translations.ru = await ruRes.json();
        translations.en = await enRes.json();
    } catch (e) {
        console.error('Failed to load translations:', e);
        translations = {
            ru: { nav_dashboard: 'Главная', nav_games: 'Игры', nav_profile: 'Профиль' },
            en: { nav_dashboard: 'Dashboard', nav_games: 'Games', nav_profile: 'Profile' }
        };
    }
}

// Translation helper
function t(key) {
    return translations[state.language]?.[key] || translations.ru?.[key] || key;
}

function updateTexts() {
    document.querySelectorAll('[data-lang]').forEach(el => {
        const key = el.getAttribute('data-lang');
        el.textContent = t(key);
    });
    
    // Update select options
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.options[0].text = t('dark');
        themeSelect.options[1].text = t('light');
    }
}

// Storage
function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            state = { ...state, ...parsed };
        }
    } catch (e) {
        console.error('Failed to load state:', e);
    }
}

// Theme
function setTheme(theme) {
    state.theme = theme;
    document.body.setAttribute('data-theme', theme);
    document.getElementById('themeSelect').value = theme;
    save();
}

// Navigation
function initNav() {
    const buttons = document.querySelectorAll('.nav-btn');
    const tabs = document.querySelectorAll('.tab-content');
    
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            tabs.forEach(t => t.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
            
            if (tg.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('light');
            }
        });
    });
}

// Roblox API
async function searchRobloxUser(query) {
    try {
        let userId;
        
        if (/^\d+$/.test(query)) {
            userId = query;
        } else {
            const searchRes = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(query)}&limit=1`);
            const searchData = await searchRes.json();
            if (!searchData.data?.[0]) return null;
            userId = searchData.data[0].id;
        }
        
        const userRes = await fetch(`https://users.roblox.com/v1/users/${userId}`);
        if (!userRes.ok) return null;
        const user = await userRes.json();
        
        const avatarRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`);
        const avatarData = await avatarRes.json();
        
        return {
            id: user.id,
            username: user.name,
            displayName: user.displayName,
            avatar: avatarData.data?.[0]?.imageUrl || ''
        };
    } catch (e) {
        console.error('Roblox user search error:', e);
        return null;
    }
}

async function getGameInfo(universeId) {
    try {
        const gameRes = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
        const gameData = await gameRes.json();
        if (!gameData.data?.[0]) return null;
        
        const game = gameData.data[0];
        
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
        console.error('Game info error:', e);
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

// Modal
function showModal(id) {
    document.getElementById(id).classList.add('active');
}

function hideModal(id) {
    document.getElementById(id).classList.remove('active');
}

function hideAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

// Link Roblox Modal
function showLinkRobloxModal() {
    document.getElementById('modalTitle').textContent = t('link_roblox');
    document.getElementById('modalBody').innerHTML = `
        <input type="text" id="robloxInput" placeholder="${t('enter_username')}">
        <div id="robloxPreview" class="hidden"></div>
        <button class="btn btn-primary" id="searchRobloxBtn">${t('search')}</button>
    `;
    
    showModal('modal');
    
    const input = document.getElementById('robloxInput');
    const btn = document.getElementById('searchRobloxBtn');
    const preview = document.getElementById('robloxPreview');
    
    input.focus();
    
    btn.addEventListener('click', async () => {
        const query = input.value.trim();
        if (!query) return;
        
        btn.textContent = '...';
        btn.disabled = true;
        
        const user = await searchRobloxUser(query);
        
        if (user) {
            preview.innerHTML = `
                <div class="preview-card">
                    <img src="${user.avatar}" alt="">
                    <div>
                        <h4>${user.username}</h4>
                        <p>${user.displayName}</p>
                    </div>
                </div>
            `;
            preview.classList.remove('hidden');
            
            btn.textContent = t('confirm');
            btn.disabled = false;
            
            btn.onclick = () => {
                state.roblox = user;
                save();
                updateRobloxUI();
                hideAllModals();
            };
        } else {
            btn.textContent = t('not_found');
            btn.disabled = false;
            setTimeout(() => {
                btn.textContent = t('search');
            }, 2000);
        }
    });
}

// Add Game Modal
function showAddGameModal() {
    document.getElementById('modalTitle').textContent = t('add_game');
    document.getElementById('modalBody').innerHTML = `
        <input type="text" id="gameInput" placeholder="${t('enter_game_id')}">
        <div id="gamePreview" class="hidden"></div>
        <button class="btn btn-primary" id="searchGameBtn">${t('search')}</button>
    `;
    
    showModal('modal');
    
    const input = document.getElementById('gameInput');
    const btn = document.getElementById('searchGameBtn');
    const preview = document.getElementById('gamePreview');
    
    input.focus();
    
    btn.addEventListener('click', async () => {
        let query = input.value.trim();
        if (!query) return;
        
        btn.textContent = '...';
        btn.disabled = true;
        
        // Extract ID from URL
        const urlMatch = query.match(/games\/(\d+)/);
        if (urlMatch) query = urlMatch[1];
        
        let universeId = query;
        
        // Try to get universe ID from place ID
        if (/^\d+$/.test(query)) {
            const uId = await getUniverseId(query);
            if (uId) universeId = uId;
        }
        
        const game = await getGameInfo(universeId);
        
        if (game) {
            preview.innerHTML = `
                <div class="preview-card">
                    <img src="${game.thumbnail}" alt="">
                    <div>
                        <h4>${game.name}</h4>
                        <p>${formatNumber(game.visits)} ${t('visits')}</p>
                    </div>
                </div>
            `;
            preview.classList.remove('hidden');
            
            btn.textContent = t('add');
            btn.disabled = false;
            
            btn.onclick = () => {
                const exists = state.games.find(g => g.universeId == game.universeId);
                if (!exists) {
                    state.games.push(game);
                    save();
                    updateGamesUI();
                }
                hideAllModals();
            };
        } else {
            btn.textContent = t('not_found');
            btn.disabled = false;
            setTimeout(() => {
                btn.textContent = t('search');
            }, 2000);
        }
    });
}

// Game Details Modal
let currentGameId = null;

function showGameDetails(universeId) {
    const game = state.games.find(g => g.universeId == universeId);
    if (!game) return;
    
    currentGameId = universeId;
    
    document.getElementById('gameModalTitle').textContent = game.name;
    document.getElementById('gameModalBody').innerHTML = `
        <div class="game-details-header">
            <img src="${game.thumbnail}" alt="">
            <div>
                <h4>${game.name}</h4>
                <p>ID: ${game.universeId}</p>
            </div>
        </div>
        <div class="game-stats">
            <div class="game-stat">
                <span class="value">${formatNumber(game.visits)}</span>
                <span class="label">${t('total_visits')}</span>
            </div>
            <div class="game-stat">
                <span class="value">${formatNumber(game.playing)}</span>
                <span class="label">${t('playing_now')}</span>
            </div>
            <div class="game-stat">
                <span class="value">${formatNumber(game.favoritedCount)}</span>
                <span class="label">${t('favorites')}</span>
            </div>
        </div>
    `;
    
    showModal('gameModal');
}

function removeCurrentGame() {
    if (!currentGameId) return;
    
    if (confirm(t('remove_confirm'))) {
        state.games = state.games.filter(g => g.universeId != currentGameId);
        save();
        updateGamesUI();
        hideAllModals();
        currentGameId = null;
    }
}

// Format number
function formatNumber(n) {
    if (!n) return '0';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
}

// Update UI
function updateRobloxUI() {
    const noRoblox = document.getElementById('noRoblox');
    const robloxInfo = document.getElementById('robloxInfo');
    const profileRoblox = document.getElementById('profileRoblox');
    
    if (state.roblox) {
        noRoblox.classList.add('hidden');
        robloxInfo.classList.remove('hidden');
        
        document.getElementById('robloxAvatar').src = state.roblox.avatar;
        document.getElementById('robloxUsername').textContent = state.roblox.username;
        document.getElementById('robloxDisplayName').textContent = state.roblox.displayName;
        
        profileRoblox.innerHTML = `
            <div class="roblox-profile">
                <img src="${state.roblox.avatar}" alt="">
                <div class="roblox-details">
                    <h3>${state.roblox.username}</h3>
                    <p>${state.roblox.displayName}</p>
                </div>
            </div>
        `;
    } else {
        noRoblox.classList.remove('hidden');
        robloxInfo.classList.add('hidden');
        profileRoblox.innerHTML = `<p class="text-secondary" data-lang="not_linked">${t('not_linked')}</p>`;
    }
}

async function updateGamesUI() {
    const gamesList = document.getElementById('gamesList');
    const dashboardGames = document.getElementById('dashboardGames');
    const noGames = document.getElementById('noGames');
    
    if (state.games.length === 0) {
        gamesList.innerHTML = '';
        dashboardGames.innerHTML = `<p class="text-secondary">${t('no_games')}</p>`;
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
            game.favoritedCount = fresh.favoritedCount;
            game.thumbnail = fresh.thumbnail;
        }
        
        totalVisits += game.visits || 0;
        totalPlaying += game.playing || 0;
        
        html += `
            <div class="game-item" onclick="showGameDetails(${game.universeId})">
                <img src="${game.thumbnail}" alt="">
                <div class="game-info">
                    <h4>${game.name}</h4>
                    <p>${formatNumber(game.visits)} ${t('visits')} · ${formatNumber(game.playing)} ${t('playing')}</p>
                </div>
            </div>
        `;
    }
    
    gamesList.innerHTML = html;
    dashboardGames.innerHTML = html;
    
    document.getElementById('totalGames').textContent = state.games.length;
    document.getElementById('totalVisits').textContent = formatNumber(totalVisits);
    document.getElementById('totalPlaying').textContent = formatNumber(totalPlaying);
    
    save();
}

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

// Init
async function init() {
    load();
    await loadTranslations();
    
    setTheme(state.theme);
    document.getElementById('langSelect').value = state.language;
    updateTexts();
    
    initNav();
    updateRobloxUI();
    updateGamesUI();
    updateProfileUI();
    
    // Event listeners
    document.getElementById('linkRobloxBtn').addEventListener('click', showLinkRobloxModal);
    document.getElementById('addGameBtn').addEventListener('click', showAddGameModal);
    document.getElementById('addGameBtnDash').addEventListener('click', showAddGameModal);
    document.getElementById('addFirstGameBtn').addEventListener('click', showAddGameModal);
    document.getElementById('removeGameBtn').addEventListener('click', removeCurrentGame);
    
    document.getElementById('unlinkBtn').addEventListener('click', () => {
        if (confirm(t('unlink_confirm'))) {
            state.roblox = null;
            save();
            updateRobloxUI();
        }
    });
    
    document.getElementById('langSelect').addEventListener('change', (e) => {
        state.language = e.target.value;
        save();
        updateTexts();
    });
    
    document.getElementById('themeSelect').addEventListener('change', (e) => {
        setTheme(e.target.value);
    });
    
    // Modal close
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', hideAllModals);
    });
    
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', hideAllModals);
    });
    
    // Hide loader
    setTimeout(() => {
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('main').classList.remove('hidden');
    }, 300);
}

document.addEventListener('DOMContentLoaded', init);