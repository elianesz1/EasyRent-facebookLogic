const { format } = require("date-fns");
const fs = require("fs");
const axios = require("axios");
const path = require("path");
const { db, bucket, uuidv4 } = require("./firebase");

function loadPostIdInfo() {
    const filePath = "last_id.json";
    const todayStr = format(new Date(), "ddMMyyyy");

    if (!fs.existsSync(filePath)) {
        return { date: todayStr, counter: 1 };
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

    if (data.date === todayStr) {
        return { date: todayStr, counter: data.counter + 1 };
    } else {
        return { date: todayStr, counter: 1 };
    }
}

function savePostIdInfo(dateStr, counter) {
    const filePath = "last_id.json";
    const data = {
        date: dateStr,
        counter: counter
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function processPost(text, allImages) {
    const { date, counter } = loadPostIdInfo();
    const postId = `${date}_${String(counter).padStart(4, "0")}`;
    const imageUrls = [];

    for (let j = 0; j < allImages.length; j++) {
        const imageId = `${postId}_${String(j + 1).padStart(3, "0")}`;
        try {
            const uploadedUrl = await uploadImageToFirebase(allImages[j], imageId);
            imageUrls.push(uploadedUrl);
        } catch (err) {
            console.log(`שגיאה בהעלאת תמונה ${j + 1}:`, err.message);
        }
    }

    await db.collection("posts").doc(postId).set({
        id: postId,
        text,
        images: imageUrls,
        created_at: new Date().toISOString(),
        status: "new"
    });

    console.log(`פוסט נשמר עם מזהה: ${postId}`);

    savePostIdInfo(date, counter); // save the last ID in file
}

async function uploadImageToFirebase(imageUrl, imageId) {
    const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
    const buffer = response.data;

    const filePath = `posts/${imageId}.jpg`;
    console.log("Using bucket:", bucket.name);
    const file = bucket.file(filePath);

    await file.save(buffer, {
        metadata: {
            contentType: "image/jpeg",
            metadata: {
                firebaseStorageDownloadTokens: uuidv4(), // מאפשר קישור ציבורי לתמונה
            },
        },
    });

    // בונים קישור ציבורי לתמונה
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;

    console.log(`תמונה הועלתה: ${publicUrl}`);
    return publicUrl;
}

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

async function cleanPostHandle(post) {
    // דילוג על פוסטים שהם תגובות
    const isComment = await post.$('[aria-label*="תגובה של"]');
    if (isComment) {
        return null;
    }

    // ניקוי רכיבים לא רלוונטיים מתוך ה-DOM
    await post.evaluate(el => {
        el.querySelectorAll('[role="button"]').forEach(btn => btn.remove());
        el.querySelectorAll('[role="textbox"]').forEach(box => box.remove());
        el.querySelectorAll('[role="link"]').forEach(link => link.remove());
    });

    // שליפה מחדש של הטקסט אחרי הניקוי
    const cleanText = await post.innerText();
    return cleanText;
}

const groupUrl = 'https://www.facebook.com/groups/287564448778602/?hoisted_section_header_type=recently_seen&multi_permalinks=1819414165593615&locale=he_IL';

module.exports = {
    downloadImage,
    randomWait,
    uploadImageToFirebase,
    processPost,
    loadPostIdInfo,
    savePostIdInfo,
    cleanPostHandle,
    groupUrl
}