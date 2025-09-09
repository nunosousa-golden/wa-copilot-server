
/**
 * WA Sales Copilot - Golden Life (Deploy-ready, OpenAI SDK)
 * Start locally:
 *   export OPENAI_API_KEY=sk_...
 *   node server.js
 *
 * ENV (Render/Railway):
 *   - OPENAI_API_KEY (required)
 *   - OPENAI_PROJECT_ID (optional, only if your key is sk-proj-* and your project requires it)
 *   - PORT (provided by the platform; default 8787)
 */
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai').default;
const { z } = require('zod');

const PORT = process.env.PORT || 8787;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const app = express();
app.use(cors()); // CORS aberto para simplificar o deploy
app.use(express.json({ limit: '1.5mb' }));

// Healthcheck
app.get('/', (_req, res) => res.send('WA Copilot server ok. POST /analyze'));

// Payload que a extensão envia
const ChatSchema = z.object({
  history: z.array(z.object({ role: z.string(), text: z.string() })).default([]),
  draft: z.string().default("")
});

// Prompts
function buildSystemPrompt() {
  return `
Eres el asistente de ventas de Golden Life para WhatsApp (español LATAM).
Oferta: US$47 con garantía de 7 días.
Tono: líder, directo, humano, sin humo, claro y breve.
Reglas:
- No inventes beneficios ni precios: si los mencionas, son US$47 + garantía 7 días.
- Si falta información, pide solo 1 pregunta clave.
- Devuelve SOLO JSON con: summary, suggested_reply, tips[], scores{readiness,urgency,fit}, next_best_actions[].
- Objecciones típicas: "no tengo tiempo" / "luego lo veo" / "quiero pensarlo".
`.trim();
}

function buildUserPrompt(history, draft) {
  const ctx = history.map(m => `${m.role === 'agent' ? 'AGENTE' : 'LEAD'}: ${m.text}`).join('\n');
  return `
CONVERSACIÓN (últimos mensajes):
${ctx || '(vacío)'}

BORRADOR DEL AGENTE:
${draft || '(vacío)'}

TAREA:
1) Resume estado (interés, objeciones, plazo) en 2-3 líneas.
2) Sugiere UNA respuesta completa: reconocer + beneficio tangible + (si natural) US$47 y garantía 7 días + CTA claro (pago ahora o llamada 5 min).
3) Lista 3-6 puntos de atención.
4) Puntúa 1..10: readiness, urgency, fit.
5) Propón 2-4 próximos pasos.

DEVUELVE SOLO JSON:
{
  "summary": "...",
  "suggested_reply": "...",
  "tips": ["...", "..."],
  "scores": {"readiness": 0, "urgency": 0, "fit": 0},
  "next_best_actions": ["...", "..."]
}
`.trim();
}

// Helpers
function safeParseJson(text) {
  try {
    const fence = text.match(/```json([\s\S]*?)```/i);
    if (fence) return JSON.parse(fence[1]);
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s !== -1 && e !== -1 && e > s) return JSON.parse(text.slice(s, e + 1));
  } catch {}
  return null;
}
function postProcess(obj) {
  const toInt = v => Math.max(1, Math.min(10, Math.round(Number(v) || 0)));
  const scores = {
    readiness: toInt(obj?.scores?.readiness),
    urgency:   toInt(obj?.scores?.urgency),
    fit:       toInt(obj?.scores?.fit)
  };
  const avg = Math.round((scores.readiness + scores.urgency + scores.fit) / 3);
  const tag = avg >= 8 ? 'Caliente' : avg >= 5 ? 'Morno' : 'Frío';
  return {
    summary: obj.summary || "",
    suggested_reply: obj.suggested_reply || "",
    tips: Array.isArray(obj.tips) ? obj.tips.slice(0, 6) : [],
    scores, next_best_actions: Array.isArray(obj.next_best_actions) ? obj.next_best_actions.slice(0, 4) : [],
    lead_bucket: tag
  };
}
function mockResponse(payload) {
  return {
    summary: "Demo: sin conexión a OpenAI (usando mock).",
    suggested_reply: "Gracias por tu mensaje. ¿Qué objetivo quieres lograr en 30 días? La inversión es US$47 con garantía 7 días. Te dejo listo hoy o agendamos una llamada de 5 min.",
    tips: ["Confirmar objetivo y dolor", "Recordar garantía 7 días", "CTA de pago o llamada"],
    scores: { readiness: 6, urgency: 5, fit: 7 },
    next_best_actions: ["Enviar link de pago", "Proponer llamada 5 min"]
  };
}

// Endpoint principal
app.post('/analyze', async (req, res) => {
  let parsed;
  try {
    const payload = ChatSchema.parse(req.body);
    const system = buildSystemPrompt();
    const user = buildUserPrompt(payload.history, payload.draft);

    if (!OPENAI_API_KEY) {
      return res.json(mockResponse(payload));
    }

    const client = new OpenAI({
      apiKey: OPENAI_API_KEY,
      project: process.env.OPENAI_PROJECT_ID || undefined,
      timeout: 30000
    });

    let data;
    try {
      const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      });
      data = { choices: [{ message: { content: resp.choices?.[0]?.message?.content || "" } }] };
    } catch (e) {
      console.error("openai error:", e?.message || e);
      return res.json(mockResponse(payload));
    }

    const raw = data?.choices?.[0]?.message?.content || "";
    parsed = safeParseJson(raw) || mockResponse(payload);
    return res.json(postProcess(parsed));
  } catch (e) {
    console.error('analyze error:', e);
    return res.status(400).json({ error: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`WA Copilot server running on http://localhost:${PORT}`);
});
