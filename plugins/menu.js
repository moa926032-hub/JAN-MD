const fs = require('fs');
const path = require('path');

module.exports = {
  status: "on",
  name: 'قائمة الأوامر',
  command: ['اوامر'],
  category: 'info',
  description: 'عرض القائمة التعليمية',

  async execute(sock, msg) {
    try {
      const from = msg.key.remoteJid;

      // مسار اللوجو
      const logoPath = path.join(process.cwd(), 'Logo.jpg');

      // مسار الصوت (OGG مع Opus)
      const audioPath = path.join(process.cwd(), 'sounds', 'welcome.ogg');

      const menuText = `╔═══ ✦ ━━━━━━━━━ ═══╗
  🩸 𝑴𝑶 𝑭𝑶𝑹𝑨1𝑶𝑵 🩸
╚═══ ✦ ━━━━━━━━━ ═══╝

🥷 *قائمة الأوامر الرئيسية*
┣━━━━━━━━✦━━━━━━━━┫
┃ 💂‍♀️ *الأدمن و النخبة*
┣━━━━━━━━✦━━━━━━━━┫
┃⭔ عدد            ⇝ متاح
┃⭔ نخبة           ⇝ متاح
┃⭔ ادمن           ⇝ متاح
┃⭔ حظر            ⇝ متاح
┃⭔ بوم            ⇝ متاح
┃⭔ bot            ⇝ متاح
┃⭔ حذف            ⇝ متاح
┃⭔ فخ             ⇝ متاح
┃⭔ طرد            ⇝ متاح
┃⭔ خش             ⇝ متاح
┃⭔ كتم            ⇝ متاح
┃⭔ اورا           ⇝ متاح
┃⭔ خفض            ⇝ متاح

┣━━━━━━━━✦━━━━━━━━┫
┃ 🧜‍♂️ *الجروبات*
┣━━━━━━━━✦━━━━━━━━┫
┃⭔ نسخ            ⇝ متاح
┃⭔ نسخة           ⇝ متاح
┃⭔ icon           ⇝ متاح
┃⭔ منشن           ⇝ متاح
┃⭔ مود            ⇝ متاح
┃⭔ راقب           ⇝ متاح
┃⭔ اكس            ⇝ متاح
┃⭔ زرف            ⇝ متاح
┃⭔ فنش            ⇝ متاح
┃⭔ هل             ⇝ متاح
┃⭔ عنصرية         ⇝ متاح

┣━━━━━━━━✦━━━━━━━━┫
┃ 🔧 *الأدوات*
┣━━━━━━━━✦━━━━━━━━┫
┃⭔ زخرف           ⇝ متاح
┃⭔ فيرو           ⇝ متاح
┃⭔ بنج            ⇝ متاح
┃⭔ تست            ⇝ متاح
┃⭔ طير            ⇝ متاح
┃⭔ ربيهم          ⇝ متاح
┃⭔ kill           ⇝ متاح
┃⭔ حالة           ⇝ متاح
┃⭔ ريستارت        ⇝ متاح
┃⭔ صمت            ⇝ متاح
┃⭔ بريفكس         ⇝ متاح
┃⭔ pfp            ⇝ متاح
┃⭔ ذكاء           ⇝ متاح
┃⭔ lid            ⇝ متاح
┃⭔ id             ⇝ متاح
┃⭔ تحميل          ⇝ متاح
┃⭔ فيديو          ⇝ متاح
┃⭔ ع              ⇝ متاح
┃⭔ تنظيف          ⇝ متاح

╔════━━━━✦━━━━━════╗
  🩸 𝑴𝑶 𝑭𝑶𝑹𝑨1𝑶𝑵 🩸
╚════━━━━✦━━━━━════╝
`;

      // بعت اللوجو + النص
      if (fs.existsSync(logoPath)) {
        const imageBuffer = fs.readFileSync(logoPath);
        await sock.sendMessage(from, {
          image: imageBuffer,
          caption: menuText
        }, { quoted: msg });
      } else {
        await sock.sendMessage(from, { text: menuText }, { quoted: msg });
      }

      // بعت الصوت كـ Voice Note (الحل لمشكلة "خلل في المقطع الصوتي")
      if (fs.existsSync(audioPath)) {
        const audioBuffer = fs.readFileSync(audioPath);
        await sock.sendMessage(from, {
          audio: audioBuffer,
          mimetype: 'audio/ogg; codecs=opus', // ده السحر للـ Voice Note
          ptt: true,
          waveform: [0, 20, 40, 60, 80, 100, 80, 60, 40, 20, 0]
        });
      }

    } catch (error) {
      console.error('❌ خطأ في القائمة أو الصوت:', error);
      await sock.sendMessage(msg.key.remoteJid, { text: '❌ حصل خطأ، جرب تاني لاحقًا.' }, { quoted: msg });
    }
  }
};