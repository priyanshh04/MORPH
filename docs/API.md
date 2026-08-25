# API Reference

All protected endpoints require:

```text
Authorization: Bearer <token>
```

## Auth

`POST /api/auth/login`

```json
{ "email": "officer@transformai.gov", "password": "Officer@123" }
```

`POST /api/auth/register`

```json
{ "name": "User", "email": "user@example.gov", "password": "StrongPassword" }
```

## Documents

`POST /api/documents/upload`

```json
{
  "name": "notification.txt",
  "type": "text/plain",
  "department": "Social Welfare",
  "content": "Source text..."
}
```

`GET /api/documents`

`POST /api/documents/:id/chat`

```json
{ "question": "What is the deadline?" }
```

`POST /api/documents/compare`

```json
{ "documentIds": ["doc_a", "doc_b"] }
```

## Transformations

`POST /api/transformations`

```json
{
  "documentIds": ["doc_id"],
  "outputTypes": ["Citizen Simplifier", "Officer Brief", "FAQ Generator"],
  "audience": "Citizen",
  "tone": "Simple",
  "length": "Medium",
  "channel": "Website",
  "language": "English"
}
```

`GET /api/transformations`

`POST /api/transformations/:id/verify`

`POST /api/transformations/:id/version`

```json
{ "content": "Edited output content" }
```

## Export

`POST /api/exports/:id`

```json
{ "format": "md" }
```

Supported prototype formats: `md`, `txt`, `json`.

## Analytics

`GET /api/analytics`
