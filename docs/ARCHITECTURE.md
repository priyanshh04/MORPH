# TransformAI Architecture

## System Overview

TransformAI converts one or more source documents into many verified communication outputs. The workflow is:

```text
source upload
  -> parsing and normalization
  -> chunking
  -> source intelligence extraction
  -> retrieval
  -> grounded generation
  -> factuality verification
  -> preview, edit, version, export
```

The current prototype is dependency-free for SIH demo reliability, but the boundaries mirror a production architecture.

## Components

**Web App:** `apps/web` contains the enterprise dashboard, landing page, upload workspace, document intelligence panel, transformation controls, output preview, chat, comparison, exports, analytics, templates, and settings.

**API:** `apps/api/server.js` exposes REST endpoints for auth, documents, transformations, verification, chat, comparison, analytics, and exports.

**AI Package:** `packages/ai` contains document parsing, chunking, retrieval, provider abstraction, deterministic demo provider, and factuality verification. A real OpenAI/Ollama/Hugging Face provider can be added without changing the UI.

**Data Package:** `packages/database` stores data in `data/db.json` using table-like collections matching the requested PostgreSQL schema: users, documents, chunks, facts, entities, transformations, versions, outputs, citations, verification results, templates, analytics, and audit logs.

## Security Model

Users authenticate with hashed passwords. API calls use signed bearer tokens. API keys are never sent to the browser. The server applies rate limiting, upload size limits, basic security headers, and audit logging. Production deployment should add HTTPS, hardened RBAC, file scanning, object storage, and database-backed sessions.

## RAG and Verification

The RAG prototype chunks normalized text and retrieves evidence by lexical relevance. The generation provider receives document facts and chunks, then returns content plus a citation map. The verification step extracts claims from generated output, compares them against source facts, assigns Supported, Partially supported, or Unsupported, and computes factuality and citation coverage scores.

## Production Migration

Replace local JSON with PostgreSQL, add a vector store such as pgvector/Qdrant/Chroma, integrate robust PDF/DOCX parsers, implement a real model provider, and move long-running ingestion/generation into background jobs.
