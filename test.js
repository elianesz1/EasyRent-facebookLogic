const fs = require("fs");
const { chromium } = require("playwright");
const axios = require("axios");
const path = require("path");

(async () => {

    //FREE PROXY!!!!!!
    // // --- טוען את רשימת הפרוקסים
    // const proxyList = JSON.parse(fs.readFileSync("proxies.json", "utf-8"));

    // // --- בוחר אחד אקראי
    // const randomProxy = proxyList[Math.floor(Math.random() * proxyList.length)];

    // // --- מפענח אם יש שם משתמש וסיסמה
    // let proxyOptions = {};
    // const match = randomProxy.match(/http:\/\/(?:(.*):(.*)@)?(.*)/);
    // if (match) {
    //     const [, username, password, host] = match;
    //     proxyOptions.server = `http://${host}`;
    //     if (username && password) {
    //         proxyOptions.username = username;
    //         proxyOptions.password = password;
    //     }
    // }

    // // --- מפעיל את הדפדפן עם פרוקסי
    // let browser = await chromium.launch({
    //     headless: false,
    //     proxy: proxyOptions
    // });

    //--------------------TORO!!!!---------------------------

    // //TORO!!!!!!
    // const browser = await chromium.launch({
    //     headless: false,
    //     proxy: {
    //         server: 'socks5://127.0.0.1:9050' // ← כתובת פרוקסי TOR
    //     }
    // });

    // const context = await browser.newContext({
    //     ignoreHTTPSErrors: true
    // });
    // const page = await context.newPage();

    // await page.goto('https://www.facebook.com/');

    //---------------------------------------------------------

    // console.log("משתמש בפרוקסי:", randomProxy);
    // await page.goto("http://api.ipify.org?format=json");
    // const ipText = await page.textContent("body");
    // console.log("כתובת ה-IP החיצונית:", ipText);

    //-----------------------NORMAL-----------------------
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('http://www.facebook.com/');

    // התחברות לחשבון 
    // await page.fill('input[name="email"]', 'sadnales@gmail.com');
    // await randomWait(page);
    // await page.fill('input[name="pass"]', 'shelli1998!');
    // await randomWait(page);
    // await page.click('button[name="login"]');

    // מעבר לקבוצת היעד
    // await page.goto(groupUrl);
    // await page.waitForLoadState('networkidle');

    // const acceptCookies = await page.$("div[role='button'][aria-label='לאפשר את כל קובצי ה-Cookie'] span");
    // if(acceptCookies){
    //     await acceptCookies.evaluate(el => el.click());
    // }

    await page.waitForSelector('div[role="article"]');

    let allPosts = [];

    // while (true) {
    for (let i = 0; i < 5; i++) {
        const posts = await page.$$('div[role=article]:not(:has([aria-label*="תגובה של"]))');
        // const posts = await page.$$('div[role=article]');

        if (!posts) {
            console.log("לא נמצא פוסט");
            continue;
        }

        const post = posts[i];

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
                // await firstImg.evaluate(node => node.scrollIntoView({ behavior: 'smooth', block: 'center' }));
                // await page.waitForTimeout(500);
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

                    currSrc = await page.$eval("div[role='dialog'] img", img => img.src);
                    if (galleryImages.has(currSrc)) break;
                    galleryImages.add(currSrc);
                }

                await page.keyboard.press("Escape");
                await page.waitForTimeout(500);
            } catch (e) {
                console.log("לא ניתן היה לפתוח את הגלריה או ללחוץ על תמונה");
            }
        }

        // איסוף כל התמונות הרגילות (גם אם אין גלריה) וסינון לפי גודל תמונה כדי לא לקחת אימוגי
        const inlineImages = await post.$$eval("img", imgs =>
            imgs
                .filter(img => img.naturalWidth > 40 && img.naturalHeight > 40)
                .map(img => img.src)
        );

        const allImages = [...new Set([...inlineImages, ...galleryImages])];

        // לחיצה על "ראה עוד" כדי להרחיב את הטקסט
        const seeMoreBtn = await post.$("div[role=button]:has-text('ראה עוד')");
        if (seeMoreBtn) {
            try {
                await randomWait(page);
                await seeMoreBtn.evaluate(el => el.click());
                await page.waitForTimeout(500);
            } catch (e) {
                console.log("לא הצליח ללחוץ על 'ראה עוד'");
            }
        }

        const text = await post.innerText();

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

        const a = 5;

        // גלילה לפוסט הבא
        if (i < 4) { // אם זה לא הפוסט האחרון
            console.log("גולל לפוסט הבא...");
            await page.evaluate(() => {
                window.scrollBy(0, 1000); // גלילה מטה
            });
            await page.waitForTimeout(2000); // המתנה לטעינת התוכן החדש
        }
    }

    fs.writeFileSync("posts.json", JSON.stringify(allPosts, null, 2), "utf-8");
    const a = 5;
    // await page.waitForTimeout(200000); // בין סבבים 
    // }

    // await browser.close();
})();

async function downloadImage(url, filename) {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const filePath = path.join(__dirname, filename);
    fs.writeFileSync(filePath, response.data);
    console.log(`נשמרה תמונה: ${filename}`);
}

async function randomWait(page) {
    const ms = Math.floor(Math.random() * 10000) + 1000;
    await page.waitForTimeout(ms);
}

const groupUrl = 'https://www.facebook.com/groups/287564448778602/?hoisted_section_header_type=recently_seen&multi_permalinks=1791932841675081';
