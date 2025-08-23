import express from "express";
import QRCode from "qrcode";
import { google } from "googleapis";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;

const app = express();
const port = process.env.PORT || 3000;

// ---- Config Google Sheets ----
const SHEET_ID = "1Wf8A8BkTPJGrQmJca35_Spsbj1HJxmZoLffkreqGkrM";
// Usa solo il nome foglio senza colonne
const SHEET_RANGE = "spese";

const credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);

const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

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

// EVENTO MESSAGE - LOG, VALIDAZIONE E REGISTRAZIONE
client.on("message", async (msg) => {
  console.log(`Messaggio ricevuto da ${msg.from}: "${msg.body}"`);
  if (!msg.body) {
    console.log("[WARN] Messaggio vuoto ricevuto.");
    await msg.reply("Formato non valido. Usa: Importo Categoria");
    return;
  }

  const parts = msg.body.trim().split(/\s+/);
  if (parts.length < 2) {
    console.log("[WARN] Formato non valido o campo mancante:", msg.body, parts);
    await msg.reply("Formato non valido. Usa: Importo Categoria");
    return;
  }

  const importoRaw = parts[0];
  const categoria = parts.slice(1).join(" ");

  const tipo = "Spesa";
  const data = new Date().toISOString().split("T");
  const importo = importoRaw.replace(",", ".").replace(/[^\d.]/g, "");

  console.log(`[DEBUG] Pronto per registrare su Sheets: ${[tipo, data, importo, categoria].join(", ")}`);

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: SHEET_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[tipo, data, importo, categoria]],
      },
    });
    console.log(`[OK] Riga registrata su Google Sheets: ${[tipo, data, importo, categoria].join(", ")}`);
    await msg.reply("✅ Registrato su Google Sheets!");
  } catch (err) {
    console.error("Errore Google Sheets:", err?.message || err);
    await msg.reply("❌ Errore nel salvataggio su Google Sheets.");
  }
});

// ---- Server Express (per healthcheck e QR) ----
app.get("/", (req, res) => res.send("Bot attivo 🚀"));

app.get("/qr", async (req, res) => {
  if (!qrCodeData) {
    return res.send("QR non ancora generato. Riavvia il servizio o attendi qualche secondo.");
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
