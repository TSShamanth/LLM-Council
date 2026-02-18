# ⬡ Council of LLMs

> Multi-provider chatbot: your prompt goes to **OpenAI**, **Anthropic**, **Gemini**, and **Copilot** (Azure OpenAI). Outputs are anonymized, then a judge selects the best response with in-depth reasoning—why each alternative was rejected and why the winner was chosen.

## Architecture

```
council-of-llms/
├── src/
│   ├── api/
│   │   ├── providers/
│   │   │   ├── openai.js           # OpenAI GPT-4o
│   │   │   ├── anthropic.js        # Anthropic Claude
│   │   │   ├── gemini.js           # Google Gemini 1.5 Pro
│   │   │   └── azureOpenAI.js      # Azure OpenAI (Copilot)
│   │   ├── providerRouter.js       # Routes calls to enabled providers
│   │   └── sanitizer.js            # Injection prevention, identity redaction
│   ├── core/
│   │   ├── councilConfig.js        # Provider config, anonymous labels
│   │   ├── anonymizer.js           # Cryptographic shuffle, sealed reveal map
│   │   ├── judge.js                # Single-judge verdict with selection + rejection reasoning
│   └── components/
│       ├── App.jsx
│       ├── CouncilHeader.jsx
│       ├── ProviderStatus.jsx      # Live status per provider
│       ├── PromptInput.jsx
│       ├── OutputCard.jsx
│       ├── VerdictScreen.jsx       # Winner + selection reason + rejection reasons
│       └── ActivityLog.jsx
```

## Flow

```
User Prompt (independent input)
    ↓ sanitizePrompt()
    ↓ callProvider() × N   [OpenAI, Anthropic, Gemini, Copilot — all enabled]
    ↓ sanitizeOutput() × N
    ↓ anonymizeOutputs()   [crypto shuffle, revealMap sealed]
    ↓ runJudge()           [evaluates all, selects best]
    ↓ Verdict: winner + selectionReason + rejections (in-depth reasoning)
```

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and add at least one API key
npm run dev
```

Open http://localhost:5173

### API Keys

| Provider | Env Variable | Required |
|----------|--------------|----------|
| OpenAI | `VITE_OPENAI_API_KEY` | Optional |
| Anthropic | `VITE_ANTHROPIC_API_KEY` | Optional |
| Gemini | `VITE_GOOGLE_AI_API_KEY` | Optional |
| Copilot (Azure) | `VITE_AZURE_OPENAI_ENDPOINT`, `VITE_AZURE_OPENAI_API_KEY` | Optional |

At least one provider must be configured. The judge uses Anthropic (with OpenAI fallback).

> **Security note:** API keys are loaded client-side via Vite. For production, use a backend proxy to keep keys secret.

## License

MIT
