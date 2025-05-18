const fs = require("fs");
const { chromium } = require("playwright");
const axios = require("axios");
const path = require("path");

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // פתיחת פייסבוק וכניסה לקבוצה
    await page.goto('http://www.facebook.com/');
    
    // התחברות לחשבון אם צריך
    // await page.fill('input[name="email"]', 'your_email');
    // await randomWait(page);
    // await page.fill('input[name="pass"]', 'your_password');
    // await randomWait(page);
    // await page.click('button[name="login"]');
    
    // מעבר לקבוצת היעד
    const groupUrl = 'https://www.facebook.com/groups/287564448778602/?hoisted_section_header_type=recently_seen&multi_permalinks=1791932841675081';
    await page.goto(groupUrl);
    await page.waitForLoadState('networkidle');
    
    // טיפול בחלון קוקיז אם מופיע
    const acceptCookies = await page.$("div[role='button'][aria-label='לאפשר את כל קובצי ה-Cookie'] span");
    if(acceptCookies){
        await acceptCookies.evaluate(el => el.click());
    }
    
    // המתנה לטעינת פוסטים
    await page.waitForSelector('div[role="article"]');
    
    let allPosts = [];
    
    // הגדרת מספר הפוסטים שרוצים לאסוף
    const numberOfPostsToCollect = 5;
    
    // ודא שיש לנו מספיק פוסטים נראים
    for (let i = 0; i < numberOfPostsToCollect; i++) {
        // גלילה למטה כדי לוודא שיש מספיק פוסטים נטענים
        await autoScroll(page);
    }
    
    // איסוף כל הפוסטים
    const posts = await page.$$('div[role="article"]');
    console.log(`נמצאו ${posts.length} פוסטים בדף`);
    
    // אוסף רק את מספר הפוסטים שאנחנו צריכים
    for (let i = 0; i < Math.min(numberOfPostsToCollect, posts.length); i++) {
        console.log(`מעבד פוסט ${i + 1} מתוך ${numberOfPostsToCollect}`);
        
        const post = posts[i];
        
        if (!post) {
            console.log(`לא נמצא פוסט ${i + 1}`);
            continue;
        }
        
        // גלילה לפוסט כדי לוודא שהוא נראה
        await post.evaluate(node => node.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await page.waitForTimeout(1000);
        
        let galleryImages = new Set();
        
        // חיפוש תמונה רלוונטית בפוסט
        const candidateImgs = await post.$$('img');
        let firstImg = null;
        for (const img of candidateImgs) {
            const src = await img.getAttribute("src");
            if (src && src.includes('scontent')) {
                firstImg = img;
                break;
            }
        }
        
        if (firstImg) {
            try {
                await firstImg.click();
                await page.waitForSelector('div[role="dialog"] img', { timeout: 5000 });
                
                const firstSrc = await page.$eval("div[role='dialog'] img", img => img.src);
                galleryImages.add(firstSrc);
                
                let currSrc;
                while (true) {
                    const nextBtn = await page.$("div[role='dialog'] [aria-label='הצגת התמונה הבאה']");
                    if (!nextBtn) break;
                    
                    await randomWait(page);
                    await nextBtn.click();
                    await page.waitForTimeout(1000);
                    
                    currSrc = await page.$eval("div[role='dialog'] img", img => img.src);
                    if (galleryImages.has(currSrc)) break;
                    galleryImages.add(currSrc);
                }
                
                await page.keyboard.press("Escape");
                await page.waitForTimeout(500);
            } catch (e) {
                console.log("לא ניתן היה לפתוח את הגלריה או ללחוץ על תמונה:", e.message);
            }
        }
        
        // איסוף כל התמונות הרגילות (גם אם אין גלריה) וסינון לפי גודל תמונה כדי לא לקחת אימוג'י
        const inlineImages = await post.$$eval("img", imgs =>
            imgs
                .filter(img => img.naturalWidth > 40 && img.naturalHeight > 40)
                .map(img => img.src)
        );
        
        const allImages = [...new Set([...inlineImages, ...Array.from(galleryImages)])];
        
        // לחיצה על "ראה עוד" כדי להרחיב את הטקסט
        const seeMoreBtn = await post.$("div[role=button]:has-text('ראה עוד')");
        if (seeMoreBtn) {
            try {
                await seeMoreBtn.evaluate(el => el.click());
                await page.waitForTimeout(500);
            } catch (e) {
                console.log("לא הצליח ללחוץ על 'ראה עוד':", e.message);
            }
        }
        
        let text = "";
        try {
            text = await post.innerText();
        } catch (e) {
            console.log("לא הצלחנו לקרוא את הטקסט של הפוסט:", e.message);
        }
        
        console.log("טקסט הפוסט:");
        console.log(text);
        console.log("\n תמונות:");
        console.log(allImages);
        
        const folderName = `post_${i + 1}`;
        fs.mkdirSync(folderName, { recursive: true });
        
        let imageFilenames = [];
        for (let j = 0; j < allImages.length; j++) {
            const imageUrl = allImages[j];
            const filename = `${folderName}/image_${j + 1}.jpg`;
            try {
                await downloadImage(imageUrl, filename);
                imageFilenames.push(filename);
            } catch (err) {
                console.log(`שגיאה בהורדת תמונה ${j + 1}:`, err.message);
            }
        }
        
        allPosts.push({
            text,
            images: imageFilenames
        });
        
        // המתנה קצרה בין פוסטים
        await page.waitForTimeout(2000);
    }
    
    // שמירת כל המידע לקובץ JSON
    fs.writeFileSync("posts.json", JSON.stringify(allPosts, null, 2), "utf-8");
    console.log(`סיימנו לאסוף ${allPosts.length} פוסטים. המידע נשמר בקובץ posts.json`);
    
    // סגירת הדפדפן לאחר סיום
    await browser.close();
})().catch(err => {
    console.error("שגיאה:", err);
});

// פונקציה להורדת תמונה
async function downloadImage(url, filename) {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const filePath = path.join(__dirname, filename);
    fs.writeFileSync(filePath, response.data);
    console.log(`נשמרה תמונה: ${filename}`);
}

// פונקציה להמתנה אקראית - עכשיו מקבלת את האובייקט page כדי להימנע משגיאות
async function randomWait(page) {
    const ms = Math.floor(Math.random() * 3000) + 500; // זמן המתנה קצר יותר מהמקורי
    await page.waitForTimeout(ms);
}

// פונקציה לגלילה אוטומטית
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
    
    // המתנה קצרה לאחר הגלילה כדי לאפשר לתוכן להיטען
    await page.waitForTimeout(1000);
}