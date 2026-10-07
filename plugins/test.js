
module.exports = {
    command: 'تست',
    description: 'اختبار البوت',
    usage: '.test',
    category: 'tools',    
    
    async execute(sock, msg) {
        try {
            const decoratedText = `𝑭𝑶𝑹𝑨1𝑶𝑵 𝑰𝑺 𝑾𝑶𝑹𝑲𝑰𝑵𝑮 𝑵𝑶𝑾`;
            await sock.sendMessage(msg.key.remoteJid, {
                text: decoratedText,
                mentions: [msg.sender]
            }, { quoted: msg });
        } catch (error) {
            console.error('❌', 'Error executing test:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: responses.error.general(error.message || error.toString())
            }, { quoted: msg });
        }
    }
};