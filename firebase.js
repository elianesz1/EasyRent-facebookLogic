const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "easyrent-1325a.firebasestorage.app",
});

const bucket = admin.storage().bucket();
const db = admin.firestore();

module.exports = { admin, bucket, db, uuidv4 };
