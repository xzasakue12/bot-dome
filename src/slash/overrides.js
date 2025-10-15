const overrides = {
    play: {
        build: (builder) =>
            builder
                .addStringOption((option) =>
                    option
                        .setName('query')
                        .setDescription('ลิงก์หรือคำค้นหาเพลง')
                        .setRequired(true)
                ),
        toArgs: (interaction) => [interaction.options.getString('query')]
    },
    search: {
        build: (builder) =>
            builder
                .addStringOption((option) =>
                    option
                        .setName('query')
                        .setDescription('คำค้นหาสำหรับหาเพลง')
                        .setRequired(true)
                ),
        toArgs: (interaction) => [interaction.options.getString('query')]
    },
    volume: {
        build: (builder) =>
            builder
                .addIntegerOption((option) =>
                    option
                        .setName('level')
                        .setDescription('ระดับเสียงระหว่าง 0-100')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(100)
                ),
        toArgs: (interaction) => [String(interaction.options.getInteger('level'))]
    },
    skipto: {
        build: (builder) =>
            builder
                .addIntegerOption((option) =>
                    option
                        .setName('position')
                        .setDescription('ลำดับเพลงที่จะข้ามไป')
                        .setRequired(true)
                        .setMinValue(1)
                ),
        toArgs: (interaction) => [String(interaction.options.getInteger('position'))]
    },
    remove: {
        build: (builder) =>
            builder
                .addIntegerOption((option) =>
                    option
                        .setName('position')
                        .setDescription('ลำดับเพลงในคิวที่จะลบ')
                        .setRequired(true)
                        .setMinValue(1)
                ),
        toArgs: (interaction) => [String(interaction.options.getInteger('position'))]
    },
    autoplay: {
        build: (builder) =>
            builder
                .addStringOption((option) =>
                    option
                        .setName('mode')
                        .setDescription('เลือกเปิดหรือปิด autoplay')
                        .setRequired(true)
                        .addChoices(
                            { name: 'เปิด', value: 'on' },
                            { name: 'ปิด', value: 'off' }
                        )
                ),
        toArgs: (interaction) => [interaction.options.getString('mode')]
    },
    bass: {
        build: (builder) =>
            builder
                .addIntegerOption((option) =>
                    option
                        .setName('gain')
                        .setDescription('ค่าระดับเบส (0-20 dB)')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(20)
                ),
        toArgs: (interaction) => [String(interaction.options.getInteger('gain'))]
    }
};

module.exports = overrides;
