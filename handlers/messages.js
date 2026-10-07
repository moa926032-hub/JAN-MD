const config = require('../config');
const logger = require('../utils/console');
const { loadPlugins } = require('./plugins');

async function handleMessages(sock, { messages }) {
    if (!messages || !messages[0]) return;
    
    const msg = messages[0];
    
    try {
        const messageText = msg.message?.conversation ||
                            msg.message?.extendedTextMessage?.text ||
                            msg.message?.imageMessage?.caption ||
                            msg.message?.videoMessage?.caption || '';

        msg.isGroup = msg.key.remoteJid.endsWith('@g.us');
        msg.sender = msg.key.participant || msg.key.remoteJid;
        msg.chat = msg.key.remoteJid;
        
        msg.reply = async (text) => {
            try {
                await sock.sendMessage(msg.chat, { text }, { quoted: msg });
            } catch (error) {
                logger.error('خطأ في إرسال الرد:', error);
            }
        };

        const plugins = await loadPlugins();

        // لو الرسالة في جروب، نفذ الأوامر بس (مش نرد على كل حاجة في الجروب عشان ما يبقاش سبام)
        if (msg.isGroup) {
            if (!messageText.startsWith(config.prefix)) return;

            const args = messageText.slice(config.prefix.length).trim().split(/\s+/);
            const command = args.shift()?.toLowerCase();
            
            const plugin = plugins[command];

            if (plugin) {
                logger.info(`تنفيذ الأمر: ${command} من ${msg.sender}`);
                try {
                    await plugin.execute(sock, msg, args);
                } catch (error) {
                    logger.error(`خطأ في تنفيذ الأمر ${command}:`, error);
                    await sock.sendMessage(msg.chat, { 
                        text: config.messages.error 
                    }, { quoted: msg });
                }
            }
            return;
        }

        // لو الشات شخصي (هنا اللي عايزينه يرد على أي حاجة)
        // لو الرسالة تبدأ بـ prefix، نفذ الأمر عادي
        if (messageText.startsWith(config.prefix)) {
            const args = messageText.slice(config.prefix.length).trim().split(/\s+/);
            const command = args.shift()?.toLowerCase();
            
            const plugin = plugins[command];

            if (plugin) {
                logger.info(`تنفيذ الأمر: ${command} من ${msg.sender}`);
                try {
                    await plugin.execute(sock, msg, args);
                } catch (error) {
                    logger.error(`خطأ في تنفيذ الأمر ${command}:`, error);
                    await sock.sendMessage(msg.chat, { 
                        text: config.messages.error 
                    }, { quoted: msg });
                }
            }
        } else {
            // لو الرسالة مش أمر (أي كلام، إيموجي، أي حاجة) → بعت القائمة تلقائيًا
            const menuPlugin = plugins['أوامر'] || plugins['menu'] || plugins['قائمة'];
            if (menuPlugin) {
                logger.info(`إرسال القائمة التلقائية لـ ${msg.sender}`);
                try {
                    await menuPlugin.execute(sock, msg, []);
                } catch (error) {
                    logger.error('خطأ في إرسال القائمة التلقائية:', error);
                }
            }
        }

    } catch (error) {
        logger.error('خطأ في معالجة الرسالة:', error);
        try {
            await sock.sendMessage(msg.key.remoteJid, {
                text: config.messages.error
            });
        } catch (sendError) {
            logger.error('فشل في إرسال رسالة الخطأ:', sendError);
        }
    }
}

module.exports = {
    handleMessages
};