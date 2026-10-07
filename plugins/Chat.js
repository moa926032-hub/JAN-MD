const axios = require('axios');

// كائن لتخزين سياق المحادثة (الذاكرة)
let chatContext = {};

module.exports = {
  command: 'ذكاء', // اسم الأمر
  description: 'التحدث مع AI (ChatGPT)',
  category: 'ai',

  async execute(sock, msg, args = []) {
    const groupJid = msg.key.remoteJid;
    const senderJid = msg.key.participant || msg.participant || msg.key.remoteJid;
    const text = args.join(' ');

    if (!text) {
      return sock.sendMessage(groupJid, { text: '❌ يرجى كتابة سؤالك بعد الأمر. مثال:\n.ذكاء من هو أينشتاين؟' }, { quoted: msg });
    }

    // إظهار حالة "جاري الكتابة"
    await sock.sendPresenceUpdate('composing', groupJid);

    try {
      // تهيئة الذاكرة للمستخدم إذا لم تكن موجودة
      if (!chatContext[senderJid]) {
        chatContext[senderJid] = [];
      }

      // إضافة سؤال المستخدم للذاكرة
      chatContext[senderJid].push({ role: 'user', content: text });

      // استدعاء API (استخدمنا هنا API مجاني كمثال، يمكنك تغييره بـ API الخاص بك)
      const response = await axios.get(`https://api.maher-zubair.tech/ai/chatgpt?q=${encodeURIComponent(text)}`);
      
      // ملاحظة: هيكلة الرد تعتمد على الـ API المستخدم
      const aiReply = response.data.result || "عذراً، لم أستطع فهم ذلك.";

      // إضافة رد الذكاء الاصطناعي للذاكرة
      chatContext[senderJid].push({ role: 'assistant', content: aiReply });

      // تنظيف الذاكرة إذا زادت عن 10 رسائل (للحفاظ على الأداء)
      if (chatContext[senderJid].length > 10) {
        chatContext[senderJid].shift();
      }

      // إرسال الرد
      return sock.sendMessage(groupJid, { text: aiReply }, { quoted: msg });

    } catch (err) {
      console.error(err);
      return sock.sendMessage(groupJid, { text: '❌ حدث خطأ أثناء الاتصال بالذكاء الاصطناعي.' }, { quoted: msg });
    } finally {
      // إيقاف حالة "جاري الكتابة"
      await sock.sendPresenceUpdate('paused', groupJid);
    }
  }
};
