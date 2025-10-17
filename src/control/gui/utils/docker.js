export function parseDockerStatus(raw) {
    if (!raw || typeof raw !== 'string') return {};
    const lines = raw.split('\n').map(line => line.trim()).filter(Boolean);
    const result = {};

    for (const line of lines) {
        if (!line || line.startsWith('NAME') || line.startsWith('-')) continue;
        const parts = line.split(/\s{2,}/).filter(Boolean);
        if (!parts.length) continue;

        const name = parts[0];
        const service = parts[3] || '';
        const status = parts[5] || parts[4] || '';
        const created = parts[4] || '';

        result[name] = {
            name,
            service,
            status,
            created
        };
    }

    return result;
}
