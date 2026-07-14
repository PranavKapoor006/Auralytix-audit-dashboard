import asyncio
import base64
import os
import re
import shutil
import tempfile
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:  # Keeps Ollama mode working even before google-genai is installed.
    genai = None
    genai_types = None

try:
    from google.cloud import texttospeech
except ImportError:  # Keeps the backend working if Google Cloud TTS is not installed yet.
    texttospeech = None

try:
    from extraction import (
        build_readable_report,
        extract_zip_package,
        save_extraction_outputs,
    )
except ImportError:  # Keeps chat backend importable if extraction dependencies are not installed yet.
    build_readable_report = None
    extract_zip_package = None
    save_extraction_outputs = None


load_dotenv()

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama").strip().lower()
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite").strip()
GEMINI_MAX_OUTPUT_TOKENS = int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "2400"))
GEMINI_MODEL_OPTIONS = [
    {
        "id": "gemini-2.5-flash-lite",
        "label": "Gemini 2.5 Flash-Lite",
        "description": "Fastest and lowest-cost option for regular KPI chat and quick audit summaries.",
    },
    {
        "id": "gemini-2.5-flash",
        "label": "Gemini 2.5 Flash",
        "description": "Balanced option for stronger reasoning while keeping latency reasonable.",
    },
    {
        "id": "gemini-2.5-pro",
        "label": "Gemini 2.5 Pro",
        "description": "Deep reasoning option for complex audit questions, if enabled for your API key.",
    },
    {
        "id": "gemini-2.0-flash",
        "label": "Gemini 2.0 Flash",
        "description": "Earlier Flash model; useful as a compatibility option if available.",
    },
    {
        "id": "gemini-2.0-flash-lite",
        "label": "Gemini 2.0 Flash-Lite",
        "description": "Earlier lightweight model; useful for lower-latency testing if available.",
    },
    {
        "id": "gemini-1.5-flash",
        "label": "Gemini 1.5 Flash",
        "description": "Legacy fallback model; availability depends on your account and region.",
    },
    {
        "id": "gemini-1.5-pro",
        "label": "Gemini 1.5 Pro",
        "description": "Legacy Pro option; availability depends on your account and region.",
    },
]
EXTRA_GEMINI_MODELS = [
    model.strip()
    for model in os.getenv("GEMINI_EXTRA_MODELS", "").split(",")
    if model.strip()
]
ENABLE_OLLAMA_FALLBACK = os.getenv("ENABLE_OLLAMA_FALLBACK", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "y",
}

GOOGLE_TTS_ENABLED = os.getenv("GOOGLE_TTS_ENABLED", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "y",
}
GOOGLE_TTS_LANGUAGE_CODE = os.getenv("GOOGLE_TTS_LANGUAGE_CODE", "en-US").strip()
GOOGLE_TTS_AUDIO_ENCODING = os.getenv("GOOGLE_TTS_AUDIO_ENCODING", "MP3").strip().upper()


app = FastAPI(
    title="AI Audit Agent Backend",
    description="Backend bridge between React audit dashboard and an LLM provider.",
    version="1.2.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_ORIGIN,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConversationMessage(BaseModel):
    sender: str
    text: str


class FocusedEvidence(BaseModel):
    sourceName: str
    evidenceType: str
    snippet: str
    risk: Optional[str] = None
    owner: Optional[str] = None


class AgentChatRequest(BaseModel):
    agentId: str = Field(default="professional")
    question: str
    contextType: str = Field(default="general")
    topic: str = Field(default="General Audit Review")
    kpiTitle: Optional[str] = None
    finding: Optional[Dict[str, Any]] = None
    recommendation: Optional[str] = None
    sourceFile: Optional[Dict[str, Any]] = None
    excerpt: Optional[str] = None
    analysis: Dict[str, Any] = Field(default_factory=dict)
    focusedEvidence: List[FocusedEvidence] = Field(default_factory=list)
    conversationHistory: List[ConversationMessage] = Field(default_factory=list)
    llmModel: Optional[str] = None


class AgentChatResponse(BaseModel):
    answer: str
    provider: str
    model: str


class FollowUpSuggestion(BaseModel):
    label: str
    question: str


class FollowUpSuggestionRequest(BaseModel):
    agentId: str = Field(default="professional")
    question: str
    latestAnswer: str = Field(default="")
    contextType: str = Field(default="kpi")
    topic: str = Field(default="Selected KPI")
    kpiTitle: Optional[str] = None
    analysis: Dict[str, Any] = Field(default_factory=dict)
    conversationHistory: List[ConversationMessage] = Field(default_factory=list)
    fallbackSuggestions: List[FollowUpSuggestion] = Field(default_factory=list)
    llmModel: Optional[str] = None


class FollowUpSuggestionResponse(BaseModel):
    suggestions: List[FollowUpSuggestion]
    provider: str
    model: str


class TextToSpeechRequest(BaseModel):
    text: str
    agentId: str = Field(default="professional")
    rate: float = Field(default=0.95, ge=0.5, le=1.5)


class TextToSpeechResponse(BaseModel):
    audioBase64: str
    mimeType: str
    voiceName: str
    provider: str


class ExtractedTablePayload(BaseModel):
    source_file: str
    source_type: str
    page_or_sheet: str
    table_index: int
    rows: List[List[str]]


class ExtractedDocumentPayload(BaseModel):
    source_file: str
    source_type: str
    text: str
    tables: List[ExtractedTablePayload] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class ExtractZipSummary(BaseModel):
    totalDocuments: int
    totalTables: int
    totalWarnings: int
    documentsWithText: int
    ocrWarnings: int


class ExtractZipResponse(BaseModel):
    fileName: str
    documents: List[ExtractedDocumentPayload]
    summary: ExtractZipSummary
    readableReport: str


@app.post("/api/extract-zip", response_model=ExtractZipResponse)
async def extract_zip(uploaded_file: UploadFile = File(...)) -> ExtractZipResponse:
    """
    Receives an uploaded audit ZIP and routes it through backend/extraction.py.

    This is the integration point that connects the validated extraction module
    to the live React app. The frontend should call this endpoint before building
    dashboard KPIs or sending evidence to the chatbot.
    """
    if extract_zip_package is None or save_extraction_outputs is None or build_readable_report is None:
        raise HTTPException(
            status_code=500,
            detail=(
                "Extraction module could not be imported. Install extraction dependencies "
                "with: python -m pip install -r requirements.txt"
            ),
        )

    if not uploaded_file.filename or not uploaded_file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Please upload a valid .zip audit package.")

    temp_root = Path(tempfile.mkdtemp(prefix=f"audit_extract_{uuid.uuid4().hex[:8]}_"))
    zip_path = temp_root / "uploaded_audit_package.zip"
    unzip_folder = temp_root / "unzipped_files"
    output_folder = temp_root / "outputs"

    try:
        with zip_path.open("wb") as destination:
            while True:
                chunk = await uploaded_file.read(1024 * 1024)

                if not chunk:
                    break

                destination.write(chunk)

        extracted_documents = await asyncio.to_thread(
            extract_zip_package,
            zip_path,
            unzip_folder,
        )

        await asyncio.to_thread(
            save_extraction_outputs,
            extracted_documents,
            output_folder,
        )

        readable_report = await asyncio.to_thread(
            build_readable_report,
            extracted_documents,
        )

        document_payloads = [
            ExtractedDocumentPayload(**asdict(document))
            for document in extracted_documents
        ]

        total_tables = sum(len(document.tables) for document in extracted_documents)
        total_warnings = sum(len(document.warnings) for document in extracted_documents)
        documents_with_text = sum(1 for document in extracted_documents if document.text.strip())
        ocr_warnings = sum(
            1
            for document in extracted_documents
            for warning in document.warnings
            if "ocr" in warning.lower()
        )

        return ExtractZipResponse(
            fileName=uploaded_file.filename,
            documents=document_payloads,
            summary=ExtractZipSummary(
                totalDocuments=len(extracted_documents),
                totalTables=total_tables,
                totalWarnings=total_warnings,
                documentsWithText=documents_with_text,
                ocrWarnings=ocr_warnings,
            ),
            readableReport=readable_report[:120000],
        )

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Backend extraction failed: {str(error)}",
        )

    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


@app.get("/api/health")
async def health_check() -> Dict[str, Any]:
    active_model = DEFAULT_GEMINI_MODEL if LLM_PROVIDER in {"gemini", "google", "google_gemini"} else OLLAMA_MODEL

    return {
        "status": "ok",
        "provider": LLM_PROVIDER,
        "activeModel": active_model,
        "geminiDefaultModel": DEFAULT_GEMINI_MODEL,
        "geminiConfigured": bool(GEMINI_API_KEY or os.getenv("GOOGLE_API_KEY")),
        "geminiMaxOutputTokens": GEMINI_MAX_OUTPUT_TOKENS,
        "availableGeminiModels": get_available_gemini_model_options(),
        "ollamaBaseUrl": OLLAMA_BASE_URL,
        "ollamaModel": OLLAMA_MODEL,
        "ollamaFallbackEnabled": ENABLE_OLLAMA_FALLBACK,
        "googleTtsEnabled": GOOGLE_TTS_ENABLED,
        "googleTtsPackageInstalled": texttospeech is not None,
        "googleTtsLanguageCode": GOOGLE_TTS_LANGUAGE_CODE,
    }


@app.get("/api/llm-models")
async def get_llm_models() -> Dict[str, Any]:
    return {
        "defaultModel": DEFAULT_GEMINI_MODEL,
        "models": get_available_gemini_model_options(),
        "fallback": {
            "enabled": ENABLE_OLLAMA_FALLBACK,
            "provider": "ollama",
            "model": OLLAMA_MODEL,
        },
    }


def get_available_gemini_model_options() -> List[Dict[str, str]]:
    options = [dict(option) for option in GEMINI_MODEL_OPTIONS]
    existing_ids = {option["id"] for option in options}

    for model_id in EXTRA_GEMINI_MODELS:
        if model_id not in existing_ids:
            options.append(
                {
                    "id": model_id,
                    "label": model_id,
                    "description": "Custom Gemini model from GEMINI_EXTRA_MODELS.",
                }
            )
            existing_ids.add(model_id)

    if DEFAULT_GEMINI_MODEL not in existing_ids:
        options.insert(
            0,
            {
                "id": DEFAULT_GEMINI_MODEL,
                "label": DEFAULT_GEMINI_MODEL,
                "description": "Default Gemini model from the backend .env file.",
            },
        )

    return options


def resolve_gemini_model(requested_model: Optional[str]) -> str:
    model_name = (requested_model or DEFAULT_GEMINI_MODEL).strip()

    if not model_name:
        return DEFAULT_GEMINI_MODEL

    allowed_ids = {option["id"] for option in get_available_gemini_model_options()}

    if model_name not in allowed_ids:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported Gemini model requested: {model_name}. "
                "Add it to GEMINI_EXTRA_MODELS in .env if you want to enable it."
            ),
        )

    return model_name


GOOGLE_TTS_AGENT_VOICES: Dict[str, Dict[str, Any]] = {
    "professional": {
        "voice": "en-US-Neural2-D",
        "gender": "MALE",
        "speaking_rate": 0.92,
        "pitch": -2.0,
    },
    "friendly": {
        "voice": "en-US-Neural2-F",
        "gender": "FEMALE",
        "speaking_rate": 1.02,
        "pitch": 2.0,
    },
    "creative": {
        "voice": "en-US-Neural2-H",
        "gender": "FEMALE",
        "speaking_rate": 1.10,
        "pitch": 4.0,
    },
    "analytical": {
        "voice": "en-US-Neural2-I",
        "gender": "MALE",
        "speaking_rate": 0.82,
        "pitch": -4.0,
    },
}


def get_google_tts_audio_encoding() -> Tuple[Any, str]:
    if texttospeech is None:
        raise HTTPException(
            status_code=503,
            detail="Google Cloud Text-to-Speech package is not installed. Install google-cloud-texttospeech or use browser TTS fallback.",
        )

    if GOOGLE_TTS_AUDIO_ENCODING == "LINEAR16":
        return texttospeech.AudioEncoding.LINEAR16, "audio/wav"

    if GOOGLE_TTS_AUDIO_ENCODING == "OGG_OPUS":
        return texttospeech.AudioEncoding.OGG_OPUS, "audio/ogg"

    return texttospeech.AudioEncoding.MP3, "audio/mpeg"


def build_google_tts_voice_params(agent_id: str) -> Dict[str, Any]:
    profile = GOOGLE_TTS_AGENT_VOICES.get(agent_id, GOOGLE_TTS_AGENT_VOICES["professional"])

    if texttospeech is None:
        raise HTTPException(
            status_code=503,
            detail="Google Cloud Text-to-Speech package is not installed.",
        )

    gender_name = str(profile.get("gender", "NEUTRAL")).upper()
    gender = getattr(
        texttospeech.SsmlVoiceGender,
        gender_name,
        texttospeech.SsmlVoiceGender.NEUTRAL,
    )

    return {
        "language_code": GOOGLE_TTS_LANGUAGE_CODE,
        "name": str(profile["voice"]),
        "ssml_gender": gender,
    }


@app.post("/api/text-to-speech", response_model=TextToSpeechResponse)
async def text_to_speech(payload: TextToSpeechRequest) -> TextToSpeechResponse:
    if not GOOGLE_TTS_ENABLED:
        raise HTTPException(status_code=503, detail="Google TTS is disabled by GOOGLE_TTS_ENABLED=false.")

    if texttospeech is None:
        raise HTTPException(
            status_code=503,
            detail="Google Cloud Text-to-Speech package is not installed. Install google-cloud-texttospeech.",
        )

    text = trim_text(payload.text.strip(), 4500)

    if not text:
        raise HTTPException(status_code=400, detail="No text was provided for speech synthesis.")

    profile = GOOGLE_TTS_AGENT_VOICES.get(payload.agentId, GOOGLE_TTS_AGENT_VOICES["professional"])
    audio_encoding, mime_type = get_google_tts_audio_encoding()

    try:
        client = texttospeech.TextToSpeechClient()
        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice_params = texttospeech.VoiceSelectionParams(**build_google_tts_voice_params(payload.agentId))
        audio_config = texttospeech.AudioConfig(
            audio_encoding=audio_encoding,
            speaking_rate=max(0.5, min(1.5, float(payload.rate) * float(profile["speaking_rate"]))),
            pitch=float(profile["pitch"]),
        )

        response = client.synthesize_speech(
            input=synthesis_input,
            voice=voice_params,
            audio_config=audio_config,
        )

        return TextToSpeechResponse(
            audioBase64=base64.b64encode(response.audio_content).decode("ascii"),
            mimeType=mime_type,
            voiceName=str(profile["voice"]),
            provider="google_cloud_text_to_speech",
        )

    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail=(
                "Google Text-to-Speech failed. Confirm GOOGLE_APPLICATION_CREDENTIALS "
                f"and Cloud Text-to-Speech access. Error: {str(error)}"
            ),
        )


@app.post("/api/follow-up-suggestions", response_model=FollowUpSuggestionResponse)
async def follow_up_suggestions(payload: FollowUpSuggestionRequest) -> FollowUpSuggestionResponse:
    """Return answer-aware follow-up chips for the active KPI chat.

    The frontend used to rely on three fixed KPI buttons. This endpoint reads the
    latest answer, active KPI title, dashboard value, and source-population words
    to produce contextual follow-ups without waiting for another LLM call.
    """
    if payload.contextType != "kpi" or not (payload.kpiTitle or payload.topic):
        return FollowUpSuggestionResponse(
            suggestions=[],
            provider="answer_aware_local",
            model="not-a-kpi",
        )

    suggestions = build_answer_aware_followup_suggestions(
        kpi_title=payload.kpiTitle or payload.topic,
        latest_answer=payload.latestAnswer,
        analysis=payload.analysis,
        current_question=payload.question,
        conversation_history=payload.conversationHistory,
    )

    if not suggestions and payload.fallbackSuggestions:
        suggestions = [
            {"label": item.label, "question": item.question}
            for item in payload.fallbackSuggestions[:3]
        ]

    return FollowUpSuggestionResponse(
        suggestions=[FollowUpSuggestion(**item) for item in suggestions[:3]],
        provider="answer_aware_local",
        model="latest-answer-parser",
    )


def build_answer_aware_followup_suggestions(
    kpi_title: str,
    latest_answer: str,
    analysis: Dict[str, Any],
    current_question: str = "",
    conversation_history: Optional[List[ConversationMessage]] = None,
) -> List[Dict[str, str]]:
    """Create follow-up chips that change after every user follow-up.

    The first implementation produced answer-aware chips, but if the latest answer
    still mentioned the same concepts, the same three labels could repeat. This
    version builds a larger candidate pool, detects what the user just asked,
    removes already-asked questions, and rotates the remaining candidates by chat
    turn. That makes each new answer advance the conversation instead of showing
    the same buttons again.
    """
    title = (kpi_title or "Selected KPI").strip()
    title_lower = title.lower()
    answer = latest_answer or ""
    answer_lower = answer.lower()
    question_lower = (current_question or "").lower()
    history = conversation_history or []
    dashboard_value = get_dashboard_value_from_analysis(title, analysis if isinstance(analysis, dict) else {})
    candidates: List[Dict[str, str]] = []

    def normalize_text(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()

    asked_questions = {
        normalize_text(message.text)
        for message in history
        if getattr(message, "sender", "") == "user"
    }
    asked_questions.add(normalize_text(current_question))

    def add(label: str, question: str) -> None:
        clean_label = re.sub(r"[?.:]+$", "", label.strip())[:18].strip()
        clean_question = " ".join(question.strip().split())

        if not clean_label or len(clean_question) < 12:
            return

        normalized_question = normalize_text(clean_question)
        if normalized_question in asked_questions:
            return

        for existing in candidates:
            if existing["label"].lower() == clean_label.lower() or normalize_text(existing["question"]) == normalized_question:
                return

        candidates.append({"label": clean_label, "question": clean_question})

    status_match = re.search(
        r"Open\s+(\d+).*?In\s+Progress\s+(\d+).*?Overdue\s+(\d+).*?Closed\s+(\d+)",
        answer,
        flags=re.IGNORECASE | re.DOTALL,
    )

    # Stage-specific follow-ups based on the question the user just asked.
    if any(token in question_lower for token in ["mismatch", "conflict", "different values", "reconcile", "other files"]):
        add("Fix label", f"What exact wording should the {title} card use so the dashboard label matches the uploaded source population?")
        add("Recalc rule", f"What calculation rule should the dashboard use to recompute {title} from the uploaded files?")
        add("Source priority", f"Which uploaded source should override the others if the {title} evidence conflicts, and why?")

    if any(token in question_lower for token in ["best source", "source file", "evidence", "cite", "excerpt", "table"]):
        add("Exact citation", f"Give me the exact file/table/excerpt I should cite for {title}, and explain why it is stronger than the other evidence.")
        add("Weak evidence", f"Which evidence for {title} is weaker or only contextual, and should not be used as proof?")
        add("Missing proof", f"What missing source evidence would improve confidence in the {title} answer?")

    if any(token in question_lower for token in ["finding ids", "ia finding", "distinct", "ids"]):
        add("Excluded signals", f"Which risk signals should be excluded from the formal {title} count even if they look related?")
        add("Sample IDs", f"Show a few sample IA finding IDs supporting {title} and explain how they prove the count.")
        add("Severity check", f"How do the uploaded files prove the severity split behind {title}?")

    if any(token in question_lower for token in ["status", "open", "in progress", "overdue", "closed"]):
        add("Closed excluded", "Why are Closed actions excluded from Pending Actions, and what would change if only Open actions were counted?")
        add("Owner queue", "Which owners or departments should be reviewed first within the pending action population?")
        add("Due-date check", "What due-date or aging evidence should be checked for the pending and overdue actions?")

    if any(token in question_lower for token in ["next", "audit action", "prioritize", "owner", "do next"]):
        add("First test", f"What is the first audit test I should perform to validate the {title} value?")
        add("Owner evidence", f"Which owner needs to provide evidence next for {title}, and what should they provide?")
        add("Review risk", f"What is the risk if the {title} issue is not resolved before the next review?")

    if any(token in question_lower for token in ["closure", "proof", "marked closed", "close"]):
        add("Evidence checklist", "Create a short closure-evidence checklist for the pending actions before they can be marked closed.")
        add("Retest step", "What retesting step should Internal Audit perform after closure evidence is submitted?")
        add("Bad closure", "What would make a closure claim insufficient or unreliable for this KPI?")

    if any(token in question_lower for token in ["workbook", "pdf", "financial", "flag"]):
        add("Full population", "If Financial Flags should cover the full uploaded package, what additional PDF/workbook rows must be included?")
        add("Subset label", "If the dashboard keeps the workbook subset, how should the Financial Flags card be relabeled?")
        add("Finance testing", "What audit test should be performed on the financial-statement flag population next?")

    # Answer-aware base candidates. These are still dynamic because they come after
    # the stage-specific candidates and are rotated by turn.
    if status_match:
        add(
            "Status math",
            f"Show the Pending Actions status calculation again using Open {status_match.group(1)}, In Progress {status_match.group(2)}, Overdue {status_match.group(3)}, and Closed {status_match.group(4)}. Explain which statuses are included and excluded.",
        )
        add("Overdue first", "From the Pending Actions evidence, which overdue actions should be triaged first and what closure proof is required?")

    if any(word in answer_lower for word in ["conflict", "mismatch", "not supported", "different population", "scope mismatch"]):
        add("Resolve mismatch", f"What exact source-population mismatch is affecting the {title} card, and how should the dashboard label or calculation be corrected?")
        add("Confidence level", f"How confident should we be in the current {title} value after reconciling the conflicting populations?")

    if any(word in answer_lower for word in ["source", "evidence", "uploaded", "tracker", "workbook", "pdf"]):
        add("Best source", f"Which uploaded source file is the strongest evidence for the {title} value, and what exact excerpt or table should I cite?")
        add("Cross-check", f"Which second source should be used to cross-check the {title} conclusion?")

    if "pending" in title_lower or "action" in title_lower:
        add("Closure proof", "What closure evidence is required before these pending actions can be marked closed?")
        add("Aging review", "How should I review aging or due dates for the pending action population?")
        add("Tracker fields", "Which tracker fields should be mandatory for each pending action?")
    elif "financial" in title_lower or "flag" in title_lower:
        add("Workbook vs PDF", "Reconcile the Financial Flags workbook/dashboard subset against the broader PDF financial-statement population and tell me which value the dashboard should show.")
        add("Flag scope", "What source population is Financial Flags using, and is it counting financial-statement rows, audit findings, or exception signals?")
        add("Finance owner", "Which finance owner or process area should be reviewed first based on the Financial Flags evidence?")
    elif "compliance" in title_lower:
        add("Score formula", "What evidence explains the Compliance Score calculation, and does it come from control testing, checklist rows, or formal findings?")
        add("Raw pass rate", "Does the raw checklist pass rate reconcile to the Compliance Score, or are they separate populations?")
        add("Control failures", "Which failed or partial controls should be reviewed first for the Compliance Score?")
    elif "vendor" in title_lower:
        add("Vendor evidence", "Which vendor or procurement records support the Vendor Risk rating, and is the rating based on findings or signal patterns?")
        add("Vendor sample", "Which vendor samples or approval gaps should be checked first?")
        add("Procurement owner", "What should Procurement do next to validate and reduce the Vendor Risk rating?")
    elif any(token in title_lower for token in ["high", "medium", "low", "total"]):
        add("Finding IDs", f"Which distinct IA finding IDs support the {title} value of {dashboard_value}?")
        add("Excluded rows", f"Which rows or signals should not be included in the {title} formal finding count?")
        add("Severity evidence", f"What uploaded evidence proves the severity rating behind the {title} count?")

    add("Why this value", f"Why is the {title} card showing {dashboard_value}, and what uploaded evidence supports that value?")
    add("Next audit step", f"Based on the best-supported {title} value, what is the next audit action and who should own it?")
    add("Missing evidence", f"What evidence is still missing or weak for the {title} card?")
    add("Demo wording", f"How should I explain the {title} answer in one clear meeting sentence?")

    if not candidates:
        return []

    # Rotate by user-turn count so even similar answers do not keep surfacing the
    # same first three chips after every follow-up.
    user_turns = sum(1 for message in history if getattr(message, "sender", "") == "user")
    start_index = user_turns % len(candidates)
    ordered_candidates = candidates[start_index:] + candidates[:start_index]

    return ordered_candidates[:3]


@app.post("/api/agent-chat", response_model=AgentChatResponse)
async def agent_chat(payload: AgentChatRequest) -> AgentChatResponse:
    # Meeting-safe deterministic path for population-sensitive KPI cards.
    # These answers should not depend on Gemini latency or partial generation.
    if payload.contextType == "kpi":
        kpi_title_lower = (payload.kpiTitle or payload.topic or "").lower()

        if is_formal_risk_kpi_title(kpi_title_lower):
            counts = extract_formal_finding_counts_from_payload(payload)
            if counts.get("total", 0) > 0:
                return AgentChatResponse(
                    answer=build_deterministic_kpi_card_answer(payload),
                    provider="deterministic_uploaded_evidence",
                    model="formal-finding-population-counter",
                )

        if "pending" in kpi_title_lower or "action" in kpi_title_lower:
            counts = extract_remediation_status_counts_from_payload(payload)
            if counts.get("total", 0) > 0:
                return AgentChatResponse(
                    answer=build_deterministic_kpi_card_answer(payload),
                    provider="deterministic_uploaded_evidence",
                    model="remediation-status-counter",
                )

        if "financial" in kpi_title_lower or "flag" in kpi_title_lower:
            counts = extract_financial_flag_counts_from_payload(payload)
            if counts.get("dashboard_workbook_rows", 0) > 0 or counts.get("pdf_audit_note_rows", 0) > 0:
                return AgentChatResponse(
                    answer=build_deterministic_kpi_card_answer(payload),
                    provider="deterministic_uploaded_evidence",
                    model="financial-population-reconciler",
                )

    system_prompt = build_system_prompt(payload.agentId)
    user_prompt = build_user_prompt(payload)
    selected_gemini_model = resolve_gemini_model(payload.llmModel)

    if LLM_PROVIDER in {"gemini", "google", "google_gemini"}:
        return await run_with_gemini_first(system_prompt, user_prompt, selected_gemini_model, payload)

    if LLM_PROVIDER == "ollama":
        return await run_with_ollama_only(system_prompt, user_prompt, payload)

    raise HTTPException(
        status_code=400,
        detail=(
            f"Unsupported LLM_PROVIDER: {LLM_PROVIDER}. "
            "Use 'gemini' or 'ollama'."
        ),
    )


async def run_with_gemini_first(system_prompt: str, user_prompt: str, model_name: str, payload: AgentChatRequest) -> AgentChatResponse:
    try:
        answer = await call_gemini(system_prompt, user_prompt, model_name)
        answer = complete_or_replace_kpi_answer(answer, payload)

        return AgentChatResponse(
            answer=answer,
            provider="gemini",
            model=model_name,
        )

    except Exception as gemini_error:
        if not ENABLE_OLLAMA_FALLBACK:
            raise HTTPException(
                status_code=502,
                detail=f"Gemini request failed: {str(gemini_error)}",
            )

        try:
            answer = await call_ollama(system_prompt, user_prompt)
            answer = complete_or_replace_kpi_answer(answer, payload)

            return AgentChatResponse(
                answer=answer,
                provider="ollama_fallback_after_gemini_error",
                model=OLLAMA_MODEL,
            )

        except Exception as ollama_error:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Gemini failed and Ollama fallback also failed. "
                    f"Gemini error: {str(gemini_error)} | "
                    f"Ollama error: {str(ollama_error)}"
                ),
            )


async def run_with_ollama_only(system_prompt: str, user_prompt: str, payload: AgentChatRequest) -> AgentChatResponse:
    try:
        answer = await call_ollama(system_prompt, user_prompt)
        answer = complete_or_replace_kpi_answer(answer, payload)

        return AgentChatResponse(
            answer=answer,
            provider="ollama",
            model=OLLAMA_MODEL,
        )

    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Could not connect to Ollama. Make sure Ollama is installed and running.",
        )

    except httpx.HTTPStatusError as error:
        raise HTTPException(
            status_code=error.response.status_code,
            detail=f"Ollama returned an error: {error.response.text}",
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Agent backend error: {str(error)}",
        )


async def call_gemini(system_prompt: str, user_prompt: str, model_name: str) -> str:
    if genai is None or genai_types is None:
        raise RuntimeError(
            "google-genai is not installed. Run: .\\.venv\\Scripts\\python.exe -m pip install google-genai"
        )

    if not GEMINI_API_KEY and not os.getenv("GOOGLE_API_KEY"):
        raise RuntimeError("GEMINI_API_KEY is missing from the backend .env file.")

    def generate_response() -> str:
        client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else genai.Client()

        response = client.models.generate_content(
            model=model_name,
            contents=user_prompt,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.0,
                max_output_tokens=GEMINI_MAX_OUTPUT_TOKENS,
            ),
        )

        return (response.text or "").strip()

    content = await asyncio.to_thread(generate_response)

    if not content:
        return "Gemini returned an empty response. Try asking again."

    return content


async def call_ollama(system_prompt: str, user_prompt: str) -> str:
    request_body = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ],
        "options": {
            "temperature": 0.0,
            "num_ctx": 8192,
            "num_predict": 900,
        },
        "keep_alive": "10m",
    }

    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=request_body,
        )

        response.raise_for_status()
        data = response.json()

    content = data.get("message", {}).get("content", "")

    if not content.strip():
        return "The local model returned an empty response. Try asking again."

    return content.strip()



def complete_or_replace_kpi_answer(answer: str, payload: AgentChatRequest) -> str:
    """Ensure KPI/card answers are complete and use the correct population.

    A complete answer is not enough if it analyzes the wrong source population. For
    population-sensitive cards like Pending Actions, this guard checks the uploaded
    source evidence directly and replaces incomplete or wrong-population responses
    with a deterministic card answer.
    """
    if payload.contextType != "kpi":
        return answer

    kpi_title = (payload.kpiTitle or payload.topic or "").lower()

    if is_formal_risk_kpi_title(kpi_title):
        counts = extract_formal_finding_counts_from_payload(payload)
        if counts.get("total", 0) > 0:
            return build_deterministic_kpi_card_answer(payload, answer)

    if "pending" in kpi_title or "action" in kpi_title:
        counts = extract_remediation_status_counts_from_payload(payload)
        # Meeting-safe behavior: Pending Actions is a deterministic status-count KPI.
        # Always answer it from uploaded remediation tracker evidence when available,
        # instead of trusting a model-generated or partially generated answer.
        if counts.get("total", 0) > 0:
            return build_deterministic_kpi_card_answer(payload, answer)

    if "financial" in kpi_title or "flag" in kpi_title:
        counts = extract_financial_flag_counts_from_payload(payload)
        if counts.get("dashboard_workbook_rows", 0) > 0 or counts.get("pdf_audit_note_rows", 0) > 0:
            return build_deterministic_kpi_card_answer(payload, answer)

    if is_complete_kpi_answer(answer):
        return answer

    return build_deterministic_kpi_card_answer(payload, answer)


def is_complete_kpi_answer(answer: str) -> bool:
    lowered = (answer or "").lower()

    required_markers = [
        "what population",
        "reconciling",
        "which value",
        "evidence",
        "next action",
    ]

    has_all_markers = all(marker in lowered for marker in required_markers)
    long_enough = len(answer.strip()) >= 900
    ends_cleanly = answer.strip().endswith((".", "!", ")"))

    return has_all_markers and long_enough and ends_cleanly


def is_acceptable_pending_actions_answer(answer: str, counts: Dict[str, int]) -> bool:
    lowered = (answer or "").lower()
    pending = str(counts.get("pending", ""))
    total = str(counts.get("total", ""))

    if not answer or len(answer.strip()) < 900:
        return False

    if pending not in answer:
        return False

    if "remediation" not in lowered or "tracker" not in lowered:
        return False

    if not all(term in lowered for term in ["open", "in progress", "overdue", "closed"]):
        return False

    wrong_population_phrases = [
        "detailed findings evidence index is the population",
        "detailed findings evidence index file as the population",
        "formal audit findings population" ,
        "formal findings population",
        "high-risk findings list",
    ]

    if any(phrase in lowered for phrase in wrong_population_phrases):
        return False

    unsupported_number_phrases = ["97 action", "78 pending", "78 open", "97 distinct"]
    if any(phrase in lowered for phrase in unsupported_number_phrases):
        return False

    return True


def build_deterministic_kpi_card_answer(payload: AgentChatRequest, partial_answer: str = "") -> str:
    kpi_title = payload.kpiTitle or payload.topic or "Selected KPI"
    active_value = get_dashboard_value_from_analysis(kpi_title, payload.analysis)
    source_evidence = format_uploaded_source_evidence_for_card(payload.focusedEvidence)
    title_lower = kpi_title.lower()

    if is_formal_risk_kpi_title(title_lower):
        formal_counts = extract_formal_finding_counts_from_payload(payload)
        total_count = formal_counts.get("total", 0)
        high_count = formal_counts.get("high", 0)
        medium_count = formal_counts.get("medium", 0)
        low_count = formal_counts.get("low", 0)
        risk_label = get_requested_risk_label_from_title(title_lower)
        requested_count = get_requested_formal_count_from_counts(title_lower, formal_counts)
        source_names = formal_counts.get("sources", "uploaded formal audit finding evidence")
        supporting_signals = formal_counts.get("supporting_signals", [])
        sample_findings = formal_counts.get("samples", [])
        question_intent = classify_kpi_followup_intent(payload.question)

        if risk_label:
            population_sentence = (
                f'The "{kpi_title}" card is using the formal audit findings population: '
                f'distinct IA finding IDs from the uploaded formal findings/audit evidence, filtered to findings rated {risk_label}. '
                f'It is not counting risk-register rows, vendor/procurement rows, inventory rows, compliance checklist rows, or finance signal rows.'
            )
            best_value_sentence = (
                f'The best-supported value from the current uploaded evidence is **{requested_count} {risk_label} formal findings**. '
                f'This sits inside the broader formal finding population of {total_count} distinct IA findings '
                f'({high_count} High, {medium_count} Medium, {low_count} Low).'
            )
        else:
            population_sentence = (
                f'The "{kpi_title}" card is using the formal audit findings population: distinct IA finding IDs from the uploaded formal findings/audit evidence. '
                f'It is not counting checklist/control rows, risk-register rows, vendor rows, inventory rows, remediation actions, or financial-statement signal rows.'
            )
            best_value_sentence = (
                f'The best-supported value from the current uploaded evidence is **{total_count} total formal audit findings**, '
                f'with a risk split of {high_count} High, {medium_count} Medium, and {low_count} Low.'
            )

        support_text = "\n".join(
            f"- {item}" for item in supporting_signals[:8]
        ) or "- No separate supporting signal population was exposed in the request payload."

        sample_text = "\n".join(
            f"- {item}" for item in sample_findings[:8]
        ) or "- Formal finding samples were limited in the request payload; validate against the uploaded formal findings/audit report file."

        evidence_note = (
            f"- **Formal finding source population:** {source_names}. Current-upload formal count: {total_count} total "
            f"({high_count} High, {medium_count} Medium, {low_count} Low).\n"
            f"{sample_text}\n"
            f"- **Separate supporting signal populations, not merged into this KPI:**\n{support_text}"
        )

        conflict_sentence = (
            "The formal finding sources and the displayed formal KPI count reconcile if the dashboard is scoped to distinct IA finding IDs. "
            "The larger High/Medium/Low counts in risk-register, vendor, inventory, financial, or checklist files are not direct conflicts; they are broader supporting signal populations. "
            "They should be discussed as context, but not added to the formal finding KPI."
        )

        if question_intent == "population":
            return f"""
## {kpi_title} — Source Population

The source population is **formal audit findings**, specifically distinct IA finding IDs from the uploaded formal findings/audit evidence. {('For this card, the population is filtered to findings rated ' + risk_label + '.') if risk_label else 'For this card, the population includes all formal IA findings.'}

It is **not** using broader supporting-signal populations such as risk-register rows, vendor/procurement records, inventory reconciliation rows, compliance checklist controls, finance workbook rows, or remediation tracker actions. Those files can support audit context, but they should not be merged into this KPI count.

Current-upload formal finding split: **{total_count} total = {high_count} High + {medium_count} Medium + {low_count} Low**.
""".strip()

        if question_intent == "conflict":
            return f"""
## {kpi_title} — Conflict Check

The main apparent conflict is a **population difference**, not necessarily a source error.

Formal finding population: **{total_count} total = {high_count} High + {medium_count} Medium + {low_count} Low**.

Supporting signal populations found in other uploaded files:
{support_text}

These broader signal counts should not be added to the formal KPI. The card value is supported only if the dashboard intends this KPI to mean formal IA findings, not every high/medium/low signal across all workpapers.
""".strip()

        if question_intent == "files":
            return f"""
## {kpi_title} — Supporting Files

The strongest source population is: **{source_names}**.

Evidence samples from the current upload:
{sample_text}

Supporting-signal files are reconciliation context only:
{support_text}

Do not cite generated dashboard recommendations as evidence for this KPI value.
""".strip()

        if question_intent == "action":
            return f"""
## {kpi_title} — Next Audit Action

Use the formal finding population as the KPI basis and keep broader signal populations separate. {best_value_sentence}

Next action: prioritize the highest-risk unresolved formal findings first, then use the broader supporting-signal files to guide root-cause review, sampling, and remediation validation. If the dashboard label is meant to include raw risk signals instead of formal findings, relabel the KPI or split it into a separate signal-volume metric.
""".strip()

        return f"""
## {kpi_title} — Card Analysis

**What population this card is actually using.**
{population_sentence}

**Reconciling the count.**
{conflict_sentence}

**Which value is best supported.**
{best_value_sentence} If the dashboard displays **{active_value}**, that value is supported only when the card is scoped to this formal finding population. If the dashboard is intended to count all broader risk signals across workpapers, the displayed value would need to be relabeled or recalculated.

**Evidence.**
{evidence_note}

**Next action.**
Keep this KPI tied to distinct formal IA findings. Use broader supporting signal populations for investigation and prioritization, not as additional formal findings. For review, prioritize unresolved high-risk formal findings first, especially those marked Open, In Progress, or Overdue in the uploaded evidence.
""".strip()

    if "pending" in title_lower or "action" in title_lower:
        question_intent = classify_kpi_followup_intent(payload.question)
        status_counts = extract_remediation_status_counts_from_payload(payload)
        relevant_evidence = format_filtered_uploaded_source_evidence_for_card(
            payload.focusedEvidence,
            [r"remediation", r"action[ _-]?tracker", r"pending/non-closed", r"status counts?", r"open\s+\d+.*in\s+progress"],
            "- Direct remediation tracker snippets were limited in the request payload. Validate against the uploaded Remediation Action Tracker file.",
        )

        if status_counts.get("total", 0) > 0:
            open_count = status_counts.get("open", 0)
            in_progress_count = status_counts.get("in_progress", 0)
            overdue_count = status_counts.get("overdue", 0)
            closed_count = status_counts.get("closed", 0)
            total_actions = status_counts.get("total", 0)
            non_closed = status_counts.get("pending", open_count + in_progress_count + overdue_count)
            best_value = non_closed
            source_names = status_counts.get("sources", "uploaded remediation tracker evidence")
            status_sentence = (
                f"{total_actions} total actions = {open_count} Open + {in_progress_count} In Progress + "
                f"{overdue_count} Overdue + {closed_count} Closed. Pending/non-closed = "
                f"{open_count} + {in_progress_count} + {overdue_count} = {non_closed}."
            )
            reconciliation = (
                f"The tracker population contains {total_actions} distinct remediation actions. "
                f"The status breakdown is Open {open_count}, In Progress {in_progress_count}, "
                f"Overdue {overdue_count}, and Closed {closed_count}. Counting the non-closed "
                f"statuses gives {open_count} + {in_progress_count} + {overdue_count} = {non_closed}. "
                f"Closed actions are excluded."
            )
            evidence_note = (
                f"- **{source_names}:** Remediation action/status evidence supports {total_actions} total actions, "
                f"with Open {open_count}, In Progress {in_progress_count}, Overdue {overdue_count}, Closed {closed_count}.\n"
                f"{relevant_evidence}"
            )
        else:
            best_value = active_value
            total_actions = open_count = in_progress_count = overdue_count = closed_count = non_closed = 0
            status_sentence = "The request payload did not expose a complete remediation tracker status breakdown."
            reconciliation = (
                "The provided request payload did not expose a complete remediation tracker status breakdown. "
                "The displayed value should therefore be treated as a computed claim and validated against the uploaded remediation tracker status field before relying on it."
            )
            evidence_note = relevant_evidence

        if question_intent == "population":
            return f"""
## {kpi_title} — Source Population

This KPI uses the **Remediation Action Tracker** population. It counts remediation/action rows with statuses such as Open, In Progress, Overdue, and Closed.

It does **not** use the Detailed Findings Evidence Index, formal finding severity, financial flags, vendor signals, or compliance checklist rows as the primary population.

Current-upload status logic: **{status_sentence}**
""".strip()

        if question_intent == "conflict":
            return f"""
## {kpi_title} — Conflict Check

The main conflict risk is a **population mismatch**. Pending Actions should come from the remediation tracker only, not from formal findings, PDF narrative exceptions, or generated recommendations.

Current remediation tracker evidence: **{status_sentence}**

If another file shows open exceptions or unresolved findings, treat that as context for triage, not as the Pending Actions KPI count unless it is explicitly part of the action tracker.
""".strip()

        if question_intent == "files":
            return f"""
## {kpi_title} — Supporting Files

The strongest source is the uploaded **Remediation Action Tracker** or any extracted action/status table from that tracker.

Evidence from the current upload:
{evidence_note}

Detailed findings, financial workbooks, vendor records, and checklist files can explain why actions exist, but they should not override the tracker status count.
""".strip()

        if question_intent == "action":
            return f"""
## {kpi_title} — Next Audit Action

Use **{best_value} pending/non-closed actions** if Pending means all actions that are not Closed. First triage the **{overdue_count} Overdue** actions, then review Open and In Progress actions by owner, due date, aging, and required closure evidence.

Do not close actions based only on narrative explanations; require the closure evidence listed in the tracker.
""".strip()

        return f"""
## {kpi_title} — Card Analysis

**What population this card is actually using.**
The "{kpi_title}" card is using the remediation action tracker population. It should count action/status rows from the uploaded remediation tracker, where remediation actions are linked to audit findings and each action has a status such as Open, In Progress, Overdue, or Closed. It is not using the Detailed Findings Evidence Index as the primary population, and it is not counting formal finding severity, financial flags, vendor signals, or compliance checklist rows.

**Reconciling the count.**
{reconciliation}

**Which value is best supported.**
The best-supported value is **{best_value} pending actions** if "pending" means all remediation actions that are not closed. If the dashboard displays **{active_value}**, it should reconcile to the same tracker status logic. If it does not, the dashboard value is not supported by the remediation tracker and should be corrected or relabeled. If "Pending" is defined more narrowly as only Status = Open, the supported value would be the Open subset; if it means only past-due work, the supported value would be the Overdue subset.

**Evidence.**
{evidence_note}

**Next action.**
Confirm that the KPI definition maps "Pending Actions" to "not Closed." If so, keep the card aligned to the non-closed remediation action count and triage the overdue subset first, because overdue actions are the highest-urgency part of the pending population. Then review owners, due dates, aging, required closure evidence, and latest updates for the open and in-progress actions.
""".strip()


    if "financial" in title_lower or "flag" in title_lower:
        question_intent = classify_kpi_followup_intent(payload.question)
        financial_counts = extract_financial_flag_counts_from_payload(payload)
        dashboard_workbook_rows = financial_counts.get("dashboard_workbook_rows", 0)
        pdf_audit_note_rows = financial_counts.get("pdf_audit_note_rows", 0)
        explicit_sources = financial_counts.get("explicit_sources", [])
        workbook_sources = financial_counts.get("workbook_sources", [])
        pdf_sources = financial_counts.get("pdf_sources", [])
        relevant_evidence = format_filtered_uploaded_source_evidence_for_card(
            payload.focusedEvidence,
            [r"financial", r"statement", r"workbook", r"pdf", r"audit-note", r"cash[- ]?flow", r"income", r"position"],
            "- Direct financial-statement snippets were limited in the request payload. Validate against the financial workbook and the PDF financial-statement schedules.",
        )

        if dashboard_workbook_rows > 0 and pdf_audit_note_rows > 0 and dashboard_workbook_rows != pdf_audit_note_rows:
            reconciliation = (
                f"The dashboard/workbook population supports {dashboard_workbook_rows} Financial Flags, "
                f"but the broader uploaded PDF financial-statement population supports {pdf_audit_note_rows} flagged financial-statement lines. "
                f"Those values do not represent the same population: {dashboard_workbook_rows} is the current workbook/dashboard subset, while {pdf_audit_note_rows} is the broader PDF financial-statement audit-note population."
            )
            best_value = (
                f"**{dashboard_workbook_rows}** is best supported for the current dashboard/workbook card value, "
                f"but **{pdf_audit_note_rows}** is best supported if the card is intended to represent the full uploaded financial-statement flag population."
            )
            next_action = (
                f"Either expand the workbook/dashboard calculation so Financial Flags counts all {pdf_audit_note_rows} PDF financial-statement audit-note rows, "
                f"or relabel the card to clarify that it only reflects the {dashboard_workbook_rows}-row workbook subset."
            )
            scope_sentence = (
                f"This is a scope mismatch, not a random contradiction: {dashboard_workbook_rows} is the workbook/dashboard subset and {pdf_audit_note_rows} is the broader PDF financial-statement population."
            )
        elif dashboard_workbook_rows > 0:
            reconciliation = (
                f"The uploaded workbook/dashboard evidence supports {dashboard_workbook_rows} financial-statement rows or flags. "
                "No broader conflicting PDF financial-statement population was exposed in the request payload."
            )
            best_value = f"**{dashboard_workbook_rows}** is the best-supported value from the current uploaded workbook/dashboard evidence."
            next_action = "Validate whether the dashboard is intentionally scoped to the workbook financial-statement subset."
            scope_sentence = f"The current evidence exposes the workbook/dashboard subset only: {dashboard_workbook_rows} financial-statement rows or flags."
        elif pdf_audit_note_rows > 0:
            reconciliation = (
                f"The uploaded PDF evidence supports {pdf_audit_note_rows} financial-statement audit-note rows. "
                "No separate workbook/dashboard financial flag count was exposed in the request payload."
            )
            best_value = f"**{pdf_audit_note_rows}** is the best-supported value from the broader uploaded PDF financial-statement population."
            next_action = "Map those PDF audit-note rows into the dashboard calculation or add a clear source limitation note."
            scope_sentence = f"The current evidence exposes the broader PDF financial-statement population: {pdf_audit_note_rows} audit-note rows."
        else:
            reconciliation = (
                f"The dashboard currently displays {active_value}, but the request payload did not expose a reliable uploaded financial-statement population count."
            )
            best_value = f"The displayed value **{active_value}** needs validation against the source financial-statement schedules."
            next_action = "Validate the Financial Flags card against the workbook Financial Statements sheet and the PDF financial-statement schedules."
            scope_sentence = "The uploaded request did not expose enough financial-statement row evidence to reconcile the card confidently."

        evidence_lines: List[str] = []
        for item in explicit_sources[:4]:
            evidence_lines.append(f"- **Explicit workbook/dashboard metric:** {item}")
        for item in workbook_sources[:4]:
            evidence_lines.append(f"- **Workbook financial-statement evidence:** {item}")
        for item in pdf_sources[:4]:
            evidence_lines.append(f"- **PDF financial-statement evidence:** {item}")
        if relevant_evidence:
            evidence_lines.append(relevant_evidence)
        evidence_note = "\n".join(evidence_lines) if evidence_lines else relevant_evidence

        if question_intent == "population":
            return f"""
## {kpi_title} — Source Population

This KPI uses a **financial-statement evidence-signal population**, not formal audit findings.

The dashboard value is based on the workbook/dashboard financial-statement subset when that subset is available. The PDF schedules may contain a broader financial-statement audit-note population that should be reconciled separately.

Current-upload scope: **{scope_sentence}**
""".strip()

        if question_intent == "conflict":
            return f"""
## {kpi_title} — Conflict Check

{scope_sentence}

The values should not be forced to match if they come from different populations. The dashboard can keep the workbook/dashboard value only if the card label makes that scope clear; otherwise, it should expand to the broader uploaded financial-statement population.
""".strip()

        if question_intent == "files":
            return f"""
## {kpi_title} — Supporting Files

Use the financial-statement workbook/dashboard evidence for the current card value, then reconcile it against the PDF financial-statement schedules.

Evidence from the current upload:
{evidence_note}

Formal finance-related IA findings are useful context, but they are not the Financial Flags KPI population unless the uploaded source defines the KPI that way.
""".strip()

        if question_intent == "action":
            return f"""
## {kpi_title} — Next Audit Action

{next_action}

Keep formal finance-related audit findings separate from this KPI. They can guide investigation, but they should not be added into the Financial Flags count unless the KPI definition explicitly says to count formal findings.
""".strip()

        return f"""
## {kpi_title} — Card Analysis

**What population this card is actually using.**
The "{kpi_title}" card is using a financial-statement evidence-signal population, not formal audit findings. The current dashboard/workbook value is based on the workbook/dashboard financial-statement subset. However, the uploaded PDF may contain a broader financial-statement audit-note population, so the card must reconcile the workbook subset against the full PDF financial-statement schedules.

**Reconciling the count.**
{reconciliation}

**Which value is best supported.**
{best_value} If the dashboard displays **{active_value}**, that value is acceptable only for the narrower workbook/dashboard population. It should not be presented as the complete uploaded-package financial flag count unless the PDF population is intentionally excluded and the card label says so.

**Evidence.**
{evidence_note}

**Next action.**
{next_action} Also keep formal finance-related audit findings as separate context; do not add them into this Financial Flags KPI unless the source files define that as the KPI formula.
""".strip()

    return f"""
## {kpi_title} — Card Analysis

**What population this card is actually using.**
The "{kpi_title}" card is using a financial-statement evidence-signal population, not formal audit findings. The current dashboard/workbook value is based on the workbook/dashboard financial-statement subset. However, the uploaded PDF may contain a broader financial-statement audit-note population, so the card must reconcile the workbook subset against the full PDF financial-statement schedules.

**Reconciling the count.**
{reconciliation}

**Which value is best supported.**
{best_value} If the dashboard displays **{active_value}**, that value is acceptable only for the narrower workbook/dashboard population. It should not be presented as the complete uploaded-package financial flag count unless the PDF population is intentionally excluded and the card label says so.

**Evidence.**
{evidence_note}

**Next action.**
{next_action} Also keep formal finance-related audit findings as separate context; do not add them into this Financial Flags KPI unless the source files define that as the KPI formula.
""".strip()

    return f"""
## {kpi_title} — Card Analysis

**What population this card is actually using.**
The card should be interpreted from the uploaded evidence population that directly matches the KPI title. Do not use generated recommendations, internal notes, or prior chatbot text as source evidence.

**Reconciling the count.**
The dashboard currently displays **{active_value}** for this KPI. This value should be checked against the uploaded source snippets below. If the snippets describe a different population, keep those populations separate rather than merging them.

**Which value is best supported.**
The best-supported value is the value that can be traced to uploaded source files, not a generated dashboard recommendation. If the uploaded evidence does not clearly support the displayed value, the answer should lower confidence and request validation.

**Evidence.**
{source_evidence}

**Next action.**
Validate the KPI definition against the source population, then update the dashboard label or calculation so the card value matches the uploaded evidence.
""".strip()



def is_formal_risk_kpi_title(title: str) -> bool:
    """Return True for KPI cards whose population should be distinct formal IA findings."""
    lowered = (title or "").lower()

    if "pending" in lowered or "action" in lowered:
        return False
    if "financial" in lowered or "flag" in lowered:
        return False
    if "vendor" in lowered or "compliance" in lowered:
        return False

    return (
        "total" in lowered
        or "high risk" in lowered
        or "medium risk" in lowered
        or "low risk" in lowered
        or lowered.strip() in {"high", "medium", "low"}
    )


def get_requested_risk_label_from_title(title: str) -> Optional[str]:
    lowered = (title or "").lower()
    if "high" in lowered:
        return "High"
    if "medium" in lowered:
        return "Medium"
    if "low" in lowered:
        return "Low"
    return None


def get_requested_formal_count_from_counts(title: str, counts: Dict[str, Any]) -> int:
    risk_label = get_requested_risk_label_from_title(title)
    if risk_label == "High":
        return int(counts.get("high", 0) or 0)
    if risk_label == "Medium":
        return int(counts.get("medium", 0) or 0)
    if risk_label == "Low":
        return int(counts.get("low", 0) or 0)
    return int(counts.get("total", 0) or 0)


def classify_kpi_followup_intent(question: str) -> str:
    """Classify short follow-ups without misclassifying the full base KPI prompt.

    The standard base prompt contains words like "population", "reconcile", and
    "next action" because it asks for the full five-section card analysis. Those
    words should not make the backend return only a one-section follow-up answer.
    """
    lowered = " ".join((question or "").lower().split())

    full_base_markers = [
        "analyze the",
        "card using only",
        "first determine",
        "then reconcile",
        "which value is best supported",
        "state the next action",
    ]

    if ("analyze the" in lowered and "card" in lowered) or sum(marker in lowered for marker in full_base_markers) >= 3:
        return "base"

    if any(phrase in lowered for phrase in ["what source population", "what population", "population is", "population using"]):
        return "population"
    if any(phrase in lowered for phrase in ["conflicting", "conflict", "different values", "other files", "reconcile"]):
        return "conflict"
    if any(phrase in lowered for phrase in ["which uploaded file", "which file", "what file", "source file", "files support", "evidence support"]):
        return "files"
    if any(phrase in lowered for phrase in ["next action", "what should", "prioritize", "recommend", "do next"]):
        return "action"
    return "base"


def extract_formal_finding_counts_from_payload(payload: AgentChatRequest) -> Dict[str, Any]:
    """Extract formal IA finding counts from the current upload payload.

    This is document-driven, not package-hardcoded. It uses dynamic dashboard/extraction
    counts, the current-upload KPI evidence brief, and formal IA finding snippets in
    the request payload. Broader risk-register/vendor/inventory/checklist counts are
    retained as separate supporting-signal populations for reconciliation only.
    """
    analysis = payload.analysis if isinstance(payload.analysis, dict) else {}

    def safe_int(value: Any) -> int:
        try:
            return int(value or 0)
        except (TypeError, ValueError):
            return 0

    total = safe_int(analysis.get("totalFindings"))
    high = safe_int(analysis.get("highRiskItems"))
    medium = safe_int(analysis.get("mediumRiskItems"))
    low = safe_int(analysis.get("lowRiskItems"))

    samples: List[str] = []
    sources: List[str] = []
    supporting_signals: List[str] = []

    def add_source(name: str) -> None:
        clean_name = trim_text(name or "Unknown source", 180)
        if clean_name and clean_name not in sources:
            sources.append(clean_name)

    def add_sample(name: str, snippet: str) -> None:
        if not snippet:
            return
        add_source(name)
        clean_snippet = trim_text(snippet, 320)
        entry = f"{trim_text(name or 'Uploaded formal finding evidence', 120)}: {clean_snippet}"
        if entry not in samples:
            samples.append(entry)

    def parse_population_text(text: str) -> None:
        nonlocal total, high, medium, low
        if not text:
            return

        # Handles: "Formal audit finding population: 64 distinct IA finding IDs (25 High, 26 Medium, 13 Low)."
        population_match = re.search(
            r"(?:formal audit finding population|formal finding population).*?(\d{1,5})\s+(?:distinct\s+)?(?:IA\s+)?finding.*?\(?\s*(\d{1,5})\s+High\s*,\s*(\d{1,5})\s+Medium\s*,\s*(\d{1,5})\s+Low",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if population_match:
            total = total or int(population_match.group(1))
            high = high or int(population_match.group(2))
            medium = medium or int(population_match.group(3))
            low = low or int(population_match.group(4))

        split_match = re.search(
            r"(\d{1,5})\s+High\s*[,+]\s*(\d{1,5})\s+Medium\s*[,+]\s*(\d{1,5})\s+Low",
            text,
            flags=re.IGNORECASE,
        )
        if split_match:
            high = high or int(split_match.group(1))
            medium = medium or int(split_match.group(2))
            low = low or int(split_match.group(3))
            if total <= 0:
                total = high + medium + low

    for item in payload.focusedEvidence:
        name = item.sourceName or "Focused evidence"
        snippet = item.snippet or ""
        combined = f"{name} {item.evidenceType or ''} {snippet}"
        combined_lower = combined.lower()
        source_name_lower = name.lower()

        is_internal_evidence = any(
            token in source_name_lower
            for token in ["deterministic", "generated", "internal", "reasoning", "brief"]
        )

        # Internal evidence briefs can help parse counts, but they must never be
        # surfaced as uploaded source files in the final answer.
        parse_population_text(snippet)

        if "supporting signal" in combined_lower or "not formal findings" in combined_lower:
            if not is_internal_evidence:
                supporting_signals.append(f"{trim_text(name, 120)}: {trim_text(snippet, 420)}")
            continue

        if is_internal_evidence:
            continue

        if re.search(r"\bIA[-_ ]?\d{4}[-_ ]?\d{3}\b", combined, flags=re.IGNORECASE):
            risk_text = f" {item.risk or ''} {snippet} "
            if re.search(r"\b(High|Medium|Low)\b", risk_text, flags=re.IGNORECASE):
                add_sample(name, snippet)

    findings = analysis.get("findings", [])
    if isinstance(findings, list):
        seen_finding_keys = set()
        counted_from_findings = {"high": 0, "medium": 0, "low": 0}

        for finding in findings:
            if not isinstance(finding, dict):
                continue

            risk = str(finding.get("risk", "")).strip().lower()
            if risk not in {"high", "medium", "low"}:
                continue

            finding_text = f"{finding.get('finding', '')} {finding.get('excerpt', '')}"
            finding_id_match = re.search(r"\bIA[-_ ]?\d{4}[-_ ]?\d{3}\b", finding_text, flags=re.IGNORECASE)
            key = finding_id_match.group(0).upper().replace("_", "-").replace(" ", "-") if finding_id_match else trim_text(finding_text, 160)
            if key in seen_finding_keys:
                continue
            seen_finding_keys.add(key)
            counted_from_findings[risk] += 1
            add_sample(str(finding.get("document", "Extracted formal finding")), finding_text)

        # Only use this list for totals if the frontend did not already provide full counts.
        if total <= 0 and seen_finding_keys:
            high = counted_from_findings["high"]
            medium = counted_from_findings["medium"]
            low = counted_from_findings["low"]
            total = high + medium + low

    if total <= 0 and (high + medium + low) > 0:
        total = high + medium + low

    return {
        "total": total,
        "high": high,
        "medium": medium,
        "low": low,
        "sources": "; ".join(sources[:5]) if sources else "uploaded formal audit finding evidence",
        "samples": samples[:10],
        "supporting_signals": supporting_signals[:10],
    }

def extract_remediation_status_counts_from_payload(payload: AgentChatRequest) -> Dict[str, Any]:
    """Parse remediation tracker status counts from the current request payload.

    Priority order:
    1. Frontend-computed remediationActionStatusCounts from the full uploaded files.
    2. Explicit status-count summary snippets in focused evidence.
    3. Full/compact source-file rows named remediation/action tracker.

    This prevents truncated source text from turning a 64-row Mega tracker into an
    older 54-row/46-pending answer.
    """
    candidates: List[Dict[str, Any]] = []

    def normalize_counts(raw: Dict[str, Any], source: str, priority: int) -> None:
        try:
            open_count = int(raw.get("open", 0) or 0)
            in_progress_count = int(raw.get("in_progress", raw.get("inProgress", 0)) or 0)
            overdue_count = int(raw.get("overdue", 0) or 0)
            closed_count = int(raw.get("closed", 0) or 0)
            total_count = int(raw.get("total", 0) or 0)
        except (TypeError, ValueError):
            return

        pending_count = open_count + in_progress_count + overdue_count
        if total_count <= 0:
            total_count = pending_count + closed_count

        if total_count <= 0 or pending_count < 0:
            return

        candidates.append(
            {
                "open": open_count,
                "in_progress": in_progress_count,
                "overdue": overdue_count,
                "closed": closed_count,
                "total": total_count,
                "pending": pending_count,
                "sources": source,
                "priority": priority,
            }
        )

    def parse_explicit_status_summary(text: str, source: str, priority: int) -> None:
        if not text:
            return

        # Handles: "Open 21, In Progress 19, Overdue 13, Closed 11"
        # and similar punctuation/colon variants.
        pattern = re.compile(
            r"Open\s*[:=]?\s*(\d{1,5}).{0,80}?In\s*Progress\s*[:=]?\s*(\d{1,5}).{0,80}?Overdue\s*[:=]?\s*(\d{1,5}).{0,80}?Closed\s*[:=]?\s*(\d{1,5})",
            flags=re.IGNORECASE | re.DOTALL,
        )
        match = pattern.search(text)
        if match:
            normalize_counts(
                {
                    "open": match.group(1),
                    "in_progress": match.group(2),
                    "overdue": match.group(3),
                    "closed": match.group(4),
                },
                source,
                priority,
            )

    def parse_action_rows(text: str, source: str, priority: int) -> None:
        if not text:
            return

        actions: Dict[str, str] = {}
        for raw_line in re.split(r"\r?\n", text):
            line = " ".join(raw_line.replace("|", ",").replace("\t", ",").split())
            if not line:
                continue

            status_match = re.search(r"\b(Open|In\s+Progress|Overdue|Closed)\b", line, flags=re.IGNORECASE)
            if not status_match:
                continue

            action_match = re.search(r"\bACT[-_ ]?\d{4}[-_ ]?\d{3}\b", line, flags=re.IGNORECASE)
            finding_match = re.search(r"\bIA[-_ ]?\d{4}[-_ ]?\d{3}\b", line, flags=re.IGNORECASE)
            if not action_match and not finding_match:
                continue

            key = action_match.group(0) if action_match else finding_match.group(0)
            key = key.upper().replace("_", "-").replace(" ", "-")
            status = re.sub(r"\s+", " ", status_match.group(1).strip().lower())
            actions[key] = status

        if not actions:
            return

        raw_counts = {"open": 0, "in_progress": 0, "overdue": 0, "closed": 0, "total": len(actions)}
        for status in actions.values():
            if status == "open":
                raw_counts["open"] += 1
            elif status == "in progress":
                raw_counts["in_progress"] += 1
            elif status == "overdue":
                raw_counts["overdue"] += 1
            elif status == "closed":
                raw_counts["closed"] += 1

        normalize_counts(raw_counts, source, priority)

    # 1. Use full-file counts computed in the frontend before text compaction.
    analysis = payload.analysis if isinstance(payload.analysis, dict) else {}
    frontend_counts = analysis.get("remediationActionStatusCounts")
    if isinstance(frontend_counts, dict):
        normalize_counts(frontend_counts, "frontend full-upload remediation action status count", 100)

    # 2. Focused evidence often includes an explicit status-count sentence from the full frontend analysis.
    for item in payload.focusedEvidence:
        name = item.sourceName or "Focused evidence"
        text = item.snippet or ""
        if re.search(r"remediation|action[ _-]?tracker|pending/non-closed|Open\s+\d+", f"{name} {text}", flags=re.IGNORECASE):
            parse_explicit_status_summary(text, name, 90)
            parse_action_rows(text, name, 60)

    # 3. Parse source files if available. These may be compacted, so lower priority than explicit summaries.
    source_files = analysis.get("sourceFiles", [])
    if isinstance(source_files, list):
        for source_file in source_files:
            if not isinstance(source_file, dict):
                continue
            name = str(source_file.get("name", "Unknown source"))
            text = str(source_file.get("text", ""))
            if re.search(r"remediation|action[ _-]?tracker", name, flags=re.IGNORECASE):
                parse_explicit_status_summary(text, name, 70)
                parse_action_rows(text, name, 50)

    if not candidates:
        return {
            "open": 0,
            "in_progress": 0,
            "overdue": 0,
            "closed": 0,
            "total": 0,
            "pending": 0,
            "sources": "uploaded remediation tracker evidence",
        }

    # Prefer the strongest/fullest source. This fixes truncated tracker snippets that
    # show an older or partial 54/46 count while focused evidence has the full 64/53 count.
    best = sorted(
        candidates,
        key=lambda row: (int(row.get("priority", 0)), int(row.get("total", 0)), int(row.get("pending", 0))),
        reverse=True,
    )[0]

    best.pop("priority", None)
    return best




def extract_financial_flag_counts_from_payload(payload: AgentChatRequest) -> Dict[str, Any]:
    """Parse Financial Flags population counts from the current request payload.

    The frontend computes these counts from the full uploaded files before source
    text is compacted. This lets the backend reconcile the workbook/dashboard
    subset against the broader PDF financial-statement audit-note population.
    """
    result: Dict[str, Any] = {
        "dashboard_workbook_rows": 0,
        "workbook_rows": 0,
        "explicit_dashboard_rows": 0,
        "pdf_audit_note_rows": 0,
        "explicit_sources": [],
        "workbook_sources": [],
        "pdf_sources": [],
    }

    analysis = payload.analysis if isinstance(payload.analysis, dict) else {}
    frontend_counts = analysis.get("financialFlagPopulationCounts")

    if isinstance(frontend_counts, dict):
        def int_value(key: str) -> int:
            try:
                return int(frontend_counts.get(key, 0) or 0)
            except (TypeError, ValueError):
                return 0

        result["dashboard_workbook_rows"] = int_value("dashboardWorkbookRows")
        result["workbook_rows"] = int_value("workbookRows")
        result["explicit_dashboard_rows"] = int_value("explicitDashboardRows")
        result["pdf_audit_note_rows"] = int_value("pdfAuditNoteRows")
        result["explicit_sources"] = frontend_counts.get("explicitSources", []) if isinstance(frontend_counts.get("explicitSources", []), list) else []
        result["workbook_sources"] = frontend_counts.get("workbookSources", []) if isinstance(frontend_counts.get("workbookSources", []), list) else []
        result["pdf_sources"] = frontend_counts.get("pdfSources", []) if isinstance(frontend_counts.get("pdfSources", []), list) else []

    def parse_summary(text: str, source: str) -> None:
        if not text:
            return

        workbook_match = re.search(r"(?:dashboard/workbook|workbook|financial statements? rows?).{0,80}?(\d{1,5})", text, flags=re.IGNORECASE | re.DOTALL)
        pdf_match = re.search(r"(?:broader PDF|PDF|financial-statement audit-note population).{0,80}?(\d{1,5})", text, flags=re.IGNORECASE | re.DOTALL)

        if workbook_match and result["dashboard_workbook_rows"] <= 0:
            result["dashboard_workbook_rows"] = int(workbook_match.group(1))
            result["workbook_sources"].append(f"{source}: {trim_text(text, 220)}")

        if pdf_match and result["pdf_audit_note_rows"] <= 0:
            result["pdf_audit_note_rows"] = int(pdf_match.group(1))
            result["pdf_sources"].append(f"{source}: {trim_text(text, 220)}")

    for item in payload.focusedEvidence:
        parse_summary(item.snippet or "", item.sourceName or "Focused evidence")

    source_files = analysis.get("sourceFiles", [])
    if isinstance(source_files, list):
        for source_file in source_files:
            if not isinstance(source_file, dict):
                continue
            name = str(source_file.get("name", "Unknown source"))
            text = str(source_file.get("text", ""))
            parse_summary(text, name)

    return result

def get_dashboard_value_from_analysis(kpi_title: str, analysis: Dict[str, Any]) -> str:
    title = (kpi_title or "").lower()

    if "total" in title:
        return str(analysis.get("totalFindings", "unknown"))
    if "high" in title:
        return str(analysis.get("highRiskItems", "unknown"))
    if "medium" in title:
        return str(analysis.get("mediumRiskItems", "unknown"))
    if "low" in title:
        return str(analysis.get("lowRiskItems", "unknown"))
    if "compliance" in title:
        return f'{analysis.get("complianceScore", "unknown")}%'
    if "pending" in title or "action" in title:
        return str(analysis.get("pendingActionItems", "unknown"))
    if "financial" in title or "flag" in title:
        return str(analysis.get("financialDiscrepancyFlags", "unknown"))
    if "vendor" in title:
        return str(analysis.get("vendorRiskRating", "unknown"))

    return "unknown"


def extract_status_counts(text: str) -> Optional[Dict[str, int]]:
    patterns = [
        r"Open\s*[:=]?\s*(\d+)\D+In\s*Progress\s*[:=]?\s*(\d+)\D+Overdue\s*[:=]?\s*(\d+)\D+Closed\s*[:=]?\s*(\d+)",
        r"Open\s+(\d+)\D+In Progress\s+(\d+)\D+Overdue\s+(\d+)\D+Closed\s+(\d+)",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        if match:
            return {
                "open": int(match.group(1)),
                "in_progress": int(match.group(2)),
                "overdue": int(match.group(3)),
                "closed": int(match.group(4)),
            }

    return None


def format_uploaded_source_evidence_for_card(evidence_items: List[FocusedEvidence]) -> str:
    lines: List[str] = []

    for item in evidence_items:
        source_name = item.sourceName or "Unknown source"
        lowered = source_name.lower()

        if any(token in lowered for token in ["deterministic", "generated", "internal", "reasoning", "brief"]):
            continue

        if not item.snippet:
            continue

        lines.append(f'- **{source_name}:** {trim_text(item.snippet, 350)}')

        if len(lines) >= 6:
            break

    if not lines:
        return "- Direct uploaded source snippets were limited in the request payload. Validate this KPI against the relevant uploaded source file before relying on the displayed value."

    return "\n".join(lines)


def format_filtered_uploaded_source_evidence_for_card(
    evidence_items: List[FocusedEvidence],
    include_patterns: List[str],
    fallback: str,
) -> str:
    """Return only KPI-relevant uploaded evidence snippets.

    This keeps answers from citing unrelated formal findings when the user asks
    about a tracker KPI, or tracker rows when the user asks about financial flags.
    Internal guardrail/generated snippets are always hidden from the final answer.
    """
    compiled_patterns = [re.compile(pattern, flags=re.IGNORECASE) for pattern in include_patterns]
    lines: List[str] = []

    for item in evidence_items:
        source_name = item.sourceName or "Unknown source"
        snippet = item.snippet or ""
        combined = f"{source_name} {item.evidenceType or ''} {snippet}"
        lowered = combined.lower()

        if any(token in lowered for token in ["deterministic", "generated", "internal", "reasoning", "brief"]):
            continue

        if not snippet:
            continue

        if not any(pattern.search(combined) for pattern in compiled_patterns):
            continue

        lines.append(f'- **{source_name}:** {trim_text(snippet, 350)}')

        if len(lines) >= 5:
            break

    return "\n".join(lines) if lines else fallback


def build_system_prompt(agent_id: str) -> str:
    persona = get_persona_instruction(agent_id)

    return f"""
You are an evidence-first AI audit co-pilot inside an audit dashboard.

Your goal is accuracy, not confidence. Read the current uploaded evidence, identify the population being asked about, reconcile source counts, and answer only from the evidence provided in this request.

Evidence hierarchy:
1. Uploaded source-file snippets and focused evidence from the current upload are strongest.
2. Extracted source-file summaries and table/text snippets are supporting evidence.
3. Extracted formal findings and clicked dashboard context are useful, but they are computed claims that must be reconciled with source evidence.
4. Dashboard KPI values are not proof by themselves.
5. Generated recommendations are not source evidence and must never justify a KPI count.
6. Recent chat history is only for follow-up continuity, not a source of new facts.

Universal reasoning process:
- Identify the active card, finding, source, or user question.
- Determine the exact source population involved: formal findings, remediation actions, checklist controls, risk matrix entries, vendor/procurement rows, financial-statement rows, inventory records, or another uploaded population.
- Reconcile counts across uploaded files. If values differ, explain the separate populations instead of merging them.
- Choose the best-supported value only after checking evidence.
- If the dashboard value conflicts with uploaded evidence, state the conflict clearly.
- If direct evidence is missing, say what is missing and lower confidence.

Hard rules:
- Do not invent facts, counts, formulas, source files, finding IDs, page numbers, owners, statuses, dates, root causes, or impacts.
- Do not copy a dashboard KPI number unless the uploaded evidence supports it.
- Do not use generated dashboard recommendations as evidence for KPI values.
- Do not use sentences like "Create an action tracker for X pending actions" to prove X; that is generated recommendation text, not source evidence.
- Do not cite internal notes, deterministic briefs, or guardrail text as uploaded source files.
- Do not include unrelated KPI cards unless the user explicitly asks for a comparison.
- Do not explain general audit definitions unless the user asks for a definition.
- Finish the answer completely. Never stop after only the first section or mid-sentence.

Formatting:
- If the user is asking about a KPI/card, follow the KPI format given in the user prompt exactly.
- If the user is not asking about a KPI/card, use concise sections: Answer, Evidence, Risk/Impact, Next Step, Confidence.
- Use enough detail to reconcile evidence. Do not force the answer under a short word limit when reconciliation is required.
- Keep the answer audit-style and source-grounded.

Persona behavior:
{persona}
""".strip()

def get_persona_instruction(agent_id: str) -> str:
    personas = {
        "professional": """
Professional Agent:
Aim: executive-ready audit communication.
Use crisp, formal language and focus on business relevance, ownership, and recommended action.
Best for: manager updates, meeting summaries, and stakeholder-facing explanations.
""",
        "friendly": """
Friendly Agent:
Aim: make audit findings easy to understand.
Use simple language, explain what the finding means, and avoid heavy jargon.
Best for: quick walkthroughs, non-technical users, and first-pass interpretation.
""",
        "creative": """
Creative Agent:
Aim: identify patterns, themes, and hidden connections across findings.
Use pattern-based framing, but do not invent causes or risks beyond evidence.
Best for: brainstorming remediation themes, spotting repeated issue types, and narrative summaries.
""",
        "analytical": """
Analytical Agent:
Aim: evidence-first audit testing.
Prioritize source evidence, confidence, missing information, and what still needs verification.
Best for: control testing, issue validation, and checking whether a conclusion is supported.
""",
    }

    return personas.get(agent_id, personas["professional"]).strip()


def build_user_prompt(payload: AgentChatRequest) -> str:
    kpi_format_instruction = ""

    if payload.contextType == "kpi":
        kpi_format_instruction = f"""
KPI CARD ANSWER FORMAT:
Use this exact structure for this KPI card. Complete every section.

## {payload.kpiTitle or payload.topic} — Card Analysis

**What population this card is actually using.**
Explain what uploaded source population the card should be counting or rating. Examples: formal audit findings, remediation tracker actions, compliance/control-testing score rows, vendor/procurement signals, financial-statement rows, checklist controls, risk matrix rows, or another uploaded population.

**Reconciling the count.**
Compare the relevant uploaded source counts. If sources agree, say they reconcile cleanly. If they conflict, explain each separate population and do not merge them.

**Which value is best supported.**
State the best-supported value or rating from uploaded evidence. If the dashboard value is not supported, say so clearly.

**Evidence.**
List actual uploaded source files/snippets that support the value. Do not cite generated dashboard recommendations, internal notes, deterministic briefs, or chatbot-generated text as evidence.

**Next action.**
Give the next audit action based on the supported value.
"""

    return f"""
RECENT CHAT HISTORY:
{build_conversation_history(payload.conversationHistory)}

USER QUESTION:
{payload.question}

ACTIVE CONTEXT:
Context type: {payload.contextType}
Topic: {payload.topic}
KPI title: {payload.kpiTitle or "None"}
Scope instruction: {"Analyze only this active KPI/card unless the user asks for comparison." if payload.contextType == "kpi" else "Use the active finding/source/view only."}
Finding: {trim_text(str(payload.finding or "None"), 1000)}
Recommendation: {trim_text(payload.recommendation or "None", 700)}
Source file: {trim_text(str(payload.sourceFile or "None"), 1200)}
Excerpt: {trim_text(payload.excerpt or "None", 1200)}

FOCUSED EVIDENCE FROM CURRENT UPLOADED DOCUMENTS:
{build_focused_evidence_summary(payload.focusedEvidence)}

DASHBOARD SUMMARY AND EXTRACTED CONTEXT:
{build_analysis_summary(payload.analysis)}

{kpi_format_instruction}

CRITICAL EVIDENCE RULES:
- Treat focused evidence and uploaded source snippets as the source of truth.
- Treat dashboard KPI values as computed claims to verify, not proof by themselves.
- Generated dashboard recommendations are NOT source evidence.
- Never justify a KPI count using a generated recommendation sentence.
- If a number appears only in recommendation text or generated dashboard text, mark it low-confidence and say it needs validation.
- If values conflict, reconcile source populations instead of forcing one answer.
- Do not mention internal generated notes as uploaded documents.
- Do not cite "Deterministic KPI evidence brief" or "Generated reasoning instructions" as uploaded source files.
- If the answer depends on a tracker/status field, state exactly which statuses are included and excluded.
- Finish the full answer and complete every required section.

Answer using the required format above.
""".strip()

def build_conversation_history(history: List[ConversationMessage]) -> str:
    if not history:
        return "No prior chat history."

    recent_messages = history[-8:]
    lines: List[str] = []

    for message in recent_messages:
        sender_label = "User" if message.sender == "user" else "Agent"
        message_text = trim_text(message.text, 500)
        lines.append(f"{sender_label}: {message_text}")

    return "\n".join(lines)


def build_focused_evidence_summary(evidence_items: List[FocusedEvidence]) -> str:
    if not evidence_items:
        return "No focused evidence snippets were provided. Use the extracted findings and source-file summaries only, and lower confidence if direct source evidence is missing."

    lines: List[str] = []

    for index, item in enumerate(evidence_items[:18], start=1):
        source_label = item.sourceName or "Unknown source"
        source_lower = source_label.lower()
        internal_note = ""

        if "generated" in source_lower or "brief" in source_lower or "internal" in source_lower or "reasoning" in source_lower:
            internal_note = " Internal dashboard context only; do not cite as an uploaded source file."

        lines.append(
            f"{index}. Source: {source_label} | "
            f"Type: {item.evidenceType}{internal_note} | "
            f"Risk: {item.risk or 'N/A'} | "
            f"Owner: {item.owner or 'N/A'} | "
            f"Snippet: {trim_text(item.snippet, 1500)}"
        )

    return "\n".join(lines)


def build_analysis_summary(analysis: Dict[str, Any]) -> str:
    return f"""
Company: {analysis.get("companyName", "Unknown company")}
Processed at: {analysis.get("processedAt", "Unknown")}

Dashboard values currently calculated by the app. These are computed claims, not proof by themselves:
- Total findings: {analysis.get("totalFindings", "unknown")}
- High risk items: {analysis.get("highRiskItems", "unknown")}
- Medium risk items: {analysis.get("mediumRiskItems", "unknown")}
- Low risk items: {analysis.get("lowRiskItems", "unknown")}
- Compliance score: {analysis.get("complianceScore", "unknown")}
- Pending action items: {analysis.get("pendingActionItems", "unknown")}
- Financial discrepancy flags: {analysis.get("financialDiscrepancyFlags", "unknown")}
- Vendor risk rating: {analysis.get("vendorRiskRating", "unknown")}

Interpretation rule:
A KPI value may refer to a specific source population. Determine whether the value is based on formal findings, checklist/control rows, risk matrix entries, remediation actions, vendor/procurement records, inventory records, financial-statement rows, or another uploaded population. Do not assume all counts are formal audit findings.

Risk summary:
{trim_text(str(analysis.get("riskSummary", "")), 1200)}

Extracted findings:
{build_findings_summary(analysis.get("findings", []))}

Generated recommendations. These are action suggestions only and must NOT be used as evidence for KPI counts:
{build_recommendations_summary(analysis.get("recommendations", []))}

Source files and uploaded text samples:
{build_source_file_summary(analysis.get("sourceFiles", []))}

Annotated excerpt:
{trim_text(str(analysis.get("annotatedExcerpt", "")), 1000)}
""".strip()


def build_findings_summary(findings: Any) -> str:
    if not isinstance(findings, list) or len(findings) == 0:
        return "- No findings provided."

    lines: List[str] = []

    for index, finding in enumerate(findings[:30], start=1):
        if isinstance(finding, dict):
            finding_id = finding.get("findingId") or finding.get("finding_id") or ""
            id_prefix = f"{finding_id} | " if finding_id else ""
            lines.append(
                f'{index}. {id_prefix}[{finding.get("risk", "Unknown")}] '
                f'{finding.get("finding", "No finding text")} | '
                f'Owner: {finding.get("owner", "Unknown")} | '
                f'Document: {finding.get("document", "Unknown")} | '
                f'Excerpt: {trim_text(str(finding.get("excerpt", "")), 500)}'
            )

    return "\n".join(lines)


def build_recommendations_summary(recommendations: Any) -> str:
    if not isinstance(recommendations, list) or len(recommendations) == 0:
        return "- No generated recommendations provided."

    lines: List[str] = []

    for index, recommendation in enumerate(recommendations[:6], start=1):
        lines.append(f"{index}. GENERATED RECOMMENDATION ONLY, NOT SOURCE EVIDENCE: {trim_text(str(recommendation), 300)}")

    return "\n".join(lines)


def build_source_file_summary(source_files: Any) -> str:
    if not isinstance(source_files, list) or len(source_files) == 0:
        return "- No source files provided."

    lines: List[str] = []

    for index, source_file in enumerate(source_files[:12], start=1):
        if isinstance(source_file, dict):
            name = source_file.get("name", "Unknown file")
            extension = source_file.get("extension", "unknown")
            rows_detected = source_file.get("rowsDetected", "unknown")
            size_label = source_file.get("sizeLabel", "unknown size")
            text = trim_text(str(source_file.get("text", "")), 1600)

            lines.append(
                f"{index}. {name} ({extension}, {rows_detected} rows/lines, {size_label}) "
                f"Uploaded text sample: {text}"
            )

    return "\n".join(lines)


def trim_text(text: str, max_chars: int) -> str:
    cleaned = " ".join(str(text).split())

    if len(cleaned) <= max_chars:
        return cleaned

    return cleaned[: max_chars - 3] + "..."
