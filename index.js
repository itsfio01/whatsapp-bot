// index.js - WhatsApp bot with Gemini AI

import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import fetch from "node-fetch";
import fs from "fs";

// ======== Load auth ========
// Corrected to use auth_info_baileys
const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

// ======== Gemini AI function ========
async function askGemini(question) {
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: question }] }],
        }),
      }
    );

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "❌ No reply from AI.";
  } catch (err) {
    console.error("Gemini API Error:", err.message || err);
    return "⚠️ Error talking to AI.";
  }
}

// ======== Store greeted users ========
const greetedFile = "greeted.json";
let greetedUsers = fs.existsSync(greetedFile)
  ? JSON.parse(fs.readFileSync(greetedFile))
  : {};

function saveGreeted() {
  fs.writeFileSync(greetedFile, JSON.stringify(greetedUsers, null, 2));
}

// ======== Main bot ========
async function startBot() {
  const sock = makeWASocket({ auth: state });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      console.log("✅ Connected to WhatsApp");
    } else if (connection === "close") {
      console.error("❌ Connection closed:", lastDisconnect?.error || "Unknown");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg.message) return;

      const sender = msg.key.remoteJid;
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        msg.message?.buttonsResponseMessage?.selectedDisplayText ||
        msg.message?.listResponseMessage?.singleSelectReply?.selectedDisplayText ||
        "";

      if (!text.trim()) return;

      console.log("📩 New message from", sender, ":", text);

      // ====== Reply "hi" only once per user ======
      if (text.toLowerCase() === "hi") {
        if (!greetedUsers[sender]) {
          greetedUsers[sender] = true;
          saveGreeted();
          await sock.sendMessage(sender, { text: "Hi 👋" });
        }
        return;
      }

      // ====== AI reply for questions ======
      if (
        text.endsWith("?") ||
        text.toLowerCase().startsWith("who") ||
        text.toLowerCase().startsWith("what") ||
        text.toLowerCase().startsWith("how") ||
        text.toLowerCase().startsWith("when") ||
        text.toLowerCase().startsWith("where")
      ) {
        const reply = await askGemini(text);
        await sock.sendMessage(sender, { text: reply });
      }
    } catch (err) {
      console.error("⚠️ Message handler error:", err.message || err);
    }
  });
}

// ======== Start bot ========
startBot().catch((err) => console.error("Bot crashed:", err.message || err));
