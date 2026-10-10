const { downloadMediaMessage } = require('@whiskeysockets/baileys')

module.exports = {
command: 'سحب',
category: 'أدوات',
description: 'سحب صورة أو فيديو من حالة واتساب',

async execute(sock, msg) {
    try {
        const chatId = msg.key.remoteJid
        const message = msg.message || {}

        // استخراج بيانات الحالة المقتبس منها
        const context =
            message.extendedTextMessage?.contextInfo ||
            message.imageMessage?.contextInfo ||
            message.videoMessage?.contextInfo

        const quotedMessage = context?.quotedMessage
        const quotedKey = context?.stanzaId
            ? {
                remoteJid: 'status@broadcast',
                id: context.stanzaId,
                participant: context.participant
            }
            : null

        if (!quotedMessage) {
            return await sock.sendMessage(chatId, {
                text: 'رد على الحالة نفسها بكتابة .سحب علشان أقدر أحاول أسحبها'
            }, { quoted: msg })
        }

        // تحديد نوع الوسائط المقتبسة
        const mediaMessage =
            quotedMessage.imageMessage ||
            quotedMessage.videoMessage

        if (!mediaMessage) {
            return await sock.sendMessage(chatId, {
                text: 'الحالة المقتبسة مش صورة أو فيديو أو الوسائط مش متاحة'
            }, { quoted: msg })
        }

        const mediaType = quotedMessage.imageMessage ? 'image' : 'video'
        const botJid = sock.user?.id
        if (!botJid) {
            throw new Error('تعذر تحديد حساب البوت')
        }

        const botNumber = botJid.split(':')[0].replace(/[^0-9]/g, '')
        const botPrivateJid = `${botNumber}@s.whatsapp.net`

        // تنزيل الوسائط من الرسالة المقتبسة
        const mediaBuffer = await downloadMediaMessage(
            {
                key: quotedKey,
                message: quotedMessage
            },
            'buffer',
            {},
            {
                logger: console,
                reuploadRequest: sock.updateMediaMessage
                    ? sock.updateMediaMessage.bind(sock)
                    : undefined
            }
        )

        await sock.sendMessage(botPrivateJid, {
            [mediaType]: mediaBuffer,
            caption: 'تم سحب الحالة بنجاح'
        })

        await sock.sendMessage(chatId, {
            text: 'تم السحب بنجاح 🧜‍♂️'
        }, { quoted: msg })

    } catch (error) {
        console.error('خطأ في أمر سحب الحالة:', error)

        await sock.sendMessage(msg.key.remoteJid, {
            text: 'معرفتش أسحب الحالة دي، ممكن تكون الوسائط مش متاحة أو واتساب مش مدي صلاحية لتنزيلها'
        }, { quoted: msg })
    }
}

}