module.exports = {
    command: 'فيرو',
    description: 'يبعت صورة للصبح',

    async execute(sock, msg) {
        await sock.sendMessage(msg.key.remoteJid, {
            image: { url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80" },
            caption: "ايوا انا صاحي 😪🔫"
        }, { quoted: msg });
    }
};