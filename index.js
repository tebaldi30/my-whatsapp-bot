import express from "express";
import qrcode from "qrcode-terminal";
import { Client, LocalAuth } from "whatsapp-web.js";
import { google } from "googleapis";

const app = express();
const port = process.env.PORT || 3000;

// ---- Config Google Sheets ----
const SHEET_ID = "1Wf8A8BkTPJGrQmJca35_Spsbj1HJxmZoLffkreqGkrM"; // <-- tuo ID
const SHEET_RANGE = "spese!A:D"; // <-- nome foglio "spese"

const credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);

const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

// ---- WhatsApp Client ----
const client = new Client({
  authStrategy: new LocalAuth(), // tiene sessione locale (ma su Render si resetta se riavvii)
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  console.log("Scan questo QR per collegare il bot:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("🤖 Bot connesso e pronto!");
});

client.on("message", async (msg) => {
  console.log(`Messaggio da ${msg.from}: ${msg.body}`);

  // Esempio formato: "Spesa;Cibo;25.30"
  const parts = msg.body.split(";");
  if (parts.length >= 3) {
    const tipo = parts[0];
    const categoria = parts[1];
    const importo = parts[2];
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
      msg.reply("✅ Registrato su Google Sheets!");
    } catch (err) {
      console.error("Errore Google Sheets:", err);
      msg.reply("❌ Errore nel salvataggio su Google Sheets.");
    }
  } else {
    msg.reply("Formato non valido. Usa: Tipo;Categoria;Importo");
  }
});

// ---- Server Express (per Render healthcheck) ----
app.get("/", (req, res) => res.send("Bot attivo 🚀"));
app.listen(port, () => console.log(`Server in ascolto su ${port}`));

// ---- Avvio Client ----
client.initialize();