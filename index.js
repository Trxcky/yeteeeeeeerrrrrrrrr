const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent 
    ] 
});

const PREFIX = "!";
const DB_PATH = './db.json';

// Veritabanı yardımcı fonksiyonları
const loadDB = () => {
    if (!fs.existsSync(DB_PATH) || fs.readFileSync(DB_PATH, 'utf8').trim() === "") {
        const initialDB = { stats: { toplam_sorgu: 0, bugun_sorgu: 0, son_tarih: new Date().toLocaleDateString('tr-TR') } };
        fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2));
        return initialDB;
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
};

const saveDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

const checkUser = (db, id) => {
    if (!db[id]) db[id] = { hak: 3 }; 
    return db;
};

const updateStats = (db) => {
    const bugun = new Date().toLocaleDateString('tr-TR');
    if (!db.stats) db.stats = { toplam_sorgu: 0, bugun_sorgu: 0, son_tarih: bugun };
    if (db.stats.son_tarih !== bugun) {
        db.stats.bugun_sorgu = 0;
        db.stats.son_tarih = bugun;
    }
    return db;
};

// 4 PARÇALI VERİ YÜKLEME SİSTEMİ
let userData = [];
try {
    const parts = ['./data_part1.json', './data_part2.json', './data_part3.json', './data_part4.json'];
    parts.forEach(path => {
        if (fs.existsSync(path)) {
            const data = JSON.parse(fs.readFileSync(path, 'utf8'));
            userData = userData.concat(data);
            console.log(`${path} yüklendi.`);
        }
    });
    console.log(`Sistem hazır: Toplam ${userData.length} kayıt hafızaya alındı.`);
} catch (error) {
    console.error("Veri yükleme hatası:", error.message);
}

client.once('ready', () => {
    console.log(`${client.user.tag} aktif ve 4 parça veri ile çalışıyor!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    let db = loadDB();
    db = updateStats(db);

    if (command === 'panel') {
        db = checkUser(db, message.author.id);
        saveDB(db);

        const embed = new EmbedBuilder()
            .setTitle('🛡️ Veri Sorgulama Sistemi')
            .setDescription(`Merhaba ${message.author}, destek ve bot altyapıları için DM üzerinden ulaşabilirsiniz.\n\nSorgulama yapmak için **Sorgula** butonuna, kalan hakkınızı görmek için **Kalan Hak** butonuna tıklayın.`)
            .setColor(0x5865F2)
            .setFooter({ text: 'made by @kahverengigozleri' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sorgula_btn').setLabel('Sorgula').setEmoji('🔍').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('hak_bak_btn').setLabel('Kalan Hak').setEmoji('📊').setStyle(ButtonStyle.Secondary)
        );

        await message.reply({ embeds: [embed], components: [row] });
    }

    if (command === 'hak') {
        const target = message.mentions.users.first() || { id: args[0] || message.author.id };
        db = checkUser(db, target.id);
        saveDB(db);
        message.reply(`<@${target.id}> kullanıcısının kalan sorgu hakkı: \`${db[target.id].hak}\``);
    }

    if (command === 'istatistik') {
        const embed = new EmbedBuilder()
            .setTitle('📈 Kullanım İstatistikleri')
            .addFields(
                { name: 'Bugün Yapılan Sorgu', value: `\`${db.stats.bugun_sorgu}\``, inline: true },
                { name: 'Toplam Sorgu', value: `\`${db.stats.toplam_sorgu}\``, inline: true }
            )
            .setColor(0x2ecc71)
            .setFooter({ text: 'made by @kahverengigozleri' });
        message.reply({ embeds: [embed] });
    }

    if (command === 'hakver' || command === 'haksil') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const targetId = message.mentions.users.first()?.id || args[0];
        const miktar = parseInt(args[1]);
        if (!targetId || isNaN(miktar)) return message.reply(`Kullanım: \`!${command} @kişi/ID miktar\``);

        db = checkUser(db, targetId);
        db[targetId].hak = command === 'hakver' ? db[targetId].hak + miktar : Math.max(0, db[targetId].hak - miktar);
        saveDB(db);
        message.reply(`<@${targetId}> kullanıcısının yeni hakkı: \`${db[targetId].hak}\``);
    }
});

client.on('interactionCreate', async (interaction) => {
    let db = loadDB();
    db = updateStats(db);

    if (interaction.isButton()) {
        const userId = interaction.user.id;
        db = checkUser(db, userId);

        if (interaction.customId === 'hak_bak_btn') {
            return interaction.reply({ content: `📊 Kalan sorgu hakkınız: \`${db[userId].hak}\``, ephemeral: true });
        }

        if (interaction.customId === 'sorgula_btn') {
            if (db[userId].hak <= 0) return interaction.reply({ content: '❌ Sorgu hakkınız bitmiştir. @kahverengigozleri ile iletişime geçin.', ephemeral: true });
            
            const modal = new ModalBuilder().setCustomId('sorgu_modal').setTitle('Veri Sorgulama');
            const input = new TextInputBuilder().setCustomId('id_input').setLabel("Sorgulanacak Discord ID").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'sorgu_modal') {
        const inputId = interaction.fields.getTextInputValue('id_input');
        const result = userData.find(u => u.discord_id === inputId);

        db[interaction.user.id].hak -= 1;
        db.stats.toplam_sorgu += 1;
        db.stats.bugun_sorgu += 1;
        saveDB(db);

        if (result) {
            const embed = new EmbedBuilder()
                .setTitle('✅ Sorgu Sonucu')
                .setColor(0x2ecc71)
                .addFields(
                    { name: 'Discord ID', value: `\`${result.discord_id || "Bulunamadı"}\``, inline: true },
                    { name: 'E-posta', value: `\`${result.email || "Yok"}\``, inline: true },
                    { name: 'IP Adresi', value: `\`${result.ip || "Yok"}\``, inline: false },
                    { name: 'Kalan Hakkınız', value: `\`${db[interaction.user.id].hak}\`` }
                )
                .setFooter({ text: 'made by @kahverengigozleri' });
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({ content: `❌ Aranan ID sistemde bulunamadı. Kalan hakkınız: \`${db[interaction.user.id].hak}\``, ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);