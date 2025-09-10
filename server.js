// server.js
// Backend mínimo para WA Sales Copilot — Render/Node.js/Express + OpenAI
// Responde: summary, suggested_reply, justification, alternatives, scores, tag, etc.

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(bodyParser.json({ limit: "1mb" }));
app.use(
  cors({
    origin: [
      "https://web.whatsapp.com",
      "https://*.whatsapp.com",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:8080",
    ],
  })
);

// ---------- OpenAI ----------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Util para evitar crash se o modelo mandar texto + JSON
function safeJsonParse(maybeJson) {
  if (!maybeJson || typeof maybeJson !== "string") return null;
  // tenta extrair o primeiro bloco {...}
  const match = maybeJson.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(match ? match[0] : maybeJson);
  } catch {
    return null;
  }
}

// Concatena chat em formato legível pelo modelo
function formatTranscript(messages = []) {
  // messages: [{role:'agent'|'user', text, timestamp}]
  return messages
    .filter((m) => m?.text)
    .map((m) => {
      const who = m.role === "agent" ? "Vendedor" : "Lead";
      const ts = m.timestamp ? ` [${m.timestamp}]` : "";
      return `${who}${ts}: ${m.text}`;
    })
    .join("\n");
}

// Prompt Profissional resumido + regras (ES)
const SYSTEM_PROMPT = `
Eres un **Agente de IA de soporte a vendedores humanos** para la Golden Life Academy (GLA).
Tu misión es **aumentar la conversión** sugiriendo la **próxima mejor respuesta** en WhatsApp.

Contexto del producto/ICP:
- GLA es una membresía online para mujeres hispanas (23–45) que quieren ganar dinero online desde cero, con soporte humano.
- Precio: 97 USD/mes, sin fidelidad, renovación automática.
- Beneficios: garantía 30 días, lives semanales, bonos, grabaciones.
- Leads generalmente tibios/calientes: ya vieron audios/video/bonos.

Proceso lógico:
1) Lee el extracto de la conversación (Lead vs. Vendedor).
2) Identifica la etapa actual: "duda", "hesitación", "objección", "intención", "follow-up", "cierre".
3) Aplica técnicas de ventas: AIDA, SPIN, rapport, neuromarketing, con **empatía** y **claridad**.
4) Usa **gatillos** con sutileza (pertenencia, seguridad, urgencia real, prueba social).
5) Entrega una **respuesta lista para enviar** (concisa, humana, directa, sin emojis a menos que la lead los use).
6) Avanza un paso el funil (cita, link de pago, script de cierre, contorno de objeción, etc.).

Restricciones:
- No seas genérico ni “robotizado”.
- No uses jerga de marketing vacía ni presiones.
- No pidas “buenos días” sin propósito.
- Mantén el tono profesional, empático y directo.
- Responde **siempre en español**.

Salida: Debes devolver **JSON estrictamente válido** con esta forma:
{
  "summary": "resumen de la situación en 1-2 frases",
  "suggested_reply": "mensaje listo para copiar y pegar",
  "justification": "por qué esta respuesta es óptima",
  "alternatives": ["variante 1 (opcional)", "variante 2 (opcional)"],
  "scores": { "readiness": 1-10, "urgency": 1-10, "fit": 1-10 },
  "tag": "duda|hesitación|objección|intención|follow-up|cierre",
  "objections_detected": ["lista de objeciones detectadas…"],
  "next_best_action": "acción concreta siguiente (ej: enviar link, agendar llamada, reforzar garantía)",
  "lead_status": "fría|tibia|caliente"
}
Si tienes poca certeza, solicita el contexto mínimo en "suggested_reply" de forma estratégica (no genérica).
`;

// Utilidad para pedir al modelo y obtener JSON
async function runLLM(transcript, extras = {}) {
  const userPrompt = `
Transcripción (Lead/Vendedor):
------------------------------
${transcript}

Metadatos/Contexto adicional:
- chat_key: ${extras?.chat_key || "-"}
- idioma deseado: Español
- Si ves “no tengo dinero/tarjeta/sueldo”, aplica contorno empático + siguiente paso claro.
- Si hay interés pero baja urgencia: crea urgencia honesta (bonos, garantía, cupos).
- Si el encaje es bajo: sé honesta, re-encamina o descarta con cuidado.
`;

  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    // max_tokens opcional
  });

  const content = resp.choices?.[0]?.message?.content || "";
  const json = safeJsonParse(content);

  if (!json) {
    // Fallback mínimo si el modelo no devolvió JSON válido
    return {
      summary: "No se pudo analizar correctamente.",
      suggested_reply:
        "¿Podrías confirmarme si ya viste el video y si tienes alguna duda específica? Así te ayudo de forma directa.",
      justification:
        "Faltó información estructurada del modelo. Se solicita el mínimo contexto para avanzar.",
      alternatives: [],
      scores: { readiness: 5, urgency: 5, fit: 5 },
      tag: "duda",
      objections_detected: [],
      next_best_action: "Pedir contexto y avanzar a siguiente paso según respuesta.",
      lead_status: "tibia",
    };
  }

  // Sanitiza mínimos
  json.scores = json.scores || {};
  json.scores.readiness ??= 5;
  json.scores.urgency ??= 5;
  json.scores.fit ??= 5;

  json.alternatives = json.alternatives || [];

  return json;
}

// --------- RUTAS ----------
app.get("/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, time: new Date().toISOString() });
});

app.post("/analyze", async (req, res) => {
  try {
    const { messages = [], meta = {} } = req.body || {};
    const transcript = formatTranscript(messages);

    const result = await runLLM(transcript, { chat_key: meta?.chat_key });

    // Respuesta final para la extensión
    res.json({
      summary: result.summary || "",
      suggested_reply: result.suggested_reply || "",
      justification: result.justification || "",
      alternatives: result.alternatives || [],
      scores: result.scores || { readiness: 5, urgency: 5, fit: 5 },
      tag: result.tag || "duda",
      objections_detected: result.objections_detected || [],
      next_best_action: result.next_best_action || "",
      lead_status: result.lead_status || "tibia",
    });
  } catch (e) {
    console.error("Analyze error:", e);
    res.status(500).json({
      error: "analyze_failed",
      message: e?.message || String(e),
    });
  }
});

// Render mantiene el puerto via env
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WA Copilot server running on :${PORT}`);
});
