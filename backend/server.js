require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;

// Простая файловая "база данных"
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading data:', e);
    }
    return { users: {}, admins: [] };
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving data:', e);
    }
}

let db = loadData();

// Middleware
app.use(cors());
app.use(express.json());

// Проверка здоровья сервера
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Roblox Game Stats Backend is running!',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Валидация Telegram WebApp
function validateInitData(initData) {
    if (!initData || !BOT_TOKEN) return null;
    
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');
        
        const dataCheckString = Array.from(urlParams)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');
        
        const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
        
        if (calculatedHash === hash) {
            return JSON.parse(urlParams.get('user'));
        }
        return null;
    } catch (e) {
        console.error('Validation error:', e);
        return null;
    }
}

// API: Получить данные пользователя
app.get('/api/user', (req, res) => {
    const initData = req.headers['x-telegram-init-data'] || req.query.initData;
    const user = validateInitData(initData);
    
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = user.id.toString();
    
    // Создаём пользователя если не существует
    if (!db.users[userId]) {
        db.users[userId] = {
            id: user.id,
            username: user.username || '',
            first_name: user.first_name || '',
            last_name: user.last_name || '',
            language: 'ru',
            theme: 'dark',
            status: 'pending',
            roblox_id: null,
            roblox_username: null,
            games: [],
            created_at: new Date().toISOString()
        };
        saveData(db);
    }
    
    res.json({ user: db.users[userId] });
});

// API: Сохранить настройки
app.post('/api/user/settings', (req, res) => {
    const initData = req.headers['x-telegram-init-data'] || req.query.initData;
    const user = validateInitData(initData);
    
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = user.id.toString();
    const { language, theme } = req.body;
    
    if (db.users[userId]) {
        if (language) db.users[userId].language = language;
        if (theme) db.users[userId].theme = theme;
        saveData(db);
    }
    
    res.json({ success: true });
});

// API: Привязать Roblox
app.post('/api/user/roblox', (req, res) => {
    const initData = req.headers['x-telegram-init-data'] || req.query.initData;
    const user = validateInitData(initData);
    
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = user.id.toString();
    const { robloxId, robloxUsername } = req.body;
    
    if (db.users[userId]) {
        db.users[userId].roblox_id = robloxId;
        db.users[userId].roblox_username = robloxUsername;
        saveData(db);
    }
    
    res.json({ success: true });
});

// API: Отвязать Roblox
app.delete('/api/user/roblox', (req, res) => {
    const initData = req.headers['x-telegram-init-data'] || req.query.initData;
    const user = validateInitData(initData);
    
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = user.id.toString();
    
    if (db.users[userId]) {
        db.users[userId].roblox_id = null;
        db.users[userId].roblox_username = null;
        saveData(db);
    }
    
    res.json({ success: true });
});

// API: Добавить игру
app.post('/api/games', (req, res) => {
    const initData = req.headers['x-telegram-init-data'] || req.query.initData;
    const user = validateInitData(initData);
    
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = user.id.toString();
    const { universeId, gameName } = req.body;
    
    if (db.users[userId]) {
        // Проверяем, не добавлена ли уже
        const exists = db.users[userId].games.find(g => g.universeId === universeId);
        if (exists) {
            return res.status(400).json({ error: 'Game already added' });
        }
        
        db.users[userId].games.push({
            universeId,
            gameName,
            addedAt: new Date().toISOString()
        });
        saveData(db);
    }
    
    res.json({ success: true });
});

// API: Удалить игру
app.delete('/api/games/:universeId', (req, res) => {
    const initData = req.headers['x-telegram-init-data'] || req.query.initData;
    const user = validateInitData(initData);
    
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = user.id.toString();
    const universeId = req.params.universeId;
    
    if (db.users[userId]) {
        db.users[userId].games = db.users[userId].games.filter(
            g => g.universeId.toString() !== universeId.toString()
        );
        saveData(db);
    }
    
    res.json({ success: true });
});

// API: Получить все игры пользователя
app.get('/api/games', (req, res) => {
    const initData = req.headers['x-telegram-init-data'] || req.query.initData;
    const user = validateInitData(initData);
    
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = user.id.toString();
    const games = db.users[userId]?.games || [];
    
    res.json({ games });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 Roblox Game Stats Backend');
    console.log(`📡 Порт: ${PORT}`);
    console.log(`🔑 Токен: ${BOT_TOKEN ? 'Установлен' : '❌ НЕ УСТАНОВЛЕН!'}`);
    console.log('========================================');
});