# Git Branch Strategy

โปรเจคนี้ใช้ Git Flow แบบง่ายสำหรับจัดการ version

## 📋 Branch Structure

### 🌳 Main Branches

#### `main`
- **Production branch** - โค้ดที่ stable และพร้อมใช้งาน
- ใช้สำหรับ deploy จริง
- ห้ามแก้ไขโดยตรง ต้อง merge จาก branch อื่น
- มี tag version (v1.0.0, v1.1.0, etc.)

#### `develop`
- **Development branch** - สำหรับพัฒนาฟีเจอร์ใหม่
- รวมโค้ดที่กำลังพัฒนา
- ทดสอบฟีเจอร์ใหม่ที่นี่ก่อน merge เข้า main

#### `v1.0`
- **Stable release branch** - เก็บ version 1.0.0 ไว้
- สำหรับ reference หรือ rollback
- ไม่แก้ไขโดยตรง

---

## 🔧 Working Branches

### Feature Branches
สร้างจาก: `develop`  
Merge กลับไปยัง: `develop`  
ตั้งชื่อ: `feature/<feature-name>`

```bash
# สร้าง feature branch
git checkout develop
git checkout -b feature/new-feature

# เสร็จแล้ว merge กลับ
git checkout develop
git merge feature/new-feature
git push origin develop
git branch -d feature/new-feature
```

**ตัวอย่าง:**
- `feature/playlist-support`
- `feature/search-command`
- `feature/loop-song`

### Bugfix Branches
สร้างจาก: `develop`  
Merge กลับไปยัง: `develop`  
ตั้งชื่อ: `bugfix/<bug-name>`

```bash
# สร้าง bugfix branch
git checkout develop
git checkout -b bugfix/fix-volume-issue

# เสร็จแล้ว merge กลับ
git checkout develop
git merge bugfix/fix-volume-issue
git push origin develop
git branch -d bugfix/fix-volume-issue
```

**ตัวอย่าง:**
- `bugfix/fix-queue-display`
- `bugfix/fix-autoplay-error`
- `bugfix/fix-volume-control`

### Hotfix Branches
สร้างจาก: `main`  
Merge กลับไปยัง: `main` และ `develop`  
ตั้งชื่อ: `hotfix/<fix-name>`

```bash
# สร้าง hotfix branch (แก้ bug ด่วนใน production)
git checkout main
git checkout -b hotfix/critical-fix

# เสร็จแล้ว merge กลับทั้งสอง branch
git checkout main
git merge hotfix/critical-fix
git push origin main

git checkout develop
git merge hotfix/critical-fix
git push origin develop

git branch -d hotfix/critical-fix
```

**ตัวอย่าง:**
- `hotfix/fix-bot-crash`
- `hotfix/fix-connection-error`

---

## 📦 Release Process

### 1. เตรียม Release จาก develop
```bash
# สร้าง release branch
git checkout develop
git checkout -b release/v1.1.0

# อัปเดต version ใน package.json และ CHANGELOG.md
# ทดสอบให้แน่ใจว่าทุกอย่างทำงาน

git add .
git commit -m "Prepare release v1.1.0"
```

### 2. Merge เข้า main และสร้าง tag
```bash
# Merge เข้า main
git checkout main
git merge release/v1.1.0

# สร้าง tag
git tag -a v1.1.0 -m "Release v1.1.0"

# Push ทั้งหมด
git push origin main
git push origin v1.1.0
```

### 3. Merge กลับเข้า develop
```bash
# Merge กลับเข้า develop
git checkout develop
git merge release/v1.1.0

# Push และลบ release branch
git push origin develop
git branch -d release/v1.1.0
```

---

## 🎯 Quick Commands

### ดู branch ปัจจุบัน
```bash
git branch
git branch -a  # ดูทั้งหมดรวม remote
```

### สลับ branch
```bash
git checkout main
git checkout develop
```

### สร้าง branch ใหม่
```bash
git checkout -b feature/new-feature
```

### ลบ branch
```bash
git branch -d feature/old-feature  # ลบ local
git push origin --delete feature/old-feature  # ลบ remote
```

### ดู log
```bash
git log --oneline --graph --all
```

---

## 📊 Current Branch Status

```
main (v1.0.0)
  └─ v1.0 (stable)
  └─ develop (active development)
      └─ feature/* (new features)
      └─ bugfix/* (bug fixes)
```

---

## 💡 Best Practices

1. **ห้าม commit โดยตรงบน main** - ใช้ branch เสมอ
2. **Pull request** - ใช้ PR สำหรับ code review (ถ้ามีทีม)
3. **Commit message** - เขียนให้ชัดเจน
   - `feat: add playlist support`
   - `fix: resolve volume control issue`
   - `docs: update README`
4. **ทดสอบก่อน merge** - ตรวจสอบให้แน่ใจว่าทุกอย่างทำงาน
5. **เก็บ branch ให้สะอาด** - ลบ branch ที่ merge แล้ว

---

## 🔄 Typical Workflow

```
1. สร้าง feature branch จาก develop
   └─> พัฒนาฟีเจอร์
   └─> ทดสอบ
   └─> Commit
   └─> Merge กลับ develop

2. เมื่อพร้อม release
   └─> สร้าง release branch
   └─> อัปเดต version
   └─> Merge เข้า main
   └─> สร้าง tag
   └─> Merge กลับ develop

3. ถ้ามี bug ด่วน
   └─> สร้าง hotfix จาก main
   └─> แก้ไข
   └─> Merge เข้า main และ develop
```

---

<div align="center">
  <p>🌿 Happy Branching! 🌿</p>
</div>
