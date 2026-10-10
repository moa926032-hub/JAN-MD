
const { isElite } = require('../haykala/elite.js')
const { jidDecode } = require('@whiskeysockets/baileys')

const decode = jid =>
    (jidDecode(jid)?.user || jid.split('@')[0]) + '@s.whatsapp.net'

module.exports = {
    command: 'kill',
    description: 'إيقاف تشغيل البوت',
    category: 'owner',

    async execute(sock, msg) {
        const senderJid = msg.key.participant || msg.key.remoteJid
        const sender = decode(senderJid)
        const senderNumber = sender.split('@')[0]

        // رقم حساب البوت
        const botJid = decode(sock.user.id)
        const botNumber = botJid.split('@')[0]

        // التحقق من صاحب رقم البوت أو أعضاء النخبة
        const isBotOwner = senderNumber === botNumber
        const elite = isElite(senderNumber)

        if (!isBotOwner && !elite) {
            return await sock.sendMessage(
                msg.key.remoteJid,
                { text: '❌ الأمر ده لصاحب البوت وأعضاء النخبة بس' },
                { quoted: msg }
            )
        }

        await sock.sendMessage(
            msg.key.remoteJid,
            { text: '⛔ جاري إيقاف تشغيل البوت...' },
            { quoted: msg }
        )

        setTimeout(() => {
            process.exit(0)
        }, 1000)
    }
}
