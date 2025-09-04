import makeWASocket from "@whiskeysockets/baileys";
import { useMultiFileAuthState } from "@whiskeysockets/baileys";
import fetch from "node-fetch";
import fs from "fs";

// ✅ Load auth state
const { state, saveCreds } = await useMultiFileAuthState("auth_info");

// ✅ Gemini AI function
async function askGemini(question) {
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: question }],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "❌ No reply from AI."
    );
  } catch (err) {
    console.error("Gemini API Error:", err);
    return "⚠️ Error talking to AI.";
  }
}

// ✅ Store greeted users
const greetedFile = "greeted.json";
let greetedUsers = fs.existsSync(greetedFile)
  ? JSON.parse(fs.readFileSync(greetedFile))
  : {};

function saveGreeted() {
  fs.writeFileSync(greetedFile, JSON.stringify(greetedUsers, null, 2));
}

// ✅ Main bot
async function startBot() {
  const sock = makeWASocket({ auth: state });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection } = update;
    if (connection === "open") {
      console.log("✅ Connected to WhatsApp");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message?.conversation) return;

    const text = msg.message.conversation.trim();
    const sender = msg.key.remoteJid;

    // Reply "hi" only once per user
    if (text.toLowerCase() === "hi") {
      if (!greetedUsers[sender]) {
        greetedUsers[sender] = true;
        saveGreeted();
        await sock.sendMessage(sender, { text: "Hi 👋" });
      }
      return;
    }

    // AI replies only to questions
    if (
      text.endsWith("?") ||
      text.toLowerCase().startsWith("who") ||
      text.toLowerCase().startsWith("what")
    ) {
      const reply = await askGemini(text);
      await sock.sendMessage(sender, { text: reply });
    }
  });
}

startBot();
