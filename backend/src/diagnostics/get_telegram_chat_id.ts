import { telegramBotService } from '../notifications/telegram-bot';

async function findChatId() {
  const token = process.env.TELEGRAM_BOT_TOKEN || '8967922501:AAHTrpdPi5tdOo7RA0elzha74BQPGLNM1rY';
  console.log('🔍 Telegram Bot Diagnostics Tool');
  console.log('Bot Token:', token);

  // 1. Get Me
  const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const meData: any = await meRes.json();

  if (!meData.ok) {
    console.error('❌ Bot Token Error:', meData);
    return;
  }

  const botUser = meData.result;
  console.log(`\n✅ Connected to Bot: @${botUser.username} (${botUser.first_name})`);
  console.log(`⚠️ IMPORTANT: Make sure @${botUser.username} is added as an ADMIN inside your Telegram channel!`);

  // 2. Get Updates
  const updatesRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const updatesData: any = await updatesRes.json();

  if (updatesData.ok && updatesData.result.length > 0) {
    console.log('\nFound Channel/Group Updates:');
    const chats = new Map<number, string>();

    for (const update of updatesData.result) {
      const chat = update.channel_post?.chat || update.message?.chat || update.my_chat_member?.chat;
      if (chat) {
        chats.set(chat.id, `${chat.title || chat.username || 'Private Chat'} (type: ${chat.type})`);
      }
    }

    chats.forEach((title, id) => {
      console.log(`👉 Chat Title: "${title}" | TELEGRAM_CHAT_ID="${id}"`);
    });
  } else {
    console.log('\nℹ️ No recent updates found yet.');
    console.log(`👉 Please post a quick text message (e.g. "hello") inside your Telegram channel where @${botUser.username} is Admin, then run this tool again!`);
  }
}

findChatId().catch(console.error);
