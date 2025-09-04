import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import fetch from "node-fetch";
import fs from "fs";

// === Load auth state ===
const { state, saveCreds } = await useMultiFileAuthState("auth_info");

// === Gemini AI function ===
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

// === Store greeted users (hi once per user) ===
const greetedFile = "greeted.json";
let greetedUsers = fs.existsSync(greetedFile)
  ? JSON.parse(fs.readFileSync(greetedFile))
  : {};

function saveGreeted() {
  fs.writeFileSync(greetedFile, JSON.stringify(greetedUsers, null, 2));
}

// === Main Bot ===
async function startBot() {
  const sock = makeWASocket({ auth: state });

  // Save credentials on update
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection } = update;
    if (connection === "open") console.log("✅ Connected to WhatsApp");
    else console.log("⚠️ Connection update:", connection);
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const sender = msg.key.remoteJid;

    // Ignore groups
    if (sender.endsWith("@g.us")) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      msg.message?.buttonsResponseMessage?.selectedDisplayText ||
      msg.message?.listResponseMessage?.singleSelectReply?.selectedDisplayText;

    if (!text) return;

    console.log("📩 New message from", sender, ":", text);

    // Reply hi only once per user
    if (text.toLowerCase() === "hi") {
      if (!greetedUsers[sender]) {
        greetedUsers[sender] = true;
        saveGreeted();
        await sock.sendMessage(sender, { text: "Hi 👋" });
      }
      return;
    }

    // Reply AI for questions
    if (
      text.endsWith("?") ||
      text.toLowerCase().startsWith("who") ||
      text.toLowerCase().startsWith("what") ||
      text.toLowerCase().startsWith("how") ||
      text.toLowerCase().startsWith("why")
    ) {
      const reply = await askGemini(text);
      await sock.sendMessage(sender, { text: reply });
    }
  });
}

startBot();
