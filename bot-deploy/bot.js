require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');

// === НАСТРОЙКИ ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://itzyakudza.github.io/roblox-game-stats-tg-bot';
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id.trim())).filter(Boolean) || [7662820306]; // ← твой ID жёстко прописан

if (!BOT_TOKEN) {
    console.error('ОШИБКА: BOT_TOKEN не установлен!');
    process.exit(1);
}

// Создаём бота и веб-сервер
const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(express.json());

// Простое хранилище в памяти
const users = new Map();

// === ЛОГИКА БОТА (та же, что была) ===
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    let user = users.get(userId);

    // Если админ — сразу одобряем
    if (ADMIN_IDS.includes(userId)) {
        if (!user) {
            user = { id: userId, status: 'approved', language: 'ru' };
            users.set(userId, user);
        }
        user.status = 'approved';
    }

    if (!user) {
        user = { id: userId, status: 'pending', language: 'ru' };
        users.set(userId, user);

        await ctx.reply('Ваша заявка отправлена на рассмотрение.\nОжидайте одобрения администратора.');

        // Уведомляем админов
        for (const adminId of ADMIN_IDS) {
            try {
                await bot.telegram.sendMessage(
                    adminId,
                    `Новая заявка!\n\nID: ${userId}\nИмя: ${ctx.from.first_name}\n@ ${ctx.from.username || 'нет'}`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: 'Одобрить', callback_data: `approve_${userId}` },
                                    { text: 'Отклонить', callback_data: `reject_${userId}` }
                                ]
                            ]
                        }
                    }
                );
            } catch (e) {}
        }
        return;
    }

    if (user.status !== 'approved') {
        return ctx.reply('Ожидайте одобрения администратора.');
    }

    const keyboard = [
        [{ text: 'Открыть приложение', web_app: { url: WEBAPP_URL } }]
    ];

    if (ADMIN_IDS.includes(userId)) {
        keyboard.push([{ text: 'Админ панель', callback_data: 'admin_panel' }]);
    }

    await ctx.reply('Добро пожаловать в Roblox Game Stats!', {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Одобрение/отклонение
bot.action(/^(approve|reject)_(\d+)$/, async (ctx) => {
    const action = ctx.match[1];
    const targetId = parseInt(ctx.match[2]);

    if (!ADMIN_IDS.includes(ctx.from.id)) {
        return ctx.answerCbQuery('Нет доступа');
    }

    const targetUser = users.get(targetId);
    if (targetUser) {
        targetUser.status = action === 'approve' ? 'approved' : 'rejected';
        users.set(targetId, targetUser);
    }

    await ctx.answerCbQuery(action === 'approve' ? 'Одобрено' : 'Отклонено');
    await ctx.editMessageText(ctx.callbackQuery.message.text + `\n\n${action === 'approve' ? 'ОДОБРЕНО' : 'ОТКЛОНЕНО'}`);

    try {
        await bot.telegram.sendMessage(
            targetId,
            action === 'approve'
                ? 'Ваш аккаунт одобрен!'
                : 'К сожалению, ваша заявка отклонена.'
        );
    } catch (e) {}
});

bot.action('admin_panel', async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;
    await ctx.reply(`Админ панель\nВсего пользователей: ${users.size}`);
});

// === ВАЖНО: Webhook + открытый порт ===
const PORT = process.env.PORT || 3000;

// Устанавливаем webhook
bot.telegram.setWebhook(`https://${process.env.RENDER_EXTERNAL_HOSTNAME || ''}${process.env.RENDER_EXTERNAL_URL || ''}/webhook`);

// Обработчик webhook
app.post('/webhook', (req, res) => {
    bot.handleUpdate(req.body, res);
});

// Главная страница — чтобы Render не ругался
app.get('/', (req, res) => {
    res.send('Roblox Game Stats Bot работает! 24/7');
});

// Запуск сервера
app.listen(PORT, () => {
    console.log('=====================================');
    console.log('Roblox Stats Bot запущен!');
    console.log(`Порт: ${PORT}`);
    console.log(`Админы: ${ADMIN_IDS.join(', ')}`);
    console.log('=====================================');
});