
# WA Sales Copilot — Deploy na Render (passo a passo)

> Objetivo: colocar o **servidor** online para que a extensão do Chrome funcione mesmo se tua rede local bloquear `api.openai.com`.

## 1) Preparar os ficheiros
Use estes 2 ficheiros nesta pasta:
- `server.js` (este)
- `package.json` (este)

## 2) Criar um repositório (GitHub)
```bash
mkdir wa_copilot_server && cd wa_copilot_server
# Copie server.js e package.json para aqui (ou baixe o ZIP que enviei)
git init
git add .
git commit -m "init"
git branch -M main
gh repo create wa-copilot-server --public --source=. --remote=origin --push
# (se não usar GitHub CLI, crie manualmente um repo e faça:
# git remote add origin <url>
# git push -u origin main)
```

## 3) Deploy na Render
1. Acesse **https://render.com** (login)
2. **New +** → **Web Service** → **Connect a repository** → escolha `wa-copilot-server`
3. **Runtime**: Node  
   **Build Command**: `npm install`  
   **Start Command**: `node server.js`
4. **Environment** → **Add Environment Variable**:
   - `OPENAI_API_KEY` = sua chave secreta (não compartilhe)
   - (opcional, para chaves `sk-proj-…`): `OPENAI_PROJECT_ID` = seu project id
5. **Create Web Service** → aguarde o deploy → você terá uma URL HTTPS, ex.:  
   `https://wa-copilot.onrender.com`

> Saúde do serviço: abra a URL no navegador — deve mostrar `WA Copilot server ok. POST /analyze`

## 4) Apontar a extensão para a URL pública
- No Chrome → `chrome://extensions` → **WA Sales Copilot** → **Opções**
- Troque `http://localhost:8787` por sua URL Render, ex.:  
  `https://wa-copilot.onrender.com`
- No WhatsApp Web: abra um chat → clique **Copilot** → **Atualizar**

## 5) Teste manual (cURL)
```bash
curl -X POST https://SEU_SUBDOMINIO.onrender.com/analyze \
  -H "Content-Type: application/json" \
  -d '{"history":[{"role":"lead","text":"como funciona?"}],"draft":""}'
```

Se volta um JSON com `summary`/`suggested_reply`, deu certo. 🎉

---

### Dúvidas comuns
- **Timeout local** → usar o deploy na Render resolve, pois as chamadas para a OpenAI saem da nuvem.
- **Chave exposta** → revogue e gere outra. Nunca commit a chave no repo; use **Environment Variables**.
- **Modelos/versão** → altere em `server.js` (`gpt-4o-mini` por padrão).
- **Permissões CORS** → já habilitadas com `app.use(cors())`.
