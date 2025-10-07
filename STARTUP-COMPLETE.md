# ✅ Auto-Start Setup สำเร็จ!

## 🎉 สิ่งที่ติดตั้งแล้ว:

### 1. **Startup Script** ✅
- `startup-bot.bat` - สคริปต์สำหรับเริ่มบอท
- อยู่ที่: `C:\Users\xzasakue12\my-discord-music-bot\startup-bot.bat`

### 2. **Startup Shortcut** ✅
- สร้าง shortcut ใน Windows Startup folder แล้ว
- ตำแหน่ง: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Discord-Music-Bot.lnk`

### 3. **สิ่งที่สคริปต์ทำ:**
1. รอ network 10 วินาที
2. ตรวจสอบว่า PM2 process มีอยู่แล้วหรือไม่
3. ถ้ามี → Restart
4. ถ้าไม่มี → Start ใหม่
5. Save PM2 process list

---

## 🚀 การทำงาน:

### เมื่อเปิดเครื่อง Windows:
1. Windows โหลด Startup folder
2. รัน `Discord-Music-Bot.lnk`
3. เรียก `startup-bot.bat`
4. บอทเริ่มทำงานอัตโนมัติ!

### ไม่ต้องเปิด VS Code!
- บอทจะรันในพื้นหลังด้วย PM2
- ไม่จำเป็นต้องเปิด Terminal หรือ VS Code

---

## 🧪 วิธีทดสอบ:

### ทดสอบทันที:
```powershell
# วิธีที่ 1: รันสคริปต์โดยตรง
cd C:\Users\xzasakue12\my-discord-music-bot
.\startup-bot.bat

# วิธีที่ 2: Double-click shortcut ใน Startup folder
explorer shell:startup
```

### ทดสอบจริง:
1. **Restart เครื่อง**
2. **รอ 30-40 วินาที** (ให้ Windows และ Network โหลด)
3. **ตรวจสอบ:**
```powershell
pm2 status
pm2 logs my-discord-music-bot
```

---

## 📋 คำสั่งที่ใช้บ่อย:

### ดูสถานะบอท:
```powershell
pm2 status
pm2 logs my-discord-music-bot --lines 20
```

### จัดการบอท:
```powershell
pm2 restart my-discord-music-bot   # รีสตาร์ท
pm2 stop my-discord-music-bot      # หยุด
pm2 start ecosystem.config.js      # เริ่มใหม่
```

### ดู Startup folder:
```powershell
explorer shell:startup
```

---

## 🔧 การแก้ไข:

### ต้องการเปลี่ยน delay:
แก้ไขใน `startup-bot.bat`:
```batch
timeout /t 30 /nobreak >nul    # เปลี่ยน 10 เป็น 30 วินาที
```

### ต้องการลบ Auto-start:
```powershell
# ลบ shortcut
Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Discord-Music-Bot.lnk"
```

### ต้องการสร้าง shortcut ใหม่:
```powershell
cd C:\Users\xzasakue12\my-discord-music-bot
.\create-startup-shortcut.ps1
```

---

## ❓ Troubleshooting:

### บอทไม่รันหลัง Restart?

**1. ตรวจสอบ PM2:**
```powershell
pm2 list
pm2 logs my-discord-music-bot --lines 50
```

**2. ตรวจสอบ Shortcut:**
```powershell
Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Discord-Music-Bot.lnk"
# ควรได้ True
```

**3. ตรวจสอบ Network:**
- บอทต้องการ internet เพื่อ login Discord
- ถ้า network ช้า ให้เพิ่ม delay ใน startup-bot.bat

**4. ดู Event Log:**
- กด Win + X → Event Viewer
- Windows Logs → Application
- หา error ที่เกี่ยวกับ PM2 หรือ Node.js

---

## ✅ สรุป:

**บอทจะรันอัตโนมัติทุกครั้งที่เปิดเครื่อง!**

- ✅ ไม่ต้องเปิด VS Code
- ✅ ไม่ต้องรันคำสั่งเอง
- ✅ รันในพื้นหลังด้วย PM2
- ✅ Auto-restart เมื่อ crash
- ✅ บันทึก logs ไว้ใน `logs/` folder

---

**🎮 Discord Bot พร้อมใช้งาน 24/7!** 🎉
