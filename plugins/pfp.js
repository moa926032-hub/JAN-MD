const { extractPureNumber } = require('../haykala/elite');

module.exports = {
  command: 'pfp',
  category: 'إدارة',
  description: 'عرض معلومات الشخص أو من تم منشنه أو كتابة رقمه.',

  async execute(sock, msg) {
    const chatId = msg.key.remoteJid;

    try {
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
      const contextParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const parts = text.trim().split(/\s+/);

      let target;

      // 1. منشن
      if (mentioned?.length) {
        target = mentioned[0];

      // 2. رد على شخص
      } else if (contextParticipant) {
        target = contextParticipant;

      // 3. رقم مباشر بعد الأمر
      } else if (parts[1] && /^\d{5,}$/.test(parts[1])) {
        const pureNumber = extractPureNumber(parts[1]);
        target = pureNumber + '@s.whatsapp.net';

      // 4. fallback = المرسل
      } else {
        target = msg.key.participant || msg.key.remoteJid;
      }

      let ppUrl, about, status, lastSeen;

      try {
        ppUrl = await sock.profilePictureUrl(target, "image");
      } catch {
        ppUrl = "https://i.ibb.co/7JQrJJx/avatar-contact.png";
      }

      try {
        const userInfo = await sock.fetchStatus(target);
        about = userInfo.status || "لا يوجد نبذة";
        status = userInfo.setAt ? new Date(userInfo.setAt * 1000).toLocaleString('ar-SA') : "غير متوفر";
      } catch {
        about = "لا يوجد نبذة";
        status = "غير متوفر";
      }

      try {
        lastSeen = (await sock.fetchPrivacySettings(target)).lastSeen || "مخفي";
      } catch {
        lastSeen = "مخفي";
      }

      let number = target.replace(/@s\.whatsapp\.net$/, '');

      const caption = `*『 معلومات المستخدم 』*\n\n` +
                      `📞 *الرقم:* @${number}\n` +
                      `📝 *النبذة:* ${about}\n` +
                      `⏱️ *آخر تحديث للنبذة:* ${status}\n` +
                      `👁️ *آخر ظهور:* ${lastSeen}\n\n` +
                      `🤖 بواسطة: FORA1ON`;

      await sock.sendMessage(chatId, {
        image: { url: ppUrl },
        caption,
        mentions: [target]
      }, { quoted: msg });

    } catch (err) {
      console.error("خطأ أثناء تنفيذ أمر pfp:", err);
      return sock.sendMessage(chatId, {
        text: '❌ حدث خطأ أثناء جلب المعلومات، حاول لاحقًا.'
      }, { quoted: msg });
    }
  }
};