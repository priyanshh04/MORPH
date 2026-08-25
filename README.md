# TransformAI

**SIH26154 - GenAI Platform for Automated Content Transformation**

TransformAI is a government/enterprise-grade AI content transformation platform for converting one trusted source into many audience-specific, language-specific, and channel-specific communication artifacts while preserving context, facts, and citations.

Tagline: **One Source. Every Audience. Every Format.**

## Features

- Landing page and protected dashboard
- Login, register, logout, role-ready user model
- Demo mode that works without external API keys
- PDF/DOCX/TXT/Markdown/pasted-text ingestion interface
- Document preview and source intelligence
- Claim, entity, date, number, topic, and risk extraction
- Modular AI provider abstraction with deterministic demo provider
- Multi-output generation from one source
- Citizen, officer, FAQ, WhatsApp, social, presentation, voice, press, SMS, infographic, report, facts, and checklist modes
- Citation map and source evidence explanations
- Factuality verification with supported, partial, and unsupported claim counts
- Chat with document using retrieved source chunks
- Multi-document transformation support through API
- Document comparison for added/removed clauses and changed dates/numbers
- Version history for edited outputs
- Markdown and JSON export
- Analytics dashboard with usage, departments, languages, factuality, and citation coverage
- Security basics: password hashing, signed tokens, protected APIs, rate limiting, upload size limits, audit logs, no frontend API keys

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript SPA
- Backend: Node.js HTTP server
- AI: provider abstraction in `packages/ai`
- Database: local JSON store using PostgreSQL-style table names for prototype portability
- Auth: hashed passwords and signed bearer tokens
- Tests: Node built-in `assert`

This implementation avoids external dependencies so it runs reliably in restricted hackathon/demo environments. The structure is intentionally compatible with a later React/FastAPI/PostgreSQL migration.

## Project Structure

```text
apps/
  api/        HTTP API, auth, seed data
  web/        Landing page and dashboard SPA
packages/
  ai/         Document intelligence, provider abstraction, verification
  database/   Persistent JSON store
  shared/     Config and shared constants
docs/         Architecture and API notes
tests/        Unit/API pipeline tests
data/         Local database generated on first launch
exports/      Generated export files
```

## Setup

```bash
cd transformai
node apps/api/server.js
```

Open:

```text
http://localhost:4321
```

Run tests:

```bash
node tests/run-tests.js
```

## Demo Credentials

- Officer: `officer@transformai.gov` / `Officer@123`
- Admin: `admin@transformai.gov` / `Admin@123`

The **Explore Demo** button logs in using the officer account and loads realistic sample documents:

1. Government welfare scheme notification
2. District disaster/weather alert
3. Education policy document

## Environment Variables

Copy `.env.example` and configure as needed:

```text
PORT=4321
DATABASE_URL=postgresql://transformai:transformai@localhost:5432/transformai
OPENAI_API_KEY=
LLM_PROVIDER=demo
MODEL_NAME=gpt-4.1-mini
EMBEDDING_MODEL=text-embedding-3-small
VECTOR_DB_URL=local-json
JWT_SECRET=change-this-in-production
STORAGE_PROVIDER=local
MAX_UPLOAD_MB=12
```

## AI Provider Modes

### Demo Mode

The default provider is deterministic and source-grounded. It demonstrates ingestion, intelligence extraction, transformation, citations, multilingual review labeling, factuality scoring, chat, analytics, and exports without an API key.

### Real AI Mode

The provider layer is isolated in `packages/ai/provider.js`. To connect OpenAI, Ollama, Hugging Face, or another local/open model, implement a provider with the same `transform` and `chat` methods and switch using `LLM_PROVIDER`.

## API Overview

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/me`
- `POST /api/documents/upload`
- `GET /api/documents`
- `POST /api/documents/:id/chat`
- `POST /api/documents/compare`
- `POST /api/transformations`
- `GET /api/transformations`
- `POST /api/transformations/:id/verify`
- `POST /api/transformations/:id/version`
- `POST /api/exports/:id`
- `GET /api/analytics`

## Deployment Notes

- Put the Node service behind HTTPS.
- Set a strong `JWT_SECRET`.
- Replace local JSON storage with PostgreSQL using the same table names.
- Use object storage for sensitive uploads.
- Add a production parser for binary PDF/DOCX extraction.
- Configure a real LLM and embedding provider.
- Replace local vector retrieval with FAISS, Chroma, Qdrant, or pgvector.

## Screenshots

Add final screenshots to `docs/screenshots/` after recording the SIH demo video.

## Future Enhancements

- Real streaming generation
- Background job queue
- OCR and speech transcription
- Full DOCX/PDF export
- Department-level RBAC
- Human approval workflow
- Redaction and DLP checks
- Enterprise SSO
