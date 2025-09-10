import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.OPENAI_API_KEY;
const PROJECT_ID = process.env.OPENAI_PROJECT_ID;

const client = new OpenAI({
  apiKey: API_KEY,
  defaultHeaders: {
    "OpenAI-Project": PROJECT_ID,
  },
});

app.get("/", (_, __res) => {
  __res.type("text/plain").send("WA Copilot server ok. POST /analyze");
});

app.post("/analyze", async (req, res) => {
  try {
    const { history = [], draft = "" } = req.body || {};

    const messages = [
      {
        role: "system",
        content:
          "Eres un asistente de ventas por WhatsApp. Resume el chat, da una respuesta sugerida breve y clara, anota 2–3 puntos importantes que el vendedor debe recordar, y calcula del 1 al 10: el nivel de urgencia, preparación y encaje del lead.",
      },
      ...history,
      {
        role: "user",
        content: `Hazlo en formato JSON como este: {
          "summary": "Resumen del chat...",
          "suggested_reply": "Respuesta corta...",
          "tips": ["...", "..."],
          "scores": {"readiness": 0-10, "urgency": 0-10, "fit": 0-10},
          "next_best_actions": ["...", "..."]
        }`,
      },
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content || "";
    const data = JSON.parse(raw);
    res.json(data);
  } catch (err) {
    console.error("❌ ERRO:", err);
    res.json({
      summary: "Demo: sin conexión a OpenAI (usando mock).",
      suggested_reply:
        "Gracias por tu mensaje. ¿Qué objetivo quieres lograr en 30 días? La inversión es US$47 con garantía 7 días. Te dejo listo hoy o agendamos una llamada de 5 min.",
      tips: [
        "Confirmar objetivo y dolor",
        "Recordar garantía 7 días",
        "CTA de pago o llamada",
      ],
      scores: { readiness: 6, urgency: 5, fit: 7 },
      next_best_actions: ["Enviar link de pago", "Proponer llamada 5 min"],
    });
  }
});

app.listen(3000, () => {
  console.log("Servidor escuchando en puerto 3000");
});
