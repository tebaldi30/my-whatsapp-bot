// index.js
import express from "express";
import QRCode from "qrcode";
import pkg from "whatsapp-web.js";
import pgPkg from "pg";

const { Client, LocalAuth } = pkg;
const { Pool } = pgPkg;

const app = express();
const port = process.env.PORT || 3000;

// ---- PostgreSQL (Render DB) ----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // necessario su Render
});

// Funzioni DB
async function getUserByPhone(telefono) {
  const result = await pool.query("SELECT * FROM users WHERE telefono = $1", [telefono]);
  return result.rows[0];
}

async function addMovimento(userId, tipo, data, importo, categoria) {
  const query = `
    INSERT INTO movimenti (user_id, tipo, data, importo, categoria)
    VALUES ($1, $2, $3, $4, $5)
  `;
  const values = [userId, tipo, data, importo, categoria];
  await pool.query(query, values);
}

// Normalizza numero (es: "39347xxxx@s.whatsapp.net" -> "39347xxxx")
function normalizePhone(raw) {
  return raw.split("@")[0];
}

// ---- WhatsApp Client ----
let qrCodeData = null;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  qrCodeData = qr;
  console.log("QR generato, apri /qr nel browser per scansionarlo!");
});

client.on("authenticated", () => {
  console.log("✅ Autenticazione avvenuta");
});

client.on("ready", async () => {
  console.log("🤖 Bot connesso e pronto!");
  try {
    const state = await client.getState();
    console.log("Stato Client:", state);
  } catch (e) {
    console.log("Impossibile ottenere lo stato client:", e);
  }
});

client.on("disconnected", (reason) => {
  console.log("❌ Disconnesso:", reason);
});

// ---- Evento messaggi ----
client.on("message", async (msg) => {
  const numero = normalizePhone(msg.from);
  console.log(`Messaggio ricevuto da ${numero}: "${msg.body}"`);

  // Cerca utente nel DB
  const user = await getUserByPhone(numero);
  if (!user) {
    await msg.reply("⚠️ Numero non collegato ad alcun account. Vai sull’app e registra il tuo numero.");
    return;
  }

  // Validazione messaggio
  if (!msg.body) {
    await msg.reply("Formato non valido. Usa: Importo Categoria");
    return;
  }

  const parts = msg.body.trim().split(/\s+/);
  if (parts.length < 2) {
    await msg.reply("Formato non valido. Usa: Importo Categoria");
    return;
  }

  const importoRaw = parts[0];
  const categoria = parts.slice(1).join(" ");
  const tipo = "Spesa";
  const data = new Date().toISOString().split("T")[0];
  const importo = parseFloat(importoRaw.replace(",", ".").replace(/[^\d.]/g, ""));

  if (isNaN(importo)) {
    await msg.reply("❌ Importo non valido. Usa un numero, es: 15.50 Spesa");
    return;
  }

  try {
    await addMovimento(user.id, tipo, data, importo, categoria);
    console.log(`[OK] Movimento salvato per utente ${user.email}`);
    await msg.reply("✅ Spesa registrata sul tuo account!");
  } catch (err) {
    console.error("Errore DB:", err);
    await msg.reply("❌ Errore nel salvataggio sul database.");
  }
});

// ---- Server Express (per healthcheck e QR) ----
app.get("/", (req, res) => res.send("Bot attivo 🚀"));

app.get("/qr", async (req, res) => {
  if (!qrCodeData) {
    return res.send("QR non ancora generato. Attendi qualche secondo...");
  }
  try {
    const dataUrl = await QRCode.toDataURL(qrCodeData);
    res.send(`
      <html>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;">
          <h2>📱 Scansiona il QR con WhatsApp del bot</h2>
          <img src="${dataUrl}" />
          <p>Il QR scompare quando il bot è autenticato.</p>
        </body>
      </html>
    `);
  } catch (err) {
    res.send("Errore nella generazione del QR");
  }
});

app.listen(port, () => console.log(`Server in ascolto su ${port}`));

client.initialize();
