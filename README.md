# Dedbit: TMDb Posters + Ratings (FAST v1.8 full)

Userscript สำหรับเว็บไซต์ **[dedbit.com](https://www.dedbit.com/)**  
เพิ่ม **โปสเตอร์ + คะแนน TMDb** ลงในหน้ารายการ โดยไม่ต้องกดเข้าไปที่หน้ารายละเอียด  

## ✨ ฟีเจอร์

- 🎬 **Movie**: ใช้ [TMDb API](https://www.themoviedb.org/documentation/api) เพื่อดึงโปสเตอร์และคะแนน  
  - ถ้าไม่พบข้อมูล → ดึงรูปจากหน้า detail ของ dedbit แทน  
- 📺 **TV Shows**: ดึงรูปจากหน้า detail โดยตรง (ไม่ใช้ TMDb เพื่อเลี่ยงปัญหาการจับคู่ผิด)  
- 🏷️ แสดงคะแนน TMDb เป็น badge สี (เขียว/เหลือง/แดง)  
- 🖼️ Hover บนรูปเพื่อ **ขยายโปสเตอร์** (zoom effect)  
- ⚡ ทำงานแบบ **lazy load** ด้วย `IntersectionObserver` → โหลดเฉพาะรายการที่เห็นบนจอ  
- 💾 ระบบ cache (localStorage) → ลดการเรียก API ซ้ำ, มี TTL 14 วัน  
- 🔑 Hotkey `Ctrl + Alt + D` → กรอกหรือเปลี่ยนค่า **TMDb API Key**  

## 📥 ติดตั้ง

> **ต้องติดตั้ง [Tampermonkey](https://www.tampermonkey.net/)** ก่อน

กดลิงก์ด้านล่างเพื่อ **ติดตั้ง UserScript**:

👉 [**ติดตั้ง Dedbit: TMDb Posters+Ratings (FAST v1.8 full)**](https://raw.githubusercontent.com/Thanatad/dedbit-enhancer/main/dedbit-tmdb.user.js)

## ⚙️ การตั้งค่า

1. สมัครบัญชี [TMDb](https://www.themoviedb.org/signup) และขอ API Key (v3 auth)  
2. เปิดหน้า dedbit แล้วกด `Ctrl + Alt + D` → วาง API Key ลงไป  
3. รีเฟรชหน้า → เสร็จ ✅  
