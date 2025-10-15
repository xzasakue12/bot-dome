const overrides = require('./overrides');

function createMessageAdapter(interaction) {
    let hasReplied = interaction.replied;

    const send = async (content) => {
        if (!hasReplied) {
            hasReplied = true;
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply(content);
            }
            return interaction.reply(content);
        }
        return interaction.followUp(content);
    };

    return {
        author: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        channel: {
            send
        },
        client: interaction.client,
        interaction,
        content: `/${interaction.commandName}`,
        reply: send
    };
}

function buildArgs(interaction) {
    const override = overrides[interaction.commandName];
    if (override?.toArgs) {
        const transformed = override.toArgs(interaction);
        return Array.isArray(transformed) ? transformed.filter((value) => value !== undefined && value !== null) : [];
    }
    return [];
}

async function safeReply(interaction, payload) {
    try {
        if (interaction.replied) {
            return interaction.followUp(payload);
        }
        if (interaction.deferred) {
            return interaction.editReply(payload);
        }
        return interaction.reply(payload);
    } catch (error) {
        console.error('❌ Failed to send interaction response:', error);
        return undefined;
    }
}

async function handleSlashCommand(interaction, commands) {
    const command = commands.get(interaction.commandName);
    if (!command) {
        await safeReply(interaction, {
            content: '❌ ไม่พบบริการคำสั่งนี้ในบอท',
            ephemeral: true
        });
        return;
    }

    if (!interaction.deferred && !interaction.replied) {
        try {
            await interaction.deferReply();
        } catch (error) {
            if (error.code !== 40060) {
                console.error('❌ Failed to defer interaction:', error);
            }
        }
    }

    const adapterMessage = createMessageAdapter(interaction);
    const args = buildArgs(interaction);

    try {
        await command.execute(adapterMessage, args);
        if (!interaction.replied && interaction.deferred) {
            await interaction.editReply('✅ ดำเนินการเรียบร้อยแล้ว');
        }
    } catch (error) {
        console.error(`❌ Slash command ${interaction.commandName} failed:`, error);
        await safeReply(interaction, {
            content: '❌ เกิดข้อผิดพลาดในการรันคำสั่ง กรุณาลองใหม่อีกครั้ง',
            ephemeral: true
        });
    }
}

module.exports = {
    handleSlashCommand
};
