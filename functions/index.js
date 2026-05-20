/**
 * Paeonia — Cloud Function
 * Triggers on new Firestore message and sends FCM push to the partner.
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const sharp = require("sharp");
const crypto = require("crypto");

admin.initializeApp();

setGlobalOptions({ region: "europe-west1", maxInstances: 5 });

const STORAGE_BUCKET = "paeonia-garden.firebasestorage.app";
const ALLOWED_UIDS = [
  "WOOetHE8NbhBjoYKiW5VDW17Ufu1",
  "CgZyp1HrxQOKC2MqHTKxsI0wVN83",
];

const PREVIEWS = {
  text: (msg) => msg.content?.slice(0, 80) ?? "Yeni mesaj",
  drawing: () => "Sana bir çizim bıraktı 🌸",
  photo: () => "Bir an gönderdi…",
};

exports.onNewMessage = onDocumentCreated("messages/{messageId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const msg = snap.data();
  if (!msg?.senderId) return;

  const usersSnap = await admin.firestore().collection("users").get();
  if (usersSnap.empty) return;

  const recipients = usersSnap.docs
    .filter((d) => d.id !== msg.senderId && d.data().fcmToken)
    .map((d) => ({ uid: d.id, token: d.data().fcmToken, name: d.data().displayName }));

  if (recipients.length === 0) return;

  const senderDoc = await admin.firestore().collection("users").doc(msg.senderId).get();
  const senderName = senderDoc.data()?.displayName || "Sevgili";

  const body = (PREVIEWS[msg.type] || PREVIEWS.text)(msg);

  await Promise.all(
    recipients.map(async (r) => {
      try {
        await admin.messaging().send({
          token: r.token,
          notification: {
            title: senderName,
            body,
          },
          data: {
            type: msg.type || "text",
            senderId: msg.senderId,
            messageId: snap.id,
          },
          webpush: {
            fcmOptions: { link: "/chat" },
            notification: {
              icon: "/icons/icon-192.png",
              badge: "/icons/icon-192.png",
              tag: "paeonia-message",
            },
          },
        });
      } catch (err) {
        const code = err?.errorInfo?.code;
        // Token expired/invalid → clear it so user re-registers next session.
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          await admin.firestore().collection("users").doc(r.uid).update({ fcmToken: null });
        } else {
          console.error("FCM send failed:", err);
        }
      }
    }),
  );
});

/* ------------------------------------------------------------------ *
 * exportCollage — composites a memory's photos into one PNG.
 * ------------------------------------------------------------------ */

const CANVAS_W = 1080;
const CANVAS_H = 1350; // 4:5
const GAP = 14;
const PAD = 14;

function cellRect(cell, cols, rows) {
  const innerW = CANVAS_W - 2 * PAD;
  const innerH = CANVAS_H - 2 * PAD;
  const colW = (innerW - GAP * (cols - 1)) / cols;
  const rowH = (innerH - GAP * (rows - 1)) / rows;
  return {
    left: Math.round(PAD + (cell.col - 1) * (colW + GAP)),
    top: Math.round(PAD + (cell.row - 1) * (rowH + GAP)),
    width: Math.round(colW * cell.colSpan + GAP * (cell.colSpan - 1)),
    height: Math.round(rowH * cell.rowSpan + GAP * (cell.rowSpan - 1)),
  };
}

exports.exportCollage = onCall(
  { memory: "1GiB", timeoutSeconds: 120 },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid || !ALLOWED_UIDS.includes(uid)) {
      throw new HttpsError("permission-denied", "Bu bahçeye davetli değilsin.");
    }

    const memoryId = request.data && request.data.memoryId;
    if (!memoryId) {
      throw new HttpsError("invalid-argument", "memoryId gerekli.");
    }

    const snap = await admin.firestore().collection("memories").doc(memoryId).get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Anı bulunamadı.");
    }
    const memory = snap.data();
    const photos = Array.isArray(memory.photos) ? memory.photos : [];
    if (photos.length === 0) {
      throw new HttpsError("failed-precondition", "Bu anıda fotoğraf yok.");
    }

    let collage = memory.collage;
    if (!collage || !Array.isArray(collage.cells) || collage.cells.length !== photos.length) {
      // Fallback: simple uniform grid.
      const cols = Math.ceil(Math.sqrt(photos.length));
      const rows = Math.ceil(photos.length / cols);
      const cells = photos.map((_, i) => ({
        col: (i % cols) + 1,
        row: Math.floor(i / cols) + 1,
        colSpan: 1,
        rowSpan: 1,
      }));
      collage = { cols, rows, cells };
    }

    const bucket = admin.storage().bucket(STORAGE_BUCKET);

    const composites = [];
    for (let i = 0; i < photos.length; i++) {
      const cell = collage.cells[i];
      if (!cell) continue;
      const rect = cellRect(cell, collage.cols, collage.rows);
      const path = photos[i].path;
      if (!path) continue;
      const [buf] = await bucket.file(path).download();
      const tile = await sharp(buf)
        .rotate()
        .resize(rect.width, rect.height, { fit: "cover", position: "centre" })
        .toBuffer();
      composites.push({ input: tile, left: rect.left, top: rect.top });
    }

    if (composites.length === 0) {
      throw new HttpsError("failed-precondition", "Fotoğraflar okunamadı.");
    }

    const png = await sharp({
      create: {
        width: CANVAS_W,
        height: CANVAS_H,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite(composites)
      .png()
      .toBuffer();

    const token = crypto.randomUUID();
    const outPath = `memories/${memory.createdBy || uid}/collages/${memoryId}-${Date.now()}.png`;
    await bucket.file(outPath).save(png, {
      metadata: {
        contentType: "image/png",
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const url =
      `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/` +
      `${encodeURIComponent(outPath)}?alt=media&token=${token}`;

    return { url };
  },
);

/* ------------------------------------------------------------------ *
 * searchMusic — proxies the free iTunes Search API for song snippets.
 * ------------------------------------------------------------------ */

exports.searchMusic = onCall({ timeoutSeconds: 20 }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid || !ALLOWED_UIDS.includes(uid)) {
    throw new HttpsError("permission-denied", "Bu bahçeye davetli değilsin.");
  }

  const query = ((request.data && request.data.query) || "").trim();
  if (!query) return { results: [] };

  const url =
    "https://itunes.apple.com/search?media=music&entity=song&limit=24&term=" +
    encodeURIComponent(query);

  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("status " + res.status);
    data = await res.json();
  } catch (err) {
    console.error("searchMusic failed:", err);
    throw new HttpsError("unavailable", "Şarkı araması şu an yapılamıyor.");
  }

  const results = (data.results || [])
    .filter((r) => r.previewUrl)
    .map((r) => ({
      trackId: r.trackId,
      title: r.trackName || "",
      artist: r.artistName || "",
      artworkUrl: (r.artworkUrl100 || r.artworkUrl60 || "")
        .replace("100x100", "300x300")
        .replace("60x60", "300x300"),
      previewUrl: r.previewUrl,
    }));

  return { results };
});
