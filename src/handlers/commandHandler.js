const fs = require('fs');
const path = require('path');

/**
 * โหลดคำสั่งทั้งหมดจากโฟลเดอร์ commands
 */
function loadCommands() {
    const commands = new Map();
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if (command.name && command.execute) {
            commands.set(command.name, command);
            console.log(`✅ Loaded command: ${command.name}`);
        } else {
            console.warn(`⚠️ Command file ${file} is missing name or execute function`);
        }
    }

    return commands;
}

/**
 * จัดการข้อความที่เป็นคำสั่ง
 */
async function handleCommand(message, prefix, commands) {
    // ไม่ตอบสนองต่อข้อความจากบอท
    if (message.author.bot) return;
    // ตรวจสอบว่าข้อความขึ้นต้นด้วย prefix หรือไม่
    if (!message.content.startsWith(prefix)) return;

    // แยกคำสั่งและ arguments
    const args = parseCommandArguments(message.content, prefix);
    const commandName = args.shift().toLowerCase();

    // ค้นหาคำสั่ง
    const command = commands.get(commandName);

    if (!command) return;

    try {
        // รันคำสั่ง
        await command.execute(message, args);
    } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);
        message.reply('❌ เกิดข้อผิดพลาดในการรันคำสั่ง!').catch(console.error);
    }
}

/**
 * แยก arguments จากข้อความคำสั่ง
 */
function parseCommandArguments(content, prefix) {
    return content.slice(prefix.length).trim().split(/\s+/);
}

module.exports = {
    loadCommands,
    handleCommand
};
