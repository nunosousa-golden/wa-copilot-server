import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors({ origin: "https://web.whatsapp.com" }));
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  project: process.env.OPENAI_PROJECT_ID || undefined
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

app.get("/", (req, res) => {
  res.json({ ok: true, modelConfigured: MODEL });
});

app.get("/_health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.get("/test-openai", async (req, res) => {
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Hola, ¿puedes responderme en una línea?" }],
      max_tokens: 60,
      temperature: 0.7
    });
    res.json({ success: true, data: completion });
  } catch (err) {
    console.error("Erro ao testar OpenAI:", err);
    res.status(500).json({ error: "Falha na conexão com OpenAI", details: err.message });
  }
});

app.post("/analyze", async (req, res) => {
  try {
    const { messages = [], chatTitle = "", contactName = "" } = req.body || {};
    if (!messages.length) {
      return res.status(400).json({ error: "No messages found in request" });
    }

    const context = messages.slice(-12).map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: `${m.sender || "Lead"}: ${m.text}`
    }));

    const system = {
      role: "system",
      content: `Tu tarea es actuar como asistente comercial experto. Lee la conversación y responde con:
1. Un resumen del chat (máx 2 líneas)
2. Una sugerencia de respuesta ideal para enviar ahora al prospecto.
Responde siempre en español LATAM. Si no hay suficiente contexto, pede al usuario que reformule.`
    };

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [system, ...context],
      temperature: 0.6,
      max_tokens: 400
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const [summary = "", suggested_reply = ""] = raw.split(/(?:\n\n|
—
|
Sugerencia:)/).map(s => s.trim());

    return res.json({
      summary,
      suggested_reply,
      scores: { readiness: 6, urgency: 5, fit: 7 },
      raw
    });
  } catch (err) {
    console.error("Erro ao analisar conversa:", err);
    res.status(500).json({ error: "Erro ao gerar resposta", details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Copilot backend running on port", PORT);
});
