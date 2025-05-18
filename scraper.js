// אימפורט של הספריות הנדרשות
const { chromium } = require('playwright');
const fs = require('fs');

// פונקציה ראשית להוצאת פוסטים גולמיים מקבוצת פייסבוק
async function scrapeRawFacebookPosts(groupUrl, postsLimit = 50) {
  // יצירת דפדפן חדש
  const browser = await chromium.launch({ 
    headless: false, // הגדר ל-true עבור הרצה ללא ממשק משתמש גרפי
    slowMo: 100 // האטה מסוימת לתהליך בעת פיתוח
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // כניסה לפייסבוק
    console.log('מתחבר לפייסבוק...');
    await page.goto('https://www.facebook.com/');
    
    // התחברות לחשבון (יש להזין פרטי התחברות)
    await page.fill('input[name="email"]', 'sadnales@gmail.com');
    await page.fill('input[name="pass"]', 'shelli1998!');
    await page.click('button[name="login"]');
    
    // המתנה להתחברות מוצלחת
    await page.waitForNavigation();
    console.log('התחברות הושלמה בהצלחה');
    
    // מעבר לקבוצת היעד
    console.log(`עובר לקבוצה: ${groupUrl}`);
    await page.goto(groupUrl);
    await page.waitForLoadState('networkidle');
    
    // המתנה שהפוסטים ייטענו
    await page.waitForSelector('div[role="article"]');
    
    // איסוף הפוסטים
    console.log('אוסף פוסטים...');
    const posts = [];
    let loadedPosts = 0;
    
    while (loadedPosts < postsLimit) {
      // חיפוש כל הפוסטים בדף
      const postElements = await page.$$('div[role="article"]');
      
      // עיבוד הפוסטים החדשים
      for (let i = loadedPosts; i < postElements.length && i < postsLimit; i++) {
        const post = postElements[i];
        
        try {
          // חילוץ מידע בסיסי מהפוסט
          const postId = await post.evaluate(el => {
            // ניסיון למצוא מזהה הפוסט מתוך התוכן או המאפיינים
            const idFromAttribute = el.getAttribute('id') || '';
            const dataFtAttr = el.getAttribute('data-ft');
            let dataFtId = '';
            
            if (dataFtAttr) {
              try {
                const dataFt = JSON.parse(dataFtAttr);
                dataFtId = dataFt.top_level_post_id || dataFt.content_owner_id_new || '';
              } catch (e) {
                // התעלם משגיאות פענוח JSON
              }
            }
            
            return idFromAttribute || dataFtId || `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          });
          
          // חילוץ פרטי המפרסם
          const authorElement = await post.$('h3 span a, h4 span a');
          const author = authorElement ? await authorElement.textContent() : 'לא ידוע';
          const authorUrl = authorElement ? await authorElement.getAttribute('href') : '';
          
          // חילוץ זמן הפרסום
          const timeElement = await post.$('a[href*="/groups/"][role="link"] > span');
          const timeText = timeElement ? await timeElement.textContent() : '';
          const timeUrl = timeElement ? await post.$eval('a[href*="/groups/"][role="link"]', a => a.href) : '';
          
          // חילוץ תוכן הפוסט המלא
          const contentElement = await post.$('div[data-ad-comet-preview="message"]');
          const content = contentElement ? await contentElement.textContent() : '';
          
          // חילוץ כל התמונות בפוסט
          const imageUrls = [];
          const imageElements = await post.$$('img[src^="https://"]');
          for (const img of imageElements) {
            const src = await img.getAttribute('src');
            const alt = await img.getAttribute('alt') || '';
            // מסנן תמונות פרופיל ואייקונים קטנים
            if (src && 
                src.includes('scontent') && 
                !src.includes('emoji') && 
                !imageUrls.includes(src)) {
              imageUrls.push({
                url: src,
                alt: alt
              });
            }
          }
          
          // חילוץ קישורים שמופיעים בפוסט
          const links = [];
          const linkElements = await post.$$('a[href^="https://"]');
          for (const link of linkElements) {
            const href = await link.getAttribute('href');
            const text = await link.textContent();
            if (href && 
                !href.includes('facebook.com/groups') && 
                !href.includes('facebook.com/profile') &&
                !links.some(l => l.url === href)) {
              links.push({
                url: href,
                text: text
              });
            }
          }
          
          // חילוץ כמות לייקים ותגובות אם אפשרי
          let reactions = null;
          const reactionsElement = await post.$('span[aria-label*="תגובות"], span[aria-label*="לייקים"]');
          if (reactionsElement) {
            reactions = await reactionsElement.textContent();
          }
          
          // ייצוג הפוסט כאובייקט JSON
          const postData = {
            id: postId,
            author: {
              name: author,
              profileUrl: authorUrl
            },
            time: {
              text: timeText,
              postUrl: timeUrl
            },
            content: content,
            images: imageUrls,
            links: links,
            reactions: reactions,
            rawHtml: await post.evaluate(el => el.outerHTML), // חילוץ HTML המלא לשימוש עתידי
            scrapedAt: new Date().toISOString()
          };
          
          posts.push(postData);
          console.log(`נאסף פוסט מספר ${posts.length} מאת ${author}`);
        } catch (error) {
          console.error(`שגיאה בעיבוד פוסט: ${error.message}`);
        }
      }
      
      loadedPosts = postElements.length;
      
      if (loadedPosts >= postsLimit) {
        break;
      }
      
      // גלילה למטה לטעינת פוסטים נוספים
      console.log('גולל למטה לטעינת פוסטים נוספים...');
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(2500); // המתנה לטעינת פוסטים חדשים
      
      // בדיקה האם נטענו פוסטים חדשים
      const newPostElements = await page.$$('div[role="article"]');
      if (newPostElements.length === loadedPosts) {
        console.log('לא נטענו פוסטים חדשים, מנסה שוב...');
        
        // ניסיון נוסף לגלילה (לפעמים פייסבוק מאט את הטעינה)
        await page.evaluate(() => window.scrollBy(0, 2000));
        await page.waitForTimeout(3000);
        
        const finalCheck = await page.$$('div[role="article"]');
        if (finalCheck.length === loadedPosts) {
          console.log('לא נטענו פוסטים נוספים, מסיים את הסריקה...');
          break;
        }
      }
    }
    
    // שמירת התוצאות לקובץ JSON
    const outputPath = 'facebook_raw_posts.json';
    fs.writeFileSync(outputPath, JSON.stringify(posts, null, 2), 'utf8');
    console.log(`נשמרו ${posts.length} פוסטים גולמיים לקובץ ${outputPath}`);
    
    return posts;
  } catch (error) {
    console.error(`שגיאה בתהליך הסריקה: ${error.message}`);
    throw error;
  } finally {
    // סגירת הדפדפן
    await browser.close();
  }
}

// הפעלת הסקריפט - יש להחליף את הURL לקבוצה הרצויה
(async () => {
  try {
    // דוגמה לקבוצת חיפוש דירות (יש להחליף ל-URL של הקבוצה הרצויה)
    const groupUrl = 'https://www.facebook.com/groups/287564448778602?hoisted_section_header_type=recently_seen&multi_permalinks=17685483673468625';
    const posts = await scrapeRawFacebookPosts(groupUrl, 50); // מגביל ל-50 פוסטים
    console.log(`הסריקה הסתיימה בהצלחה. נאספו ${posts.length} פוסטים.`);
  } catch (error) {
    console.error('שגיאה:', error);
  }
})();