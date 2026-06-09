# Revised_SpreadX — Migration Plan

_Last updated: 2026-06-05_

Two independent migrations, both designed for **minimal changes to the core
pipeline** (`pipeline/orchestrator.py` and the `pdf/`, `models/`, `export/`
modules stay untouched):

1. **Frontend:** Streamlit → **FastAPI backend + React (Vite + TypeScript) SPA**
2. **LLM:** AWS Bedrock → **Anthropic API (direct)**, behind a thin provider
   abstraction so both work via one env var.

> Guiding principle: `run_pipeline(pdf_bytes, template_type, dpi_scale,
> progress_callback)` is the single, stable seam. The frontend calls it; the
> LLM swap happens *below* it. Neither migration requires editing the
> orchestrator.

---

## Part A — Frontend: Streamlit → FastAPI + React

### A.1 Why this is low-risk

`run_pipeline()` already takes only bytes + options + a
`progress_callback(stage, detail, pct)`. Streamlit (`app.py`) is a thin
consumer of it. We replace that consumer with:
- a **FastAPI** service that exposes `run_pipeline()` over HTTP, and
- a **React** SPA that uploads the PDF, streams progress, and renders results.

`app.py` and `main.py` can both stay as-is during the transition (Streamlit
remains a working fallback until React reaches parity).

### A.2 Target structure

```
Revised_SpreadX/
├── api/                         # NEW — FastAPI backend
│   ├── main.py                  # FastAPI app, CORS, routes
│   ├── routes.py                # /api/extract, /api/health
│   ├── schemas.py               # Pydantic request/response models
│   └── progress.py             # SSE progress streaming helper
├── frontend/                    # NEW — React (Vite + TS) SPA
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── api.ts               # fetch wrapper for the backend
│       └── components/
│           ├── UploadPanel.tsx
│           ├── ProgressBar.tsx
│           ├── SummaryCards.tsx
│           ├── RowsTable.tsx
│           └── NotesPanel.tsx
├── pipeline/ pdf/ claude/ ...   # UNCHANGED
└── app.py                       # kept as fallback (optional removal later)
```

### A.3 Backend API design

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Liveness check. |
| `/api/extract` | POST (multipart) | Upload PDF + `template_type`, `dpi_scale`. Runs the pipeline. Returns JSON result. |
| `/api/extract/stream` | POST → **SSE** | Same, but streams `progress_callback` events live, then a final `result` event. |
| `/api/export/xlsx` | POST | Takes a result id (or re-runs) and returns the XLSX bytes for download. |

**Progress streaming** maps the existing `progress_callback(stage, detail, pct)`
directly onto Server-Sent Events — one SSE `data:` line per callback invocation.
This reproduces the live `st.status` / progress-bar experience in Streamlit.

Because `run_pipeline()` is **synchronous and CPU/IO-heavy**, run it in a thread
(`fastapi.concurrency.run_in_threadpool` or `anyio.to_thread`) so the event loop
stays responsive. For SSE, push callback events into an `asyncio.Queue` from the
worker thread and drain it in the streaming response.

**Sketch (`api/routes.py`):**
```python
@router.post("/api/extract/stream")
async def extract_stream(file: UploadFile, template_type: str = "T0_unknown",
                         dpi_scale: float = 2.0):
    pdf_bytes = await file.read()
    queue: asyncio.Queue = asyncio.Queue()

    def progress(stage, detail, pct):
        queue.put_nowait({"type": "progress", "stage": stage,
                           "detail": detail, "pct": pct})

    async def run():
        result = await run_in_threadpool(
            run_pipeline, pdf_bytes, template_type, dpi_scale, progress)
        xlsx = build_raw_extraction_xlsx(result)
        queue.put_nowait({"type": "result",
                          "summary": result.summary,
                          "rows": result.extracted_rows,
                          "notes": [serialize_note(n) for n in result.extracted_notes],
                          "xlsx_b64": base64.b64encode(xlsx).decode()})
        queue.put_nowait({"type": "done"})

    asyncio.create_task(run())
    return EventSourceResponse(drain(queue))
```
Notes:
- `result.extracted_rows` is already a list of plain dicts → JSON-serializable.
- `result.extracted_notes` are Pydantic models → add a small `serialize_note()`
  (or `model_dump()`).
- XLSX returned base64-inline keeps the API stateless (no server storage). For
  large files, switch to a temp-file + `/api/export/xlsx?id=...` later.

### A.4 Frontend (React) responsibilities

Recreate the current Streamlit UI 1:1:
- **Upload panel** — PDF file input + sidebar settings (`template_type`
  dropdown `T0_unknown…T8`, `dpi_scale` slider 1.0–3.0).
- **Progress** — consume SSE, show a progress bar + scrolling stage log.
- **Summary cards** — Total / Digital / Scanned pages, Rows, Notes.
- **Rows table** — columns: page, statement_type, raw_label, indentation_level,
  is_subtotal, note_ref, statement_scope, raw_values (JSON). Add the
  per-statement-type grouping/expanders.
- **Notes panel** — expandable note cards with sub-tables.
- **Download** — decode base64 XLSX → `Blob` → download link.

Stack: Vite + React + TypeScript. Suggested libs: a lightweight table
(TanStack Table) and a component kit (e.g. shadcn/ui or Mantine) — optional.

### A.5 Dev & deploy

- **Dev:** run FastAPI on `:8000` (`uvicorn api.main:app --reload`) and Vite on
  `:5173`; Vite proxy forwards `/api` → `:8000` (set CORS in FastAPI for dev).
- **Prod:** `vite build` emits static assets; serve them from FastAPI
  (`StaticFiles`) so it's a single deployable service, or host the SPA on any
  static host pointing at the API.
- **New deps:** add `fastapi`, `uvicorn[standard]`, `python-multipart`,
  `sse-starlette` to `requirements.txt`. (`pandas` is no longer needed by the UI
  layer once React renders tables — keep only if used elsewhere.)

### A.6 Migration steps (frontend)

1. Add backend deps; scaffold `api/` with `/api/health`.
2. Implement `/api/extract` (non-streaming) returning the full result JSON.
   Validate against a known PDF vs. the Streamlit output.
3. Add `serialize_note()` + base64 XLSX. Add `/api/extract/stream` (SSE).
4. Scaffold `frontend/` (Vite). Build Upload + non-streaming result render.
5. Wire SSE progress; reach UI parity with Streamlit.
6. Add XLSX download.
7. (Optional) Serve built SPA from FastAPI; retire `app.py`.

**Acceptance:** same PDF through Streamlit and the new UI yields identical
`summary`, row counts, and XLSX. `main.py` CLI keeps working unchanged.

---

## Part B — LLM: Bedrock → Anthropic API (behind an abstraction)

### B.1 Goal

Run the same Claude models/prompts **without Bedrock**, calling
`api.anthropic.com` directly, while keeping Bedrock available. Achieve this by
introducing **one thin LLM-client module** so the four current call sites stop
talking to boto3 directly. Provider is selected by an env var.

### B.2 The coupling to remove

Today, `client.converse(...)` is hard-coded in 4 places (see Current_State §4):
`claude/extract.py`, `claude/extract_vision.py`, `claude/extract_notes.py`,
`pdf/statement_classifier.py`. Each builds Bedrock-shaped messages and reads
`response["output"]["message"]["content"][0]["text"]`.

### B.3 Design: a minimal `llm/` client

Create a small abstraction with **two methods** that cover every current call —
text completion and vision completion — both returning a plain string (the model
text), which is exactly what all four call sites already consume.

```
llm/
├── __init__.py
├── base.py          # LLMClient protocol/ABC + Message types
├── bedrock.py       # BedrockClient (wraps today's converse() logic)
├── anthropic.py     # AnthropicClient (anthropic SDK, Messages API)
└── factory.py       # get_llm_client() -> picks provider from config
```

**Interface (`llm/base.py`):**
```python
class LLMClient(Protocol):
    def complete(self, *, system: str | None, prompt: str,
                 max_tokens: int) -> str: ...
    def complete_vision(self, *, prompt: str, image_png: bytes,
                        max_tokens: int, system: str | None = None) -> str: ...
```

**Bedrock impl** = the existing `converse()` code moved verbatim out of the four
modules (same message/image shapes, same response parsing). No behavior change.

**Anthropic impl** = `anthropic` SDK Messages API:
```python
from anthropic import Anthropic
class AnthropicClient:
    def __init__(self, model, api_key):
        self._c = Anthropic(api_key=api_key)
        self._model = model
    def complete(self, *, system, prompt, max_tokens):
        msg = self._c.messages.create(
            model=self._model, max_tokens=max_tokens,
            system=system or NOT_GIVEN,
            messages=[{"role": "user", "content": prompt}])
        return msg.content[0].text
    def complete_vision(self, *, prompt, image_png, max_tokens, system=None):
        b64 = base64.standard_b64encode(image_png).decode()
        msg = self._c.messages.create(
            model=self._model, max_tokens=max_tokens, system=system or NOT_GIVEN,
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64",
                 "media_type": "image/png", "data": b64}},
                {"type": "text", "text": prompt}]}])
        return msg.content[0].text
```

### B.4 Config changes (`config.py`)

```python
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "bedrock")        # "bedrock" | "anthropic"

# Bedrock (existing)
AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
BEDROCK_DEFAULT_MODEL_ID = os.getenv("BEDROCK_DEFAULT_MODEL_ID",
                                     "global.anthropic.claude-sonnet-4-6")
# Anthropic (new)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
```
`get_bedrock_client()` stays (used by `llm/bedrock.py`). Add
`get_llm_client()` in `llm/factory.py` that returns the right client based on
`LLM_PROVIDER`, caching the instance.

### B.5 The 4 call-site edits (the only core changes)

Each edit is a 2–4 line swap; **prompts are untouched.**

| File | Before | After |
|------|--------|-------|
| `claude/extract.py` | `client = get_bedrock_client(); resp = client.converse(...); raw = resp[...]["text"]` | `raw = get_llm_client().complete(system=SYSTEM, prompt=prompt, max_tokens=TEXT_EXTRACT_MAX_TOKENS)` |
| `claude/extract_vision.py` | `converse(... image ...)` | `get_llm_client().complete_vision(prompt=prompt, image_png=image_buffer, max_tokens=VISION_EXTRACT_MAX_TOKENS)` |
| `claude/extract_notes.py` | `converse(...)` | `get_llm_client().complete(system=None, prompt=prompt, max_tokens=4096)` |
| `pdf/statement_classifier.py` | `converse(... image ...)` per page | `get_llm_client().complete_vision(prompt=_SCANNED_PROMPT, image_png=buf, max_tokens=512)` |

The existing JSON-cleanup logic (strip ``` fences, slice `{`…`}`,
`json.loads`) stays exactly as-is in every call site — both providers return a
raw text string, so that downstream code is provider-agnostic.

### B.6 Behavior parity notes

- **Same model family:** default Anthropic model is the Claude Sonnet 4.6
  equivalent of the current Bedrock model → prompts and outputs should match
  closely. Minimal re-tuning expected (this is why Anthropic-direct was chosen
  over OpenAI/Gemini).
- **Timeouts/retries:** the Anthropic SDK has its own timeout/retry config —
  set generous values to mirror the current 900s Bedrock read timeout for dense
  pages (`Anthropic(timeout=..., max_retries=3)`).
- **Errors:** keep the existing `try/except → '{"rows": []}'` fallbacks; just
  catch the SDK's exception types in addition.
- **Cost/latency:** direct Anthropic billing replaces AWS billing; no VPC/region
  constraints. Consider enabling **prompt caching** on the large static prompt
  templates to cut cost (the prompts are long and mostly constant).

### B.7 New dependency

Add `anthropic>=0.40.0` to `requirements.txt`. Keep `boto3` (Bedrock still
supported via the factory).

### B.8 Migration steps (LLM)

1. Create `llm/` with `base.py`, `bedrock.py` (move existing converse logic),
   `anthropic.py`, `factory.py`.
2. Add config vars (§B.4).
3. Swap the 4 call sites to `get_llm_client()` (§B.5).
4. Update mocked unit tests (`test_extract_mocked.py`,
   `test_orchestrator_mocked.py`, `test_vision_*`) to patch `get_llm_client()`
   instead of the boto3 client.
5. Test with `LLM_PROVIDER=bedrock` (regression — must match today) then
   `LLM_PROVIDER=anthropic` on the same fixture PDFs; diff row counts/labels.

**Acceptance:** with `LLM_PROVIDER=bedrock`, output is byte-for-byte equivalent
to today. With `LLM_PROVIDER=anthropic`, the same PDFs extract with comparable
row/note counts.

---

## Part C — Combined sequencing & risks

### Recommended order
1. **LLM abstraction first** (Part B) — it's contained, fully testable via the
   existing pytest suite and CLI (`main.py`), and de-risks the bigger UI work.
2. **Frontend second** (Part A) — build the API on the now provider-agnostic
   pipeline, then the React SPA, keeping Streamlit as a fallback until parity.

### Cross-cutting cleanup (do alongside, see Current_State §7)
- Remove `_i1` / `_main` duplicate experiment files (move to branches).
- Add `venv/`, `*.log`, `output.json`, `payload.json` to `.gitignore`; untrack
  them; delete the stray `bedrock-runtime invoke-model/` directory.

### Risks & mitigations
| Risk | Mitigation |
|------|-----------|
| Anthropic output differs subtly from Bedrock | Keep both behind the factory; A/B on fixtures; prompts unchanged. |
| Long sync pipeline blocks FastAPI event loop | Run in threadpool; stream progress via SSE queue. |
| XLSX inline base64 too large | Switch to temp-file + download endpoint with an id. |
| Test suite mocks boto3 directly | Re-point mocks at `get_llm_client()` (one-time test refactor). |
| Two services to operate | Serve built SPA from FastAPI `StaticFiles` for single-process deploy. |

### Net change to "main code"
- **Orchestrator / pdf / models / export:** **0 changes.**
- **4 LLM call sites:** ~2–4 lines each.
- **config.py:** +a few env vars.
- **Everything else is additive** (`llm/`, `api/`, `frontend/`).
