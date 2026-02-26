# Medical OCR Service - API Contract Documentation

## Overview

This document describes the complete API contract for the Medical OCR Service. The system follows an **API-First architecture**: external systems (APEX, Oracle ORDS, or any HTTP client) send data via HTTP POST and receive results via webhooks.

**Base URL**: `https://<host>/api/v1`

**Authentication**: All endpoints require one of:
- `Authorization: Bearer <JWT_TOKEN>`
- `X-Api-Key: <API_KEY>`

**Rate Limits**: Batch endpoints are limited to **10 requests/minute per IP**.

---

## 1. Data Ingestion Endpoints

### 1.1 POST /v1/data/prestadores/batch

Upload/sync providers from the source system.

**Request:**
```json
{
  "source_ref": "ORACLE_SYNC_20240115",
  "prestadores": [
    {
      "id_externo": "PREST-001",
      "ruc": "80012345-6",
      "nombre_fantasia": "Sanatorio Americano",
      "razon_social": "Sanatorio Americano S.A.",
      "registro_profesional": "REG-12345",
      "tipo": "SANATORIO",
      "ranking": 95.5,
      "estado": "ACTIVO"
    }
  ]
}
```

**Validation Rules:**
- `prestadores`: array, min 1, max 5000 items
- `id_externo`: required, string
- `nombre_fantasia`: required, string

**Response (202 Accepted):**
```json
{
  "status": "accepted",
  "job_id": "uuid",
  "batch_id": "uuid",
  "status_job": "queued",
  "total_recibidos": 100,
  "total_insertados": 80,
  "total_actualizados": 20,
  "estimado_segundos": 4
}
```

**Behavior:**
- Uses `id_externo` as the upsert key
- Automatically enqueues an embedding generation job
- Embeddings are generated asynchronously using OpenAI text-embedding-3-small

---

### 1.2 POST /v1/data/nomencladores/batch

Upload/sync medical procedure codes.

**Request:**
```json
{
  "source_ref": "ORACLE_SYNC_20240115",
  "nomencladores": [
    {
      "id_externo": "NOM-001",
      "id_servicio": 10,
      "especialidad": "LABORATORIO",
      "descripcion": "Hemograma completo",
      "desc_nomenclador": "Hemograma completo con recuento diferencial",
      "grupo": "A",
      "subgrupo": "A1",
      "sinonimos": ["CBC", "biometria hematica"],
      "palabras_clave": ["sangre", "hematologia"],
      "estado": "ACTIVO"
    }
  ]
}
```

**Validation Rules:**
- `nomencladores`: array, min 1, max 5000 items
- `id_externo`: required, string
- `descripcion`: required, string

**Response (202 Accepted):** Same structure as prestadores batch.

---

### 1.3 POST /v1/data/acuerdos/batch

Upload/sync provider-nomenclador price agreements.

**Request:**
```json
{
  "source_ref": "ORACLE_SYNC_20240115",
  "acuerdos": [
    {
      "id_prestador_externo": "PREST-001",
      "id_nomenclador_externo": "NOM-001",
      "plan_id": 1,
      "precio": 150000,
      "precio_normal": 150000,
      "precio_diferenciado": 120000,
      "precio_internado": 100000,
      "vigente": "SI",
      "fecha_vigencia": "2024-01-01"
    }
  ]
}
```

**Validation Rules:**
- `acuerdos`: array, min 1, max 5000 items
- `id_prestador_externo`: required (must exist in prestadores)
- `id_nomenclador_externo`: required (must exist in nomencladores)

**Response (200 OK):**
```json
{
  "status": "ok",
  "total_recibidos": 50,
  "total_insertados": 40,
  "total_actualizados": 8,
  "total_errores": 2,
  "errores": [
    { "index": 5, "id_prestador_externo": "PREST-999", "error": "Prestador not found" }
  ]
}
```

**Note:** Acuerdos do NOT generate embeddings. The `id_prestador_externo` and `id_nomenclador_externo` are resolved to internal PostgreSQL IDs. If either is not found, the row is skipped and included in the `errores` array.

---

### 1.4 GET /v1/data/jobs/:job_id/status

Check the status of an asynchronous job.

**Response:**
```json
{
  "status": "ok",
  "data": {
    "job_id": "uuid",
    "tipo": "embedding_prestadores",
    "estado": "DONE",
    "intentos": 1,
    "max_intentos": 3,
    "error_message": null,
    "resultado": { "processed": 100, "embeddings_generated": 100, "elapsed_ms": 5200 },
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2024-01-15T10:00:05Z"
  }
}
```

**Job states:** `QUEUED` → `PROCESSING` → `DONE` | `FAILED`

---

### 1.5 GET /v1/data/stats

Get database statistics.

**Response:**
```json
{
  "status": "ok",
  "data": {
    "prestadores": { "total": 500, "con_embeddings": 480 },
    "nomencladores": { "total": 1200, "con_embeddings": 1150 },
    "acuerdos": { "total": 8500 }
  }
}
```

---

## 2. Order Processing Endpoints

### 2.1 POST /v1/ordenes/batch

Submit medical orders for OCR processing and automatic pre-visacion generation.

**Request:**
```json
{
  "ordenes": [
    {
      "id_externo": "ORD-2024-00123",
      "archivo_base64": "/9j/4AAQSkZJRg...",
      "archivo_nombre": "orden_medica_123.jpg",
      "archivo_tipo": "image/jpeg",
      "metadata": {
        "plan_id": 1,
        "ci_paciente": "4567890",
        "prioridad": "NORMAL"
      }
    }
  ],
  "webhook_url": "https://your-system.com/webhooks/ocr"
}
```

**Validation Rules:**
- `ordenes`: array, min 1, max 50 items
- `archivo_base64`: max ~10MB encoded
- `archivo_nombre`: required
- `prioridad`: `NORMAL` | `URGENTE`

**Response (202 Accepted):**
```json
{
  "status": "accepted",
  "batch_id": "uuid",
  "total": 3,
  "jobs": [
    { "id_externo": "ORD-2024-00123", "job_id": "uuid", "status": "queued" },
    { "id_externo": "ORD-2024-00124", "job_id": "uuid", "status": "queued" },
    { "id_externo": "ORD-2024-00125", "job_id": "uuid", "status": "queued" }
  ]
}
```

**Processing Pipeline (per order):**
1. Decode base64 → temp file
2. PDF → image conversion (if needed)
3. GPT-4o Vision OCR extraction
4. Save in `ordenes_procesadas`
5. Generate pre-visacion with nomenclador matching
6. Dispatch webhook `previsacion.generada`
7. Cleanup temp files

---

### 2.2 GET /v1/ordenes/batch/:batch_id/status

Check batch processing status.

**Response:**
```json
{
  "status": "ok",
  "data": {
    "batch_id": "uuid",
    "total": 3,
    "queued": 0,
    "processing": 1,
    "done": 2,
    "failed": 0,
    "jobs": [
      {
        "job_id": "uuid",
        "id_externo": "ORD-2024-00123",
        "tipo": "previsacion",
        "estado": "DONE",
        "intentos": 1,
        "error": null,
        "created_at": "...",
        "updated_at": "..."
      }
    ]
  }
}
```

---

## 3. Feedback Endpoint

### 3.1 POST /v1/ordenes/:id_visacion/feedback

Submit approval, rejection, or corrections for a pre-visacion.

**Request (Approve):**
```json
{
  "accion": "APROBAR",
  "usuario": "dr.martinez"
}
```

**Request (Reject):**
```json
{
  "accion": "RECHAZAR",
  "usuario": "dr.martinez",
  "motivo": "Orden ilegible, solicitar nueva"
}
```

**Request (Correct):**
```json
{
  "accion": "CORREGIR",
  "usuario": "dr.martinez",
  "motivo": "Nomenclador incorrecto en item 2",
  "correcciones": [
    {
      "item": 2,
      "id_nomenclador_correcto": 456,
      "id_prestador_correcto": null,
      "cantidad_correcta": 2,
      "razon": "Es ecografia abdominal, no ecografia renal"
    }
  ]
}
```

**Response:**
```json
{
  "status": "ok",
  "data": {
    "id_visacion_previa": 123,
    "accion": "CORREGIR",
    "estado_final": "APROBADA",
    "correcciones_aplicadas": 1,
    "usado_en_training": true,
    "success": true,
    "message": "1 correcciones aplicadas"
  }
}
```

---

## 4. Webhook Contracts

All webhooks are sent as HTTP POST with these headers:

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Webhook-Event` | Event name (e.g., `previsacion.generada`) |
| `X-Webhook-Timestamp` | Unix timestamp |
| `X-Webhook-Signature` | `sha256={HMAC-SHA256 of body}` |
| `X-Webhook-Retry` | Retry attempt number (0-based) |

**Retry Policy:** Up to 5 retries with exponential backoff: 5s, 15s, 30s, 60s, 120s.

---

### 4.1 Event: previsacion.generada

Sent when a pre-visacion is successfully generated.

```json
{
  "event": "previsacion.generada",
  "timestamp": "2024-01-15T10:05:00.000Z",
  "data": {
    "batch_id": "uuid",
    "job_id": "uuid",
    "id_externo_orden": "ORD-2024-00123",
    "id_visacion_previa": 456,
    "estado": "PENDIENTE",
    "confianza_general": 0.87,
    "requiere_revision": false,
    "cabecera": {
      "paciente": {
        "ci": "4567890",
        "nombre": "Juan Perez",
        "fecha_nacimiento": null
      },
      "medico": {
        "nombre": "Dr. Maria Lopez",
        "matricula": "MAT-12345",
        "id_prestador_encontrado": 789,
        "confianza": 0.95
      },
      "prestador_emisor": {
        "nombre_original": "Sanatorio Americano",
        "id_prestador_encontrado": 101,
        "nombre_fantasia": "Sanatorio Americano S.A.",
        "ruc": "80012345-6",
        "confianza": 0.92
      },
      "fecha_orden": "2024-01-15",
      "diagnostico": {
        "descripcion": "Control de rutina",
        "codigo_cie10": "Z00.0"
      }
    },
    "detalle_practicas": [
      {
        "item": 1,
        "descripcion_original": "Hemograma completo",
        "cantidad": 1,
        "nomenclador_sugerido": {
          "id_nomenclador": 201,
          "descripcion": "Hemograma completo con recuento diferencial",
          "especialidad": "LABORATORIO",
          "grupo": "A",
          "subgrupo": "A1"
        },
        "confianza": 0.95,
        "tiene_acuerdo": true,
        "precio_acuerdo": 150000,
        "matches_alternativos": [
          { "id_nomenclador": 202, "descripcion": "Hemograma simple", "similitud": 0.82 }
        ]
      }
    ],
    "alertas": [],
    "observaciones_ia": "Orden procesada: 1 practica(s) detectada(s). Prestador identificado: Sanatorio Americano S.A. (confianza: 0.92).",
    "ia_metadata": {
      "modelo_usado": "gpt-4o",
      "tokens_usados": 1250,
      "tiempo_procesamiento_ms": 4500
    }
  }
}
```

---

### 4.2 Event: previsacion.fallida

Sent when order processing fails after all retries.

```json
{
  "event": "previsacion.fallida",
  "timestamp": "2024-01-15T10:05:00.000Z",
  "data": {
    "batch_id": "uuid",
    "job_id": "uuid",
    "id_externo_orden": "ORD-2024-00123",
    "error": "PDF conversion timeout - archivo muy grande o corrupto",
    "intentos": 3
  }
}
```

---

### 4.3 Event: previsacion.feedback_recibido

Sent when feedback is submitted on a pre-visacion.

```json
{
  "event": "previsacion.feedback_recibido",
  "timestamp": "2024-01-15T11:00:00.000Z",
  "data": {
    "id_visacion_previa": 456,
    "accion": "CORREGIR",
    "usuario": "dr.martinez",
    "estado_final": "APROBADA",
    "correcciones_aplicadas": 1,
    "usado_en_training": true
  }
}
```

---

## 5. Error Handling

### Validation Errors (422)
```json
{
  "status": "error",
  "errors": [
    { "field": "prestadores.0.nombre_fantasia", "message": "\"nombre_fantasia\" is required" }
  ]
}
```

### Authentication Errors (401)
```json
{
  "status": "error",
  "error": { "code": "UNAUTHORIZED", "message": "Missing authorization header" }
}
```

### Not Found (404)
```json
{
  "status": "error",
  "error": { "code": "NOT_FOUND", "message": "Job not found" }
}
```

### Rate Limit (429)
```json
{
  "status": "error",
  "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "Max 10 requests per minute for batch endpoints" }
}
```

---

## 6. Recommended Integration Flow

```
EXTERNAL SYSTEM (APEX / Oracle ORDS / Any Client)
    │
    ├── 1. POST /v1/data/prestadores/batch    ← Sync providers
    ├── 2. POST /v1/data/nomencladores/batch   ← Sync procedures
    ├── 3. POST /v1/data/acuerdos/batch        ← Sync price agreements
    │       (Wait for embeddings: GET /v1/data/jobs/:id/status)
    │
    ├── 4. POST /v1/ordenes/batch              ← Submit medical orders
    │       (Poll: GET /v1/ordenes/batch/:id/status)
    │
    ├── 5. ← WEBHOOK: previsacion.generada     ← Receive results
    │       OR
    │       ← WEBHOOK: previsacion.fallida      ← Receive errors
    │
    └── 6. POST /v1/ordenes/:id/feedback       ← Submit approval/corrections
            ← WEBHOOK: previsacion.feedback_recibido
```

---

## 7. Webhook Signature Verification

To verify webhook authenticity:

```javascript
const crypto = require('crypto');

function verifyWebhook(body, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

```python
import hmac
import hashlib

def verify_webhook(body: bytes, signature: str, secret: str) -> bool:
    expected = 'sha256=' + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

---

## 8. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_CONCURRENCY` | `3` | Max concurrent job processing |
| `DATABASE_URL` | - | PostgreSQL connection string |
| `OPENAI_API_KEY` | - | OpenAI API key |

---

## 9. JSON Schema Files

Machine-readable schemas are available in `src/schemas/contracts/`:

- `prestadores-batch.schema.json`
- `nomencladores-batch.schema.json`
- `acuerdos-batch.schema.json`
- `ordenes-batch.schema.json`
- `webhook-previsacion-generada.schema.json`
- `webhook-previsacion-fallida.schema.json`
- `feedback-request.schema.json`
