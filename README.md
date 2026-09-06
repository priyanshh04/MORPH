# MORPH

**Multiformat Output & Representation Processing Hub**

MORPH is a Smart India Hackathon 2026 implementation for **SIH26154 - GenAI Platform for Automated Content Transformation**. It securely ingests source information, extracts evidence, retrieves relevant context, transforms content into multiple representations, verifies generated claims, exposes traceability, supports human review, and exports artifacts with provenance.

MORPH does not ask users to blindly trust AI. It presents source evidence, citations, factuality scoring, confidence signals, conflicts, security findings, authenticity assessment, and reviewer approval status.

## Core Pipeline

```text
AUTHENTICATE -> SECURE -> INGEST -> UNDERSTAND -> RETRIEVE -> TRANSFORM -> VERIFY -> TRACE -> HUMAN REVIEW -> PUBLISH
```

## Implemented Features

- Dark enterprise landing page and protected dashboard
- Secure login/register/logout with hashed passwords and bearer tokens
- White accessible logout button
- Swarm Ingestion Matrix for multiple files and pasted sources
- Upload allow-list for PDF, DOCX, TXT, Markdown, CSV, images, audio, and ZIP names
- Source intelligence: facts, entities, dates, numbers, topics, risks
- RAG-style chunk retrieval with chunk/page/section metadata
- MORPH Studio with explicit controls for audience, tone, length, channel, language, and format
- Multi-output generation from the same source
- Ask MORPH document Q&A with source citations and confidence
- Glass Box evidence mapping from generated claims to source evidence
- Factuality verification with supported, partial, and unsupported claim counts
- Confidence and conflict detection for changed dates/numbers
- MORPH Immune System for prompt-injection-like content and hidden Unicode
- Clearance-based deterministic redaction
- Historical Echoes for potential source relationships
- Bias Neutralizer
- Authenticity Assessment
- Oracle Mode as evidence-based scenario analysis, not prediction
- Human review and approval
- Markdown/JSON/HTML export path with artifact provenance hash
- Audit and provenance verification endpoints
- Analytics driven from stored actions and generated outputs
- Explicit demo mode for SIH judging without external API keys
- Server-side OpenAI Responses API provider path

## Tech Stack

- Frontend: dependency-free SPA using HTML, CSS, JavaScript
- Backend: Node.js HTTP server
- AI layer: `packages/ai` provider abstraction
- Persistence: local JSON database with relational collection names
- Tests: Node `assert`

The prototype avoids mandatory installs so it can run in restricted demo environments. Production migration should replace JSON storage with PostgreSQL + pgvector.

## Run Locally

```bash
cd transformai
node apps/api/server.js
```

Open:

```text
http://localhost:4321
```

## Demo Credentials

```text
officer@transformai.gov / Officer@123
admin@transformai.gov / Admin@123
```

## Tests

```bash
node tests/run-tests.js
```

Coverage includes parsing, chunking, RAG retrieval, transformation, citation preservation, verification, auth, upload validation, Immune System scan, redaction, and conflict detection.

## Environment

See `.env.example`.

Important values:

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
LLM_PROVIDER=demo
DEMO_MODE=true
DATABASE_URL=
JWT_SECRET=
STORAGE_PATH=data
MAX_UPLOAD_MB=12
APP_URL=http://localhost:4321
```

In production OpenAI mode, set:

```text
LLM_PROVIDER=openai
DEMO_MODE=false
OPENAI_API_KEY=<server-side-key>
```

If OpenAI production mode is selected without a key, the backend returns a configuration error instead of silently pretending demo content came from OpenAI.

## API Highlights

- `POST /api/auth/login`
- `GET /api/me`
- `POST /api/documents/upload`
- `POST /api/documents/swarm`
- `POST /api/documents/:id/analyze`
- `POST /api/documents/:id/chat`
- `GET /api/documents/:id/glass-box`
- `GET /api/documents/:id/immune`
- `POST /api/documents/:id/redact`
- `GET /api/documents/:id/echoes`
- `POST /api/documents/:id/neutralize`
- `POST /api/documents/:id/oracle`
- `GET /api/documents/:id/authenticity`
- `POST /api/documents/compare`
- `POST /api/transformations`
- `POST /api/transformations/:id/verify`
- `POST /api/reviews/:id`
- `POST /api/exports/:id`
- `POST /api/provenance/verify`
- `GET /api/audit`
- `GET /api/analytics`

## Deployment

For a production deployment:

1. Run the Node server behind HTTPS.
2. Set a strong `JWT_SECRET`.
3. Set `DEMO_MODE=false` and configure `OPENAI_API_KEY`.
4. Replace local JSON with PostgreSQL.
5. Add pgvector, Qdrant, Chroma, or another vector store.
6. Store uploaded files in secure object storage.
7. Add file malware scanning and robust binary PDF/DOCX/OCR/transcription workers.
8. Put long-running ingestion and generation into a job queue.
9. Add department-level RBAC and clearance enforcement.

## Responsible AI Limits

MORPH does not claim 100% accuracy, zero hallucinations, guaranteed authenticity, perfect bias removal, unhackability, or future prediction. It is a source-grounded transformation and review platform that makes evidence and uncertainty visible.
