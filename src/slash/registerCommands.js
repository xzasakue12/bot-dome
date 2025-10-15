const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const overrides = require('./overrides');

function buildSlashPayload(commands) {
    const payloads = [];

    for (const [name, command] of commands.entries()) {
        try {
            const builder = new SlashCommandBuilder()
                .setName(name)
                .setDescription(
                    command.description
                        ? command.description.slice(0, 100)
                        : 'คำสั่งจาก music bot'
                )
                .setDMPermission(false);

            const override = overrides[name];
            if (override?.build) {
                override.build(builder);
            }

            payloads.push(builder.toJSON());
        } catch (error) {
            console.error(`❌ Failed to build slash command for ${name}:`, error);
        }
    }

    return payloads;
}

async function registerSlashCommands({ commands, token, clientId, guildId }) {
    if (!token) {
        console.warn('⚠️ Cannot register slash commands: bot token is missing.');
        return;
    }

    if (!clientId) {
        console.warn('⚠️ Cannot register slash commands: client ID is missing.');
        return;
    }

    const payload = buildSlashPayload(commands);
    const rest = new REST({ version: '10' }).setToken(token);

    const route = guildId
        ? Routes.applicationGuildCommands(clientId, guildId)
        : Routes.applicationCommands(clientId);

    await rest.put(route, { body: payload });
}

module.exports = {
    registerSlashCommands
};
