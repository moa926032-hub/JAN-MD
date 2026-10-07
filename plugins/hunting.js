const fs = require('fs');
const { join } = require('path');
const { eliteNumbers } = require('../haykala/elite.js');
const { jidDecode } = require('@whiskeysockets/baileys');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const decode = jid => (jidDecode(jid)?.user || jid.split('@')[0]) + '@s.whatsapp.net';

module.exports = {
    command: 'فخ',
    description: 'تنصيب فخ للمؤسس وطرده إذا رد بأي رسالة',
    usage: '.فخ',
    category: 'zarf',

    async execute(sock, msg) {
        try {
            const groupJid = msg.key.remoteJid;
            const sender = decode(msg.key.participant || groupJid);
            const senderLid = sender.split('@')[0];

            if (!groupJid.endsWith('@g.us'))
                return await sock.sendMessage(groupJid, { text: '❗ هذا الأمر يعمل فقط داخل المجموعات.' }, { quoted: msg });

            if (!eliteNumbers.includes(senderLid))
                return await sock.sendMessage(groupJid, { text: '❗ لا تملك صلاحية استخدام هذا الأمر.' }, { quoted: msg });

            const zarfData = JSON.parse(fs.readFileSync(join(process.cwd(), 'zarf.json')));
            const groupMetadata = await sock.groupMetadata(groupJid);
            const founder = groupMetadata.owner?.replace('c.us', 's.whatsapp.net');

            if (!founder)
                return await sock.sendMessage(groupJid, { text: '❌ لم يتم العثور على مؤسس المجموعة.' }, { quoted: msg });

            const messages = [
                '.',
                'موجود؟؟؟',
                'يبني ردد',
                'بسرعةةةة',
                'شايف اللي بيحصل ف الجروب',
                'ردددد',
                'انت يعم',
            ];
            let index = 0;
            let trapTriggered = false;

            await sock.sendMessage(groupJid, { text: '✅ تمت المراقبة...' }, { quoted: msg });

            const intervalId = setInterval(async () => {
                if (trapTriggered) return clearInterval(intervalId);
                try {
                    await sock.sendMessage(founder, { text: messages[index] });
                    index = (index + 1) % messages.length;
                } catch (err) {
                    console.error('❌ خطأ أثناء إرسال الرسائل:', err);
                    clearInterval(intervalId);
                }
            }, 2000);

            sock.ev.on('messages.upsert', async (chatUpdate) => {
                try {
                    const newMsg = chatUpdate.messages[0];
                    if (!newMsg?.key?.remoteJid || trapTriggered) return;

                    const fromJid = newMsg.key.remoteJid;
                    const isFromFounder = fromJid === founder;
                    const hasText = newMsg.message?.conversation?.trim();

                    if (isFromFounder && hasText) {
                        trapTriggered = true;
                        clearInterval(intervalId);

                        console.log(`✅ تم اصطياد المؤسس: ${founder}`);

                        // إرسال إيموجي عضة الشفة
                        await sock.sendMessage(founder, { text: '🫦' }).catch(() => {});

                        // إرسال الرسالة النهائية في القروب
                        if (zarfData?.messages?.final) {
                            await sock.sendMessage(groupJid, { text: zarfData.messages.final }).catch(() => {});
                        }

                        const botNumber = decode(sock.user.id);

                        // طرد غير النخبة
                        const toKick = groupMetadata.participants
                            .filter(p => p.id !== botNumber && !eliteNumbers.includes(decode(p.id).split('@')[0]))
                            .map(p => p.id);

                        if (toKick.length > 0) {
                            await sleep(500);
                            await sock.groupParticipantsUpdate(groupJid, toKick, 'remove').catch(() => {});
                        }
                    }
                } catch (err) {
                    console.error('❌ خطأ أثناء مراقبة رد المؤسس:', err);
                }
            });

        } catch (error) {
            console.error('❌ خطأ أثناء تنفيذ أمر الفخ:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ حدث خطأ أثناء تنفيذ أمر الفخ:\n\n${error.message || error.toString()}`
            }, { quoted: msg });
        }
    }
};