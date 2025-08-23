import express from "express";
import QRCode from "qrcode";
import { google } from "googleapis";

// Import corretto per CommonJS
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;

const app = express();
const port = process.env.PORT || 3000;

// ---- Config Google Sheets ----
const SHEET_ID = "1Wf8A8BkTPJGrQmJca35_Spsbj1HJxmZoLffkreqGkrM"; // tuo ID
const SHEET_RANGE = "spese!A1"; // correggiamo qui per append automatico

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
  qrCodeData = qr; // salva il QR per la pagina web
  console.log("QR generato, apri /qr nel browser per scansionarlo!");
});

client.on("ready", () => {
  console.log("🤖 Bot connesso e pronto!");
});

client.on("message", async (msg) => {
  console.log(`Messaggio da ${msg.from}: ${msg.body}`);

  const parts = msg.body.split(";");
  if (parts.length >= 3) {
    const tipo = parts[0].trim();
    const categoria = parts[1].trim();
    const importo = parts[2].trim();
    const data = new Date().toISOString().split("T")[0];

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: SHEET_RANGE,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[tipo, data, importo, categoria]],
        },
      });
      await msg.reply("✅ Registrato su Google Sheets!");
    } catch (err) {
      console.error("Errore Google Sheets:", err);
      await msg.reply("❌ Errore nel salvataggio su Google Sheets.");
    }
  } else {
    await msg.reply("Formato non valido. Usa: Tipo;Categoria;Importo");
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

// ---- Avvio Client ----
client.initialize();
