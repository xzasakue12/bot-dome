# วิธีตั้งค่า Auto-Start Discord Music Bot บน Windows

## 🚀 วิธีที่ 1: Startup Folder (ง่ายที่สุด)

### ขั้นตอน:

1. **กด Win + R** แล้วพิมพ์: `shell:startup`
2. **Copy ไฟล์** `startup-bot.bat` ไปวางในโฟลเดอร์ที่เปิดขึ้นมา
3. **หรือสร้าง Shortcut:**
   - คลิกขวาที่ `startup-bot.bat`
   - เลือก "สร้างทางลัด"
   - ย้ายทางลัดไปที่ Startup folder

### ทดสอบ:
- เปิด `startup-bot.bat` ด้วยตัวเอง
- หรือ Restart เครื่อง

---

## 🔧 วิธีที่ 2: Task Scheduler (ควบคุมได้มากกว่า)

### ขั้นตอน:

1. **เปิด PowerShell เป็น Administrator:**
   - คลิกขวาที่ Start Menu
   - เลือก "Windows PowerShell (Admin)"

2. **รันคำสั่ง:**
```powershell
cd "C:\Users\xzasakue12\my-discord-music-bot"
. .\setup-auto-start.ps1
```

### หรือตั้งค่าด้วยตัวเอง:

1. กด **Win + R** แล้วพิมพ์: `taskschd.msc`
2. คลิก **Create Basic Task**
3. ตั้งค่าตามนี้:
   - **Name:** Discord-Music-Bot
   - **Trigger:** When the computer starts
   - **Action:** Start a program
   - **Program:** `C:\Users\xzasakue12\my-discord-music-bot\startup-bot.bat`
   - **Start in:** `C:\Users\xzasakue12\my-discord-music-bot`
4. ✅ **Finish**

---

## 📝 วิธีที่ 3: PM2 Resurrection (สำหรับที่รัน PM2 อยู่แล้ว)

### ขั้นตอน:

1. **Start บอท:**
```bash
pm2 start ecosystem.config.js
```

2. **Save PM2 process list:**
```bash
pm2 save
```

3. **ตั้งค่าให้ resurrect อัตโนมัติ:**
   - สร้างไฟล์ `pm2-resurrect.bat`:
```batch
@echo off
timeout /t 15 /nobreak >nul
cd /d "C:\Users\xzasakue12\my-discord-music-bot"
pm2 resurrect
```
   - วาง `pm2-resurrect.bat` ใน Startup folder

---

## ✅ แนะนำ: ใช้ Startup Folder

**วิธีที่ง่ายและทำงานได้ดีที่สุด:**

1. กด **Win + R**
2. พิมพ์: `shell:startup`
3. วาง **shortcut** ของ `startup-bot.bat` ลงไป

**เสร็จแล้ว! บอทจะรันอัตโนมัติทุกครั้งที่เปิดเครื่อง** 🎉

---

## 🧪 ทดสอบ

### ทดสอบ script:
```bash
.\startup-bot.bat
```

### ตรวจสอบ PM2:
```bash
pm2 status
pm2 logs my-discord-music-bot
```

### Restart เครื่องเพื่อทดสอบ Auto-start

---

## ❓ Troubleshooting

### บอทไม่รัน?
1. เช็ค PM2: `pm2 status`
2. เช็ค logs: `pm2 logs my-discord-music-bot`
3. ตรวจสอบว่า script อยู่ใน Startup folder

### PM2 ไม่เจอ?
- ตรวจสอบว่าติดตั้ง PM2 แล้ว: `npm list -g pm2`
- ติดตั้งใหม่: `npm install -g pm2`

### Network ไม่พร้อม?
- เพิ่ม delay ใน `startup-bot.bat`:
```batch
timeout /t 30 /nobreak >nul
```
