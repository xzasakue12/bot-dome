const { joinVoiceChannel } = require('@discordjs/voice');
const config = require('../config');

module.exports = {
    name: 'join',
    description: 'เข้าห้องเสียง',
    async execute(message, args) {
        const voiceChannel = message.member.voice.channel;
        
        if (!voiceChannel) {
            return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน!');
        }

        // ตรวจสอบว่าบอทอยู่ในห้องแล้วหรือยัง
        if (config.state.currentConnection && 
            config.state.currentConnection.joinConfig.channelId === voiceChannel.id) {
            return message.reply('✅ บอทอยู่ในห้องเสียงนี้แล้ว!');
        }

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator
            });
            
            config.state.currentConnection = connection;
            config.state.lastTextChannel = message.channel;
            
            message.reply(`🔊 เข้าห้องเสียง **${voiceChannel.name}** แล้ว!`);
        } catch (error) {
            console.error('Join voice channel error:', error);
            message.reply('❌ ไม่สามารถเข้าห้องเสียงได้!');
        }
    }
};
