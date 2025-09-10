
import express from "express";
import cors from "cors";
import OpenAI from "openai";

// --------- Boot logs & guards ---------
console.log("[Boot] Node version:", process.version);
if (!process.env.OPENAI_API_KEY) {
  console.warn("[Boot] WARN: OPENAI_API_KEY não definido. /test-openai vai falhar até configurar.");
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: ["https://web.whatsapp.com"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const PROJECT = process.env.OPENAI_PROJECT_ID || undefined;

// OpenAI SDK v4 (Node 18+)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  project: PROJECT,
});

app.get("/", (_req, res) => {
  res.json({ ok: true, modelConfigured: MODEL, project: PROJECT || null });
});

app.get("/_health", (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

app.get("/_env", (_req, res) => {
  res.json({
    hasKey: !!process.env.OPENAI_API_KEY,
    hasProject: !!PROJECT,
    model: MODEL,
  });
});

app.get("/test-openai", async (_req, res) => {
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Di una frase corta en español LATAM." }],
      max_tokens: 30,
      temperature: 0.7,
    });
    res.json({ success: true, text: completion.choices?.[0]?.message?.content || "" });
  } catch (err) {
    console.error("[/test-openai] Error:", err);
    res.status(500).json({ error: "OpenAI error", details: String(err?.message || err) });
  }
});

app.post("/analyze", async (req, res) => {
  try {
    const { messages = [], chatTitle = "", contactName = "" } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "No messages in payload" });
    }

    const context = messages.slice(-14).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: `${m.sender || "Lead"}: ${m.text}`,
    }));

    const systemMsg = {
      role: "system",
      content:
        "Eres un asistente de ventas senior. Resume la conversación en 2 líneas y genera una respuesta ideal para avanzar a la acción (pago o llamada). Responde SIEMPRE en español LATAM.",
    };

    const chat = await openai.chat.completions.create({
      model: MODEL,
      messages: [systemMsg, ...context],
      temperature: 0.5,
      max_tokens: 380,
    });

    const content = chat.choices?.[0]?.message?.content?.trim() || "";
    let summary = "";
    let suggested_reply = "";

    // Split heurístico: si el modelo devuelve 2 párrafos, usamos 1º como resumen y 2º como reply
    const parts = content.split(/\n{2,}/);
    if (parts.length >= 2) {
      summary = parts[0].trim();
      suggested_reply = parts.slice(1).join("\n\n").trim();
    } else {
      // fallback: todo como reply y resumen curto
      suggested_reply = content;
      summary = "Interés confirmado. Pide paso siguiente (pago o llamada) con claridad.";
    }

    res.json({
      summary,
      suggested_reply,
      scores: { readiness: 6, urgency: 5, fit: 7 },
      raw: content,
    });
  } catch (err) {
    console.error("[/analyze] Error:", err);
    res.status(500).json({ error: "Analyze failed", details: String(err?.message || err) });
  }
});

// Global handlers para evitar crash silencioso
process.on("unhandledRejection", (r) => console.error("[unhandledRejection]", r));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("[Boot] Copilot backend listening on", PORT);
});
