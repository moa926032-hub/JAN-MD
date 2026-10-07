const { isElite } = require('../haykala/elite.js');
const { jidDecode } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const decode = jid => (jidDecode(jid)?.user || jid.split('@')[0]) + '@s.whatsapp.net';

module.exports = {
    command: 'فيديو',
    description: 'تحميل فيديو من يوتيوب (رابط أو اسم)',
    usage: '.فيديو [رابط أو اسم الفيديو]',

    async execute(sock, msg) {
        try {
            const groupJid = msg.key.remoteJid;
            const sender = decode(msg.key.participant || groupJid);
            const senderLid = sender.split('@')[0];

            if (!groupJid.endsWith('@g.us')) {
                return await sock.sendMessage(groupJid, { text: '❗ الأمر ده للجروبات بس' }, { quoted: msg });
            }

            if (!isElite(senderLid)) {
                return await sock.sendMessage(groupJid, { text: '❌ انت مش من الإيليت' }, { quoted: msg });
            }

            const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            const args = body.trim().split(/\s+/);
            const query = args.slice(1).join(' ').trim();

            if (!query) {
                return await sock.sendMessage(groupJid, {
                    text: 'اكتب رابط يوتيوب أو اسم الفيديو بعد الأمر\nمثال: .فيديو https://youtu.be/dQw4w9WgXcQ'
                }, { quoted: msg });
            }

            await sock.sendMessage(groupJid, { react: { text: '⏳', key: msg.key } });

            // الأمر المصحح – اقتباس صحيح وطريقة آمنة
            const cmd = [
                'yt-dlp',
                '--js-runtimes', 'node',
                '--remote-components', 'ejs:github',
                '-f', '18',
                '--no-playlist',
                '--print', '%(url)s',
                `"${query.replace(/"/g, '\\"')}"`
            ].join(' ');

            const { stdout, stderr } = await execPromise(cmd);

            // طباعة للديباگ (يمكن حذفها بعد ما تتأكد إنه شغال)
            console.log('[DEBUG yt-dlp] cmd:', cmd);
            if (stderr) console.log('[DEBUG yt-dlp stderr]:', stderr);
            console.log('[DEBUG yt-dlp stdout]:', stdout);

            if (stderr && stderr.includes('ERROR')) {
                throw new Error(stderr.split('\n').find(l => l.includes('ERROR')) || stderr);
            }

            // استخراج الرابط (آخر سطر يبدأ بـ http/https)
            const lines = stdout.split('\n').map(l => l.trim());
            const videoUrl = lines.reverse().find(l => l.startsWith('http')) || '';

            if (!videoUrl) {
                throw new Error('ما طلعش رابط تحميل صالح');
            }

            // عنوان افتراضي + محاولة استخراج العنوان
            let title = 'فيديو من يوتيوب';
            try {
                const infoCmd = `yt-dlp --dump-json "${query.replace(/"/g, '\\"')}"`;
                const { stdout: json } = await execPromise(infoCmd);
                title = JSON.parse(json).title || title;
            } catch {}

            await sock.sendMessage(groupJid, {
                video: { url: videoUrl },
                caption: `🎬 ${title}\n\nـ〆 ⚡ 𝐓𝐘𝐒𝐎𝐍 𝐄𝐋 𝐘𝐎𝐔𝐓𝐔𝐎𝐁𝐄𝐑 🐦🖤 ⚡ 〆ـ`
            }, { quoted: msg });

            await sock.sendMessage(groupJid, { react: { text: '✅', key: msg.key } });

        } catch (err) {
            console.error('[فيديو خطأ]:', err);

            const txt = [
                '❌ حصل خطأ أثناء التحميل:',
                err.message || 'غير معروف',
                '',
                'حلول سريعة:',
                '1. جرب رابط فيديو تاني',
                '2. حدث yt-dlp:',
                '   pip install -U yt-dlp yt-dlp-ejs',
                '3. جرب الأمر يدويًا في Termux:',
                '   yt-dlp -f 18 --print "%(url)s" "https://youtu.be/dQw4w9WgXcQ"'
            ].join('\n');

            await sock.sendMessage(msg.key.remoteJid, { text: txt }, { quoted: msg });
            await sock.sendMessage(msg.key.remoteJid, { react: { text: '❌', key: msg.key } });
        }
    }
};