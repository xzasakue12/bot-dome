const config = require('../config');

module.exports = {
    name: 'help',
    description: 'แสดงรายการคำสั่งทั้งหมด',
    async execute(message, args) {
        const helpMessage = `
🎵 **คำสั่งบอทเพลง** 🎵

**การเล่นเพลง:**
\`!play <url/query>\` - เล่นเพลงจาก YouTube
\`!search <คำค้นหา>\` - ค้นหาและเล่นเพลง
\`!skip\` - ข้ามเพลงปัจจุบัน
\`!skipto <ตำแหน่ง>\` - ข้ามไปเพลงที่ระบุ
\`!stop\` - หยุดเล่นและออกจากห้อง
\`!pause\` - หยุดเพลงชั่วคราว
\`!resume\` - เล่นเพลงต่อ
\`!bass <ระดับเสียง>\` - ปรับเบส

**จัดการคิว:**
\`!queue\` - แสดงรายการเพลงในคิว
\`!clear\` - ล้างคิวทั้งหมด
\`!shuffle\` - สลับลำดับเพลง
\`!remove <ตำแหน่ง>\` - ลบเพลงออกจากคิว
\`!loop <song/queue/off>\` - ตั้งค่าโหมดลูป

**ควบคุมบอท:**
\`!join\` - เข้าห้องเสียง
\`!leave\` - ออกจากห้องเสียง
\`!autoplay <on/off>\` - เปิด/ปิด autoplay

**ข้อมูล:**
\`!nowplaying\` - แสดงเพลงที่กำลังเล่น
\`!lyrics\` - แสดงเนื้อเพลง (เร็วๆ นี้)
\`!stats\` - สถิติบอท
\`!volume <0-100>\` - ปรับระดับเสียง
\`!help\` - แสดงความช่วยเหลือนี้

**เพลย์ลิสต์ & เพลงโปรด:**
\`!favorites <list/add/remove/play>\` - จัดการเพลงโปรดของคุณ
\`!playlists <list/add/remove/sync/play>\` - จัดการเพลย์ลิสต์ของเซิร์ฟเวอร์
\`!filters <list/set/custom/reset>\` - ตั้งค่าเอฟเฟกต์เสียง
\`!history <recent/top/users>\` - ดูประวัติและสถิติการเล่นเพลง

**ฟีเจอร์พิเศษ:**
🎲 Autoplay - เล่นเพลงต่ออัตโนมัติเมื่อคิวหมด
🔂 Loop - ลูปเพลงเดียวหรือทั้งคิว
👋 Auto-leave - ออกจากห้องเมื่อไม่มีคน
        `;

        message.reply(helpMessage.trim());
    }
};
