// server.js
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

// ===== Env =====
const API_KEY = process.env.OPENAI_API_KEY || "";
const PROJECT_ID = process.env.OPENAI_PROJECT_ID || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // troque para "gpt-4o" se tiver acesso

// Cliente OpenAI (SDK v4)
const client = new OpenAI({
  apiKey: API_KEY,
  // o SDK v4 aceita project assim; se preferir, pode usar header manual
  project: PROJECT_ID || undefined,
});

// ===== Endpoints de verificação =====
app.get("/", (_req, res) => {
  res
    .type("text/plain")
    .send("WA Copilot server ok. POST /analyze | GET /_health | GET /_env");
});

app.get("/_env", (_req, res) => {
  res.json({
    hasKey: !!API_KEY,
    hasProject: !!PROJECT_ID,
    model: MODEL,
    keyPrefix: API_KEY ? API_KEY.slice(0, 6) : null,
    projectPrefix: PROJECT_ID ? PROJECT_ID.slice(0, 6) : null,
  });
});

app.get("/_health", async (_req, res) => {
  try {
    // chamada barata para checar autenticação
    const models = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "OpenAI-Project": PROJECT_ID || "",
      },
    }).then(r => r.json());

    res.json({
      ok: true,
      hasKey: !!API_KEY,
      hasProject: !!PROJECT_ID,
      modelConfigured: MODEL,
      modelsSample: Array.isArray(models?.data)
        ? models.data.slice(0, 3).map(m => m.id)
        : models,
    });
  } catch (err) {
    res.status(200).json({
      ok: false,
      hasKey: !!API_KEY,
      hasProject: !!PROJECT_ID,
      modelConfigured: MODEL,
      error: toErr(err),
    });
  }
});

// ===== Endpoint principal =====
app.post("/analyze", async (req, res) => {
  const { history = [], draft = "" } = req.body || {};

  try {
    const messages = [
      {
        role: "system",
        content:
          "Eres un asistente de ventas por WhatsApp. Resume el chat, da una respuesta sugerida breve y clara, anota 2–3 puntos de atención, puntúa readiness/urgency/fit (1–10) y sugiere próximos pasos concretos.",
      },
      ...history.map(h => ({
        role: h.role === "agent" ? "assistant" : "user",
        content: h.text || "",
      })),
      draft ? { role: "assistant", content: draft } : null,
    ].filter(Boolean);

    // Chat Completions (model livre e barato por padrão)
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.3,
    });

    const text = completion.choices?.[0]?.message?.content || "";
    // Aqui você pode fazer parsing mais elaborado. Por enquanto devolvo o texto todo.
    return res.json({
      mode: "live",
      summary: "(generado por OpenAI)",
      suggested_reply: text,
      tips: [],
      scores: { readiness: 6, urgency: 5, fit: 7 },
      next_best_actions: [],
    });
  } catch (err) {
    // >>>> Diagnóstico explícito
    const info = toErr(err);
    console.error("[/analyze] OpenAI error:", info);

    return res.json({
      mode: "mock",
      summary: "Demo: sin conexión a OpenAI (usando mock).",
      suggested_reply:
        "Gracias por tu mensaje. ¿Qué objetivo quieres lograr en 30 días? La inversión es US$47 con garantía 7 días. Te dejo listo hoy o agendamos una llamada de 5 min.",
      tips: ["Confirmar objetivo y dolor", "Recordar garantía 7 días"],
      scores: { readiness: 6, urgency: 5, fit: 7 },
      next_best_actions: ["Enviar link de pago", "Proponer llamada 5 min"],
      error: info, // <<<<<< aqui você verá o motivo real
    });
  }
});

function toErr(e) {
  return {
    message: e?.message,
    status: e?.status || e?.response?.status,
    data: e?.response?.data || e?.data,
  };
}

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`WA Copilot server running on http://localhost:${PORT}`);
});

