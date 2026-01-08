require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');

// === НАСТРОЙКИ ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://itzyakudza.github.io/roblox-game-stats-tg-bot';
const PORT = process.env.PORT || 3000;

// Безопасное получение ADMIN_IDS
let ADMIN_IDS = [];
try {
    if (process.env.ADMIN_IDS) {
        ADMIN_IDS = process.env.ADMIN_IDS
            .split(',')
            .map(id => parseInt(id.trim()))
            .filter(id => !isNaN(id) && id > 0);
    }
} catch (e) {
    console.error('Ошибка парсинга ADMIN_IDS:', e);
}

// Добавь свой ID как запасной вариант
if (ADMIN_IDS.length === 0) {
    ADMIN_IDS = [7662820306]; // твой ID
}

if (!BOT_TOKEN) {
    console.error('ОШИБКА: BOT_TOKEN не установлен!');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// Хранилище пользователей
const users = new Map();

// Проверка админа (безопасная)
function isAdmin(userId) {
    if (!userId) return false;
    return ADMIN_IDS.includes(Number(userId));
}

// === EXPRESS СЕРВЕР ===
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        bot: 'Roblox Game Stats Bot',
        users: users.size,
        admins: ADMIN_IDS.length
    });
});

app.get('/health', (req, res) => {
    res.send('OK');
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

// === ЛОГИКА БОТА ===
bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    
    let user = users.get(userId);

    // Админ — сразу одобрен
    if (isAdmin(userId)) {
        if (!user) {
            user = { 
                id: userId, 
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                status: 'approved', 
                language: 'ru' 
            };
            users.set(userId, user);
        }
        user.status = 'approved';
        users.set(userId, user);
    }

    // Новый пользователь
    if (!user) {
        user = { 
            id: userId, 
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            status: 'pending', 
            language: 'ru' 
        };
        users.set(userId, user);

        await ctx.reply(
            'Добро пожаловать в Roblox Game Stats!\n\n' +
            'Ваша заявка отправлена на рассмотрение.\n' +
            'Ожидайте одобрения администратора.'
        );

        // Уведомляем админов
        for (const adminId of ADMIN_IDS) {
            try {
                await bot.telegram.sendMessage(
                    adminId,
                    `Новая заявка\n\n` +
                    `Имя: ${ctx.from.first_name || 'Нет'}\n` +
                    `Username: @${ctx.from.username || 'нет'}\n` +
                    `ID: ${userId}`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: 'Одобрить', callback_data: `approve_${userId}` },
                                { text: 'Отклонить', callback_data: `reject_${userId}` }
                            ]]
                        }
                    }
                );
            } catch (e) {
                console.error('Ошибка уведомления админа:', e.message);
            }
        }
        return;
    }

    // Ожидает одобрения
    if (user.status === 'pending') {
        return ctx.reply('Ваша заявка ещё на рассмотрении. Ожидайте.');
    }

    // Отклонён
    if (user.status === 'rejected') {
        return ctx.reply('К сожалению, ваша заявка отклонена.');
    }

    // Одобрен — показываем кнопки
    const keyboard = [[
        { text: 'Открыть приложение', web_app: { url: WEBAPP_URL } }
    ]];

    if (isAdmin(userId)) {
        keyboard.push([{ text: 'Админ панель', callback_data: 'admin_panel' }]);
    }

    await ctx.reply(
        'Добро пожаловать в Roblox Game Stats!\n\n' +
        'Ваш аккаунт одобрен.\n' +
        'Нажмите кнопку ниже, чтобы открыть приложение.',
        { reply_markup: { inline_keyboard: keyboard } }
    );
});

// Команда /app
bot.command('app', async (ctx) => {
    const user = users.get(ctx.from?.id);
    
    if (!user || user.status !== 'approved') {
        return ctx.reply('Ожидайте одобрения администратора.');
    }

    await ctx.reply('Открыть приложение:', {
        reply_markup: {
            inline_keyboard: [[
                { text: 'Roblox Game Stats', web_app: { url: WEBAPP_URL } }
            ]]
        }
    });
});

// Команда /help
bot.command('help', async (ctx) => {
    await ctx.reply(
        'Roblox Game Stats\n\n' +
        'Это приложение позволяет:\n' +
        '- Просматривать статистику игр Roblox\n' +
        '- Добавлять свои игры\n' +
        '- Отслеживать посещаемость\n\n' +
        'Команды:\n' +
        '/start - Начать\n' +
        '/app - Открыть приложение\n' +
        '/help - Помощь'
    );
});

// Одобрение пользователя
bot.action(/^approve_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
        return ctx.answerCbQuery('Нет доступа');
    }

    const targetId = parseInt(ctx.match[1]);
    const user = users.get(targetId);
    
    if (user) {
        user.status = 'approved';
        users.set(targetId, user);
    }

    await ctx.answerCbQuery('Одобрено');
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\nОДОБРЕНО');

    try {
        await bot.telegram.sendMessage(
            targetId,
            'Ваш аккаунт одобрен! Нажмите /start чтобы начать.',
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'Открыть приложение', web_app: { url: WEBAPP_URL } }
                    ]]
                }
            }
        );
    } catch (e) {
        console.error('Ошибка уведомления:', e.message);
    }
});

// Отклонение пользователя
bot.action(/^reject_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
        return ctx.answerCbQuery('Нет доступа');
    }

    const targetId = parseInt(ctx.match[1]);
    const user = users.get(targetId);
    
    if (user) {
        user.status = 'rejected';
        users.set(targetId, user);
    }

    await ctx.answerCbQuery('Отклонено');
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\nОТКЛОНЕНО');

    try {
        await bot.telegram.sendMessage(targetId, 'К сожалению, ваша заявка отклонена.');
    } catch (e) {}
});

// Админ панель
bot.action('admin_panel', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
        return ctx.answerCbQuery('Нет доступа');
    }

    await ctx.answerCbQuery();

    const total = users.size;
    const approved = [...users.values()].filter(u => u.status === 'approved').length;
    const pending = [...users.values()].filter(u => u.status === 'pending').length;

    await ctx.reply(
        `Админ панель\n\n` +
        `Статистика:\n` +
        `- Всего пользователей: ${total}\n` +
        `- Одобрено: ${approved}\n` +
        `- Ожидают: ${pending}`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Заявки', callback_data: 'admin_pending' }],
                    [{ text: 'Обновить', callback_data: 'admin_panel' }]
                ]
            }
        }
    );
});

// Список заявок
bot.action('admin_pending', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
        return ctx.answerCbQuery('Нет доступа');
    }

    await ctx.answerCbQuery();

    const pending = [...users.values()].filter(u => u.status === 'pending');

    if (pending.length === 0) {
        return ctx.reply('Нет заявок на рассмотрении');
    }

    for (const user of pending.slice(0, 10)) {
        await ctx.reply(
            `${user.first_name || 'Без имени'}\n` +
            `@${user.username || 'нет'}\n` +
            `ID: ${user.id}`,
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'Одобрить', callback_data: `approve_${user.id}` },
                        { text: 'Отклонить', callback_data: `reject_${user.id}` }
                    ]]
                }
            }
        );
    }
});

// Команда /admin
bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;

    const total = users.size;
    const approved = [...users.values()].filter(u => u.status === 'approved').length;
    const pending = [...users.values()].filter(u => u.status === 'pending').length;

    await ctx.reply(
        `Админ панель\n\n` +
        `Всего: ${total}\n` +
        `Одобрено: ${approved}\n` +
        `Ожидают: ${pending}\n\n` +
        `Админы: ${ADMIN_IDS.join(', ')}`
    );
});

// Обработка ошибок
bot.catch((err, ctx) => {
    console.error('Ошибка бота:', err.message);
});

// === ЗАПУСК БОТА ===
bot.launch({ dropPendingUpdates: true }).then(() => {
    console.log('=====================================');
    console.log('Roblox Game Stats Bot');
    console.log('Бот запущен успешно');
    console.log(`WebApp: ${WEBAPP_URL}`);
    console.log(`Админы: ${ADMIN_IDS.join(', ') || 'не указаны'}`);
    console.log('=====================================');
}).catch(err => {
    console.error('Ошибка запуска бота:', err.message);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));