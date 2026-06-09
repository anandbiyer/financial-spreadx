This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

> This repo also contains [**`Revised SpreadX/`**](./Revised%20SpreadX) — a standalone **Python re-implementation** of the financial-statement extraction & spreading pipeline (the Next.js app here is the original TypeScript version). See the section below.

## Revised SpreadX (Python port)

[`Revised SpreadX/`](./Revised%20SpreadX) is a self-contained Python pipeline that turns a financial-statement PDF into a structured, spread Excel workbook:

**PDF → classify pages → filter → extract line items & notes via Claude (text + vision) → Stage 11: COA mapping & spreading → multi-sheet Excel.**

Stage 11 maps every extracted line to a standardized **184-entry Chart of Accounts** (116 Balance Sheet + 68 P&L), runs balance-sheet identity and subtotal-reconciliation checks, routes low-confidence lines to an unmapped queue, and learns from manual mappings. Persistence is SQLite via SQLAlchemy. Stage 11 is **gated off by default** (`--spread`), so plain extraction behavior is unchanged.

### Folder layout (`Revised SpreadX/`)

| Path | What it is |
|------|------------|
| `main.py` | CLI entry — extract a PDF (add `--spread` to run Stage 11) |
| `app.py` | Streamlit UI |
| `config.py` | Settings: model, cost-estimate pricing, `SPREAD_CONFIDENCE_THRESHOLD` (default `0.55`) |
| `claude/` · `pdf/` · `pipeline/` · `models/` | Extraction pipeline (page classify → filter → extract → notes) |
| `spreading/` · `db/` · `export/` · `llm/` | Stage 11 spreading, SQLite persistence, LLM provider abstraction + token/cost meter, Excel export |
| `build_*.py` · `republish_at_threshold.py` | Offline analysis / republish tools (run from this folder) |
| `tests/` | Unit tests |
| `docs/` | Design notes, plans, prompt specs — **start with [`docs/Claude_Latest.md`](./Revised%20SpreadX/docs/Claude_Latest.md)** |
| `BS_PL_Line_Items_V1.xlsx` | Chart-of-Accounts seed source (read by `db/seed_coa.py`) |

### Running it

```bash
cd "Revised SpreadX"
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt        # Windows (use .venv/bin/pip on macOS/Linux)

# Provide a Claude key: put ANTHROPIC_API_KEY in a .env at this folder, or export it.
.venv\Scripts\python -m db.seed_coa                  # seed the 184-entry CoA (idempotent)
.venv\Scripts\python main.py "path/to/report.pdf" --spread   # -> <stem>_extracted.xlsx + <stem>_spread.xlsx
.venv\Scripts\python -m pytest tests/unit -q          # run the unit tests
```

Each spread line is traceable back to its source extraction rows (an **Extraction ID** column links the extraction and spread workbooks), and every run reports estimated **LLM token usage & cost**. The full work log and design history live in `docs/Claude_Latest.md`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
