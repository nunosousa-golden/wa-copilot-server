import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.OPENAI_API_KEY;
const PROJECT_ID = process.env.OPENAI_PROJECT_ID;

const client = new OpenAI({ apiKey: API_KEY });

app.get("/", (_req, res) => {
  res.type("text/plain").send("WA Copilot server ok. POST /analyze");
});

app.post("/analyze", async (req, res) => {
  try {
    const { history = [], draft = "" } = req.body || {};

    const messages = [
      {
        role: "system",
        content:
          "Eres un asistente de ventas por WhatsApp. Resume el chat, da una respuesta sugerida breve y clara, anota 2-3 puntos de atención y propone próximos pasos.",
      },
      {
        role: "user",
        content: JSON.stringify({ history, draft }),
      },
    ];

    // ⚠️ ESSENCIAL para chaves sk-proj-* :
    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      project: PROJECT_ID,
      temperature: 0.3,
    });

    const text = r.choices?.[0]?.message?.content?.trim() || "—";

    res.json({
      summary: "OK (IA real)",
      suggested_reply: text,
      tips: ["Confirmar objetivo y dolor", "Recordar garantía 7 días"],
      scores: { readiness: 6, urgency: 5, fit: 7 },
      next_best_actions: ["Enviar link de pago", "Proponer llamada 5 min"],
    });
  } catch (err) {
    console.error("OPENAI_ERROR:", err?.status, err?.message || err);
    // fallback para não quebrar o front se der erro
    res.json({
      summary: "Demo: sin conexión a OpenAI (usando mock).",
      suggested_reply:
        "Gracias por tu mensaje. ¿Qué objetivo quieres lograr en 30 días? La inversión es US$47 con garantía 7 días. Te dejo listo hoy o agendamos una llamada de 5 min.",
      tips: ["Confirmar objetivo y dolor", "Recordar garantía 7 días"],
      scores: { readiness: 6, urgency: 5, fit: 7 },
      next_best_actions: ["Enviar link de pago", "Proponer llamada 5 min"],
    });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () =>
  console.log(`WA Copilot server running on http://localhost:${PORT}`)
);
