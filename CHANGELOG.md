# Changelog

All notable changes to this project will be documented in this file.

## [3.1.0] - 2026-03-24

### Added
- **RAG context injection**: `previsacion.worker.js` now calls `ragService.generarContextoGeneral(tenant_id)`
  before the GPT-4o call, injecting top-60 nomenclators + top-25 prestadores as reference context
  into the user prompt (`user.prompt.template.js` section "REFERENCIA DE NOMENCLADOR")
- **Narrative practice fallback**: `_extraerPracticasNarrativa()` method in `PrevisacionWorker`
  extracts practices from free-text observations when GPT-4o returns an empty `detalle_practicas`
  (detects 19 procedure patterns: RADIOTERAPIA, QUIMIOTERAPIA, CIRUGIA, BIOPSIA, etc.)
- **Comprehensive system prompt**: rewrote `system.prompt.js` with 80+ medical abbreviations
  across 10 categories (vitals, routes, forms, imaging, lab, procedures, oncology, etc.),
  explicit Section 6 "PRACTICES IN NARRATIVE TEXT" with trigger verbs and concrete examples,
  and Rule 8 mandating inclusion of narrative-inferred practices
- **Frontend detail page**: `PreVisacionDetailPage.jsx` for reviewing individual pre-visacion
  results with full IA output, practice details, and audit actions
- **CHANGELOG.md**: this file

### Changed
- `src/utils/constants.js`: `MAX_TOKENS` increased from 2000 to 4000 to accommodate
  RAG context + richer GPT-4o responses
- `docker-compose.yml`: removed embedded PostgreSQL service; DB is now external
  (configured via `DATABASE_URL` env var pointing to the existing Postgres instance)
- `frontend/src/pages/PreVisacionesPage.jsx`: updated list view with detail navigation
- `frontend/src/lib/api.js`, `frontend/src/App.jsx`: API helper and routing updates
- `src/routes/pre-visacion.routes.js`, `src/routes/v1/index.js`,
  `src/controllers/pre-visacion.controller.js`, `src/services/pre-visacion.service.js`:
  API endpoint adjustments for pre-visacion management

### Fixed
- **Null crash** (`gpt-vision.service.js` line ~96): added explicit null/type check after
  `JSON.parse()` so that an empty GPT-4o response (e.g. 10 completion tokens) throws a
  catchable error and triggers the retry logic instead of crashing with
  `TypeError: Cannot read properties of null (reading 'cabecera')`
- **Encoding**: removed all Spanish accented characters (a, e, i, o, u, n) from
  `system.prompt.js`, `user.prompt.template.js`, `gpt-vision.service.js`, and
  `previsacion.worker.js` -- all user-facing strings and log messages are now plain ASCII
  to prevent UTF-8/Latin-1 mismatches when text flows through the webhook -> Oracle pipeline.
  Replaced arrows (->), special symbols (mcg), and curly quotes as well.

### Removed
- `data/NOMENCLADORES_GENERALES.xlsx`: nomenclator data migrated to PostgreSQL + pgvector
- `data/PRESTADORES_PRINCIPALES.xlsx`: prestador data migrated to PostgreSQL + pgvector
