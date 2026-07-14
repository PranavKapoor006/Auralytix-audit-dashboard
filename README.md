# EY Auralytix - Audit Analytics Dashboard

EY Auralytix is an AI-powered audit analytics dashboard built for audit document review, KPI extraction, evidence-grounded chat, detailed findings review, and voice-enabled agent interaction.

This repository version is the EY-branded submission build. It keeps the core Auralytix workflow while aligning the UI with an EY-style black, gray, white, and yellow visual system.

## Core Workflow

1. **Agents** - Select an audit agent persona: Professional, Friendly, Creative, or Analytical.
2. **Upload** - Upload one ZIP package containing audit documents.
3. **Dashboard** - Review KPI cards, source evidence, risk composition, recommendations, and clickable visual insights.
4. **Details** - Review concise findings summary, source excerpts, and owner focus.
5. **Full Findings** - Open the complete findings register or download it as Excel.
6. **Chat** - Ask the selected EY agent contextual questions about KPI cards, findings, source files, recommendations, or excerpts.

## Main Features

- EY-branded dashboard theme using black, gray, white, and yellow highlights.
- Agent selection with four distinct audit personas.
- ZIP upload with supported file detection.
- Backend extraction for PDF, DOCX, XLSX, CSV, TXT, and image/OCR paths.
- Dashboard KPI cards for audit findings, risk levels, compliance, pending actions, financial flags, and vendor risk.
- Clickable dashboard visual insights.
- Evidence-grounded chat connected to selected dashboard context.
- Dynamic smart follow-up questions after KPI answers.
- Details page with concise summary instead of an oversized findings table.
- Full Findings page for row-level review.
- Excel export for findings register.
- Browser-based voice read-aloud, mute, stop, and voice input support.
- Optional Google Cloud Text-to-Speech backend endpoint if credentials are available.

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Lucide React icons
- React Markdown
- remark-gfm
- JSZip
- XLSX
- Mammoth
- PDF.js

### Backend

- FastAPI
- Uvicorn
- Google Gemini API through `google-genai`
- Optional Ollama fallback
- Optional Google Cloud Text-to-Speech
- PyMuPDF
- pdfplumber
- python-docx
- openpyxl
- pytesseract
- Pillow

## Folder Structure

```text
EY_Audit_Analytics_Dashboard/
  backend/
    main.py
    extraction.py
    run_extraction.py
    requirements.txt
    .env.example
  frontend/
    src/
      App.tsx
      App.css
      assets/
        agents/
    package.json
  README.md
  .gitignore
```

## Backend Setup

Open PowerShell from the backend folder:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
```

Update `.env` with your own API keys or local model settings.

Run the backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

Health check:

```text
http://localhost:8000/api/health
```

## Frontend Setup

Open a separate PowerShell terminal from the frontend folder:

```powershell
cd frontend
npm install
npm run dev
```

Default local frontend:

```text
http://localhost:5173
```

## Environment Variables

Use `backend/.env.example` as the template.

Important variables:

```text
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_key_here
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MAX_OUTPUT_TOKENS=2400
ENABLE_OLLAMA_FALLBACK=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:1.5b
FRONTEND_ORIGIN=http://localhost:5173
GOOGLE_TTS_ENABLED=true
GOOGLE_TTS_LANGUAGE_CODE=en-US
GOOGLE_TTS_AUDIO_ENCODING=MP3
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
```

Google Cloud Text-to-Speech is optional. If official Google Cloud credentials are not available, the frontend browser-based Google voice path remains the active demo route.

## Supported Upload Format

Upload one ZIP file containing any mix of:

```text
PDF
DOCX
XLSX
CSV
TXT
PNG
JPG
JPEG
```

The app detects supported and unsupported files before processing. Backend extraction is preferred. If the backend extraction service is unavailable, the frontend can fall back to browser-side parsing for demo continuity.

## Review Demo Path

Use this path during technical review:

```text
1. Open the app.
2. Select Professional Agent.
3. Upload audit ZIP.
4. Click Submit & Process.
5. Review Dashboard KPIs.
6. Click a KPI card and ask the EY Agent.
7. Use a smart follow-up question.
8. Review Dashboard Visual Insights.
9. Open Details.
10. Open Full Findings.
11. Download Excel.
12. Test voice read-aloud and mute/stop.
```

## Current Limitations

- Official Google Cloud Text-to-Speech requires valid Google Cloud project access and service-account credentials.
- Browser voice availability depends on Chrome/Edge and the voices exposed by the local machine.
- OCR works for image/scanned content but scanned table reconstruction is still prototype-level.
- KPI extraction is evidence-grounded and deterministic for key cards, but final audit validation should still be performed against real client documents.
- The project is currently optimized for local review and demo usage, not production deployment.

## Repo Upload Checklist

Before pushing to GitHub or sharing the repository:

```text
1. Remove backend/.env.
2. Confirm no API keys are committed.
3. Remove validation_outputs/ and extracted_output files.
4. Remove uploaded ZIPs or client-sensitive documents.
5. Keep only safe mock/sample files if needed.
6. Confirm .gitignore is present.
7. Confirm README.md is updated.
8. Run frontend and backend once before final commit.
```

## Suggested Git Commands

```powershell
git init
git add .
git status
git commit -m "Initial EY Auralytix submission build"
```

Do not commit `.env`, credentials, local virtual environments, node modules, generated outputs, or private audit documents.


## Repository Contents

This cleaned repository includes the application source code, setup files, testing scripts, one sample audit ZIP package, and representative validation outputs. It intentionally excludes local environments, installed dependencies, secrets, duplicate extracted folders, and unrelated local PDFs.

## Safety Note

Do not commit a real `.env` file, Google service-account JSON, API keys, virtual environments, `node_modules`, or confidential client audit documents.
