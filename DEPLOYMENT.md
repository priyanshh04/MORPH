# MORPH deployment

## Render

This repository includes `render.yaml` for a Node web service plus PostgreSQL.

1. Create a Render Blueprint from the repository.
2. Select the `deploy-ready` branch for the first deployment.
3. Set the secret `OPENAI_API_KEY` in Render.
4. Deploy. Render supplies `PORT` and `DATABASE_URL`; the application listens on `0.0.0.0`.
5. Open the service URL and use **Create Account**. Demo credentials are intentionally disabled in production.

Production settings used by the blueprint:
- `NODE_ENV=production`
- `DEMO_MODE=false`
- `SEED_DEMO=false`
- `LLM_PROVIDER=openai`
- `MODEL_NAME=gpt-5.5`
- `DATABASE_SSL=true`
- generated `JWT_SECRET`

## Local development

```bash
npm install
copy .env.example .env
npm test
npm start
```

For local demo mode, keep `DEMO_MODE=true`, `SEED_DEMO=true`, and leave `DATABASE_URL` empty. The application uses `data/db.json` locally.

For local PostgreSQL, set `DATABASE_URL` and `DATABASE_SSL=false`.

## Important production behavior

- PostgreSQL is used whenever `DATABASE_URL` is set, preventing Render restarts from losing application state.
- PDF and DOCX uploads are parsed server-side; the browser sends binary files as base64 JSON.
- OpenAI API credentials stay server-side and are never embedded in frontend code.
- Production refuses to start without a strong `JWT_SECRET` and `DATABASE_URL`.
- Demo accounts and demo seed data are disabled by default in production.
- The health endpoint is `GET /api/health`.
