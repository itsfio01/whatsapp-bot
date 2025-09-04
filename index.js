import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys"
import qrcode from "qrcode-terminal"
import fs from "fs"

const GREETED_FILE = "./greeted.json"
let greeted = new Set()
if (fs.existsSync(GREETED_FILE)) {
  try {
    greeted = new Set(JSON.parse(fs.readFileSync(GREETED_FILE, "utf8")))
  } catch (e) {
    console.error("load greeted error", e)
  }
}
const saveGreeted = () =>
  fs.writeFileSync(GREETED_FILE, JSON.stringify([...greeted], null, 2))

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys")
  const sock = makeWASocket({ auth: state })

  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update
    if (qr) {
      console.log("📌 Scan this QR with WhatsApp → Linked Devices → Link a device")
      qrcode.generate(qr, { small: true })
    }
    if (connection === "open") {
      console.log("✅ Connected to WhatsApp")
    } else if (connection === "close") {
      console.log("⚠️ Connection closed", lastDisconnect?.error?.output?.statusCode)
      if (
        lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut
      ) {
        console.log("🔐 Logged out. Delete auth_info_baileys and re-scan.")
      } else {
        setTimeout(() => startBot(), 3000)
      }
    }
  })

  sock.ev.on("creds.update", saveCreds)

  // ✅ Handle messages
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const sender = msg.key.remoteJid
    if (sender.endsWith("@g.us")) return // ❌ ignore groups

    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text
    if (!text) return

    console.log(`💬 Message from ${sender}: ${text}`)

    // ✅ One-time greeting
    if (!greeted.has(sender)) {
      greeted.add(sender)
      saveGreeted()
      await sock.sendMessage(sender, { text: "hi 👋" })
      return
    }

    // ✅ Normal replies (for every new message after greeting)
    await sock.sendMessage(sender, { text: `You asked: ${text}` })
  })
}

startBot().catch((err) => console.error("startBot error", err))
