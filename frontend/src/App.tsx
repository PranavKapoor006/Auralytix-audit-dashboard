import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import JSZip from "jszip";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import professionalAvatar from './assets/agents/professional.png'
import friendlyAvatar from './assets/agents/friendly.png'
import creativeAvatar from './assets/agents/creative.png'
import analyticalAvatar from './assets/agents/analytical.png'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  FileText,
  Mic,
  Palette,
  PieChart,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import "./App.css";

const ANALYTICAL_MALE_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#172554" />
          <stop offset="55%" stop-color="#4f46e5" />
          <stop offset="100%" stop-color="#0891b2" />
        </linearGradient>
        <linearGradient id="skin" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#f3c7a6" />
          <stop offset="100%" stop-color="#c47b54" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="48" fill="url(#bg)" />
      <circle cx="204" cy="42" r="54" fill="#ffffff" opacity="0.12" />
      <circle cx="64" cy="54" r="36" fill="#38bdf8" opacity="0.18" />
      <path d="M62 222c9-47 34-72 66-72s57 25 66 72" fill="#111827" />
      <path d="M86 174c8 17 22 27 42 27s34-10 42-27v48H86z" fill="#1e1b4b" />
      <path d="M111 176l17 25 17-25" fill="#e0f2fe" />
      <path d="M124 197h8l6 25h-20z" fill="#38bdf8" />
      <rect x="86" y="58" width="84" height="104" rx="34" fill="url(#skin)" />
      <path d="M84 91c6-31 28-48 58-45 25 3 41 20 43 45-18-16-43-16-63-13-15 2-27 7-38 13z" fill="#111827" />
      <path d="M84 98c13-13 31-20 55-20 20 0 35 5 46 15-2-32-21-54-53-57-34-3-57 18-63 55z" fill="#0f172a" />
      <circle cx="107" cy="113" r="5" fill="#0f172a" />
      <circle cx="149" cy="113" r="5" fill="#0f172a" />
      <path d="M112 140c12 10 25 10 37 0" stroke="#0f172a" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.7" />
      <path d="M99 106h23v13H99zM134 106h23v13h-23z" fill="none" stroke="#0f172a" stroke-width="5" rx="5" />
      <path d="M122 112h12" stroke="#0f172a" stroke-width="5" stroke-linecap="round" />
      <path d="M50 220h156" stroke="#ffffff" stroke-width="3" opacity="0.14" />
    </svg>
  `);

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type AgentId = "professional" | "friendly" | "creative" | "analytical";
type Page = "agents" | "upload" | "dashboard" | "details" | "findings";
type RiskLevel = "High" | "Medium" | "Low";


type ChatContextType =
  | "general"
  | "kpi"
  | "finding"
  | "recommendation"
  | "source"
  | "excerpt";

type FollowUpIntent =
  | "mitigation"
  | "evidence"
  | "owner"
  | "risk"
  | "summary"
  | "timeline"
  | "generic";

type Agent = {
  id: AgentId;
  name: string;
  tagline: string;
  description: string;
  icon: ReactNode;
  toneExample: string;
  strengths: string[];
  avatarUrl: string;
};

type DetectedFile = {
  name: string;
  extension: string;
  status: "Supported" | "Unsupported";
};

type ParsedAuditFile = {
  name: string;
  extension: string;
  text: string;
  rowsDetected: number;
  sizeLabel: string;
};

type DetailFinding = {
  findingId?: string;
  document: string;
  finding: string;
  risk: RiskLevel;
  owner: string;
  excerpt: string;
};

type AuditAnalysis = {
  companyName: string;
  processedAt: string;
  sourceFiles: ParsedAuditFile[];
  totalFindings: number;
  highRiskItems: number;
  mediumRiskItems: number;
  lowRiskItems: number;
  complianceScore: number;
  pendingActionItems: number;
  financialDiscrepancyFlags: number;
  vendorRiskRating: RiskLevel;
  riskSummary: string;
  findings: DetailFinding[];
  recommendations: string[];
  annotatedExcerpt: string;
};

type DashboardKpi = {
  title: string;
  value: string;
  status: string;
  trend: string;
  icon: ReactNode;
};

type ChatContext = {
  id: number;
  type: ChatContextType;
  topic: string;
  kpiTitle?: string;
  finding?: DetailFinding;
  recommendation?: string;
  sourceFile?: ParsedAuditFile;
  excerpt?: string;
};

type ChatMessage = {
  sender: "agent" | "user";
  text: string;
};

type KpiFollowUpQuestion = {
  label: string;
  question: string;
};

type GoogleTtsResponse = {
  audioBase64: string;
  mimeType: string;
  voiceName: string;
  provider: string;
};

type DynamicFollowUpResponse = {
  suggestions: KpiFollowUpQuestion[];
  provider: string;
  model: string;
};

type EvidenceResult = {
  sourceName: string;
  snippet: string;
  score: number;
};

type LlmModelOption = {
  id: string;
  label: string;
  description: string;
  bestFor: string;
};

type BackendExtractedTable = {
  source_file: string;
  source_type: string;
  page_or_sheet: string;
  table_index: number;
  rows: string[][];
};

type BackendExtractedDocument = {
  source_file: string;
  source_type: string;
  text: string;
  tables: BackendExtractedTable[];
  warnings: string[];
};

type BackendExtractionResponse = {
  fileName: string;
  documents: BackendExtractedDocument[];
  summary: {
    totalDocuments: number;
    totalTables: number;
    totalWarnings: number;
    documentsWithText: number;
    ocrWarnings: number;
  };
  readableReport: string;
};

type ExtractionRunSummary = {
  engine: "backend" | "browser" | "none";
  label: string;
  totalDocuments: number;
  totalTables: number;
  totalWarnings: number;
  ocrWarnings: number;
  fallbackUsed: boolean;
};

const agents: Agent[] = [
  {
    id: "professional",
    name: "Professional",
    tagline: "Boardroom-ready",
    description: "Formal, precise, and structured for executive audit reviews.",
    icon: <Briefcase size={24} />,
    toneExample:
      "I will give a clear executive summary, identify ownership, and recommend next steps.",
    strengths: ["Executive summaries", "Formal reporting", "Action plans"],
    avatarUrl: professionalAvatar,
  },
  {
    id: "friendly",
    name: "Friendly",
    tagline: "Easy to understand",
    description:
      "Warm, conversational, and useful for making audit findings simple.",
    icon: <Smile size={24} />,
    toneExample:
      "I’ll explain this in plain language and help you understand what matters first.",
    strengths: ["Plain English", "Guided review", "Supportive tone"],
    avatarUrl: friendlyAvatar,
  },
  {
    id: "creative",
    name: "Creative",
    tagline: "Story-driven",
    description:
      "Uses patterns, metaphors, and lateral thinking to uncover hidden signals.",
    icon: <Palette size={24} />,
    toneExample:
      "I’ll connect the dots and show the story behind the audit signals.",
    strengths: ["Storytelling", "Pattern discovery", "Fresh ideas"],
    avatarUrl: creativeAvatar,
  },
  {
    id: "analytical",
    name: "Analytical",
    tagline: "Metrics-first",
    description:
      "Data-first, hypothesis-driven, and focused on measurable evidence.",
    icon: <BarChart3 size={24} />,
    toneExample:
      "I will focus on evidence, severity, frequency, and remediation logic.",
    strengths: ["Risk scoring", "Variance analysis", "Evidence logic"],
    avatarUrl: analyticalAvatar,
  },
];



type AgentVoiceProfile = {
  label: string;
  googleVoicePriority: string[];
  browserFallbackPriority: string[];
  preferredKeywords: string[];
  pitch: number;
  rateMultiplier: number;
  fallbackIndex: number;
};

const agentVoiceProfiles: Record<AgentId, AgentVoiceProfile> = {
  professional: {
    label: "Professional / male voice",
    googleVoicePriority: [
      "google uk english male",
      "google en-gb male",
      "google uk male",
      "google us english male",
      "google en-us male",
      "google us male",
    ],
    browserFallbackPriority: [
      "microsoft david desktop",
      "microsoft david",
      "david",
      "microsoft mark",
      "mark",
      "microsoft george",
      "george",
      "microsoft daniel",
      "daniel",
      "google uk english male",
      "en-us male",
      "us english male",
      "male",
    ],
    preferredKeywords: [
      "google uk english male",
      "google us english male",
      "microsoft david",
      "microsoft mark",
      "microsoft george",
      "david",
      "mark",
      "george",
      "daniel",
      "male",
    ],
    pitch: 0.82,
    rateMultiplier: 0.9,
    fallbackIndex: 0,
  },
  friendly: {
    label: "Friendly / Google UK female",
    googleVoicePriority: [
      "google uk english female",
      "google en-gb female",
      "google uk female",
      "google uk english",
    ],
    browserFallbackPriority: [
      "google uk english female",
      "microsoft hazel",
      "hazel",
      "microsoft susan",
      "susan",
      "samantha",
      "zira",
      "female",
      "en-gb female",
    ],
    preferredKeywords: [
      "google uk english female",
      "google uk english",
      "hazel",
      "susan",
      "samantha",
      "zira",
      "female",
    ],
    pitch: 1.15,
    rateMultiplier: 1.02,
    fallbackIndex: 1,
  },
  creative: {
    label: "Creative / Google US female",
    googleVoicePriority: [
      "google us english female",
      "google en-us female",
      "google us female",
      "google us english",
    ],
    browserFallbackPriority: [
      "google us english female",
      "microsoft zira",
      "zira",
      "microsoft jenny",
      "jenny",
      "aria",
      "samantha",
      "female",
      "en-us female",
    ],
    preferredKeywords: [
      "google us english female",
      "google us english",
      "zira",
      "jenny",
      "aria",
      "samantha",
      "female",
    ],
    pitch: 1.32,
    rateMultiplier: 1.14,
    fallbackIndex: 2,
  },
  analytical: {
    label: "Analytical / Google UK male",
    googleVoicePriority: [
      "google uk english male",
      "google en-gb male",
      "google uk male",
      "google uk english",
    ],
    browserFallbackPriority: [
      "google uk english male",
      "microsoft george",
      "george",
      "microsoft david",
      "microsoft mark",
      "david",
      "mark",
      "daniel",
      "en-gb male",
    ],
    preferredKeywords: [
      "google uk english male",
      "google uk english",
      "george",
      "david",
      "mark",
      "daniel",
    ],
    pitch: 0.72,
    rateMultiplier: 0.78,
    fallbackIndex: 3,
  },
};

function normalizeVoiceSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[_/()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function voiceSearchTokens(value: string) {
  return normalizeVoiceSearchText(value)
    .replace(/-/g, " ")
    .split(" ")
    .filter(Boolean);
}

function voiceHasExactToken(searchable: string, token: string) {
  const normalizedToken = normalizeVoiceSearchText(token).replace(/-/g, " ");
  const searchableTokens = voiceSearchTokens(searchable);
  const tokenParts = normalizedToken.split(" ").filter(Boolean);

  return tokenParts.every((part) => searchableTokens.includes(part));
}

function voiceNameLooksFemale(value: string) {
  const tokens = voiceSearchTokens(value);
  const femaleNames = ["female", "woman", "zira", "jenny", "aria", "samantha", "susan", "hazel"];

  return femaleNames.some((name) => tokens.includes(name));
}

function voiceNameLooksMale(value: string) {
  const tokens = voiceSearchTokens(value);
  const maleNames = ["male", "man", "david", "mark", "george", "daniel"];

  // Do not use includes("male") because "female" contains "male".
  return maleNames.some((name) => tokens.includes(name));
}

function agentRequiresMaleVoice(agentId: AgentId) {
  return agentId === "professional" || agentId === "analytical";
}

function voiceHasGender(voice: SpeechSynthesisVoice, gender: "male" | "female") {
  const searchable = `${voice.name} ${voice.lang}`;

  if (gender === "male") {
    return voiceNameLooksMale(searchable) && !voiceNameLooksFemale(searchable);
  }

  return voiceNameLooksFemale(searchable);
}

function voiceMatchesPriority(searchable: string, priorityQuery: string) {
  const normalizedQuery = normalizeVoiceSearchText(priorityQuery);
  const tokens = normalizedQuery.split(" ").filter(Boolean);

  // Important: match tokens exactly. Substring matching made "male" match
  // "female", which caused the Professional voice to incorrectly select a
  // female Google voice.
  return tokens.every((token) => voiceHasExactToken(searchable, token));
}

function findVoiceByPriority(
  voices: SpeechSynthesisVoice[],
  priorityQueries: string[],
): SpeechSynthesisVoice | undefined {
  const normalizedCandidates = voices.map((voice, index) => ({
    voice,
    index,
    searchable: normalizeVoiceSearchText(
      `${voice.name} ${voice.lang} ${voice.localService ? "local" : "remote"}`,
    ),
  }));

  for (const query of priorityQueries) {
    const match = normalizedCandidates.find((candidate) =>
      voiceMatchesPriority(candidate.searchable, query),
    );

    if (match) return match.voice;
  }

  return undefined;
}

function pickAgentSpeechVoice(
  agentId: AgentId,
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;

  const profile = agentVoiceProfiles[agentId];
  const englishVoices = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith("en"),
  );
  const candidateVoices = englishVoices.length > 0 ? englishVoices : voices;
  const safeCandidates = agentRequiresMaleVoice(agentId)
    ? candidateVoices.filter((voice) => !voiceHasGender(voice, "female"))
    : candidateVoices;

  const prioritizedVoice = findVoiceByPriority(safeCandidates, [
    ...profile.browserFallbackPriority,
    ...profile.preferredKeywords,
  ]);

  if (prioritizedVoice) return prioritizedVoice;

  if (agentRequiresMaleVoice(agentId)) {
    // For Professional/Analytical, never fall back to an ambiguous female/default voice.
    return safeCandidates.find((voice) => voiceHasGender(voice, "male"));
  }

  // If the browser does not expose enough named voices, force different agents
  // onto different available voice indexes where possible.
  return safeCandidates[profile.fallbackIndex % safeCandidates.length];
}

function loadBrowserSpeechVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve([]);
  }

  const existingVoices = window.speechSynthesis.getVoices();

  if (existingVoices.length > 0) {
    return Promise.resolve(existingVoices);
  }

  return new Promise((resolve) => {
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timeoutId);
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve(window.speechSynthesis.getVoices());
    };

    const timeoutId = window.setTimeout(finish, 550);
    window.speechSynthesis.addEventListener("voiceschanged", finish, { once: true });
  });
}

function clampSpeechRate(rate: number) {
  return Math.min(1.3, Math.max(0.7, rate));
}

function isGoogleBrowserVoice(voice: SpeechSynthesisVoice | undefined) {
  if (!voice) return false;

  return voice.name.toLowerCase().includes("google");
}

function pickGoogleBrowserVoice(
  agentId: AgentId,
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;

  const profile = agentVoiceProfiles[agentId];
  const englishGoogleVoices = voices.filter((voice) => {
    return (
      voice.name.toLowerCase().includes("google") &&
      voice.lang.toLowerCase().startsWith("en")
    );
  });

  const googleCandidates = englishGoogleVoices.length > 0
    ? englishGoogleVoices
    : voices.filter((voice) => voice.name.toLowerCase().includes("google"));

  if (!googleCandidates.length) return undefined;

  const safeGoogleCandidates = agentRequiresMaleVoice(agentId)
    ? googleCandidates.filter((voice) => !voiceHasGender(voice, "female"))
    : googleCandidates;

  const prioritizedGoogleVoice = findVoiceByPriority(safeGoogleCandidates, [
    ...profile.googleVoicePriority,
    ...profile.preferredKeywords,
  ]);

  if (prioritizedGoogleVoice) return prioritizedGoogleVoice;

  if (agentRequiresMaleVoice(agentId)) {
    // Professional and Analytical must not choose Google UK/US Female by accident.
    // If Chrome exposes Google UK English Male, this finds it. If no Google male
    // exists on the machine, return undefined so the browser fallback picker can
    // try Microsoft David/Mark/George/Daniel instead of using a Google female voice.
    return safeGoogleCandidates.find((voice) => voiceHasGender(voice, "male"));
  }

  if (agentId === "friendly" || agentId === "creative") {
    const femaleGoogleVoice = googleCandidates.find((voice) =>
      voiceHasGender(voice, "female"),
    );

    if (femaleGoogleVoice) return femaleGoogleVoice;
  }

  return googleCandidates[profile.fallbackIndex % googleCandidates.length];
}

function pickBestBrowserSpeechVoice(
  agentId: AgentId,
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  return pickGoogleBrowserVoice(agentId, voices) || pickAgentSpeechVoice(agentId, voices);
}

function describeBrowserSpeechVoice(
  agentId: AgentId,
  voices: SpeechSynthesisVoice[],
) {
  const voice = pickBestBrowserSpeechVoice(agentId, voices);

  if (!voice) {
    return "Default browser voice";
  }

  return isGoogleBrowserVoice(voice)
    ? `Browser voice: ${voice.name}`
    : `Browser fallback voice: ${voice.name}`;
}

async function fetchGoogleTtsAudio({
  text,
  agentId,
  rate,
}: {
  text: string;
  agentId: AgentId;
  rate: number;
}): Promise<GoogleTtsResponse> {
  const response = await fetch("http://localhost:8000/api/text-to-speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      agentId,
      rate,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Google TTS endpoint failed.");
  }

  return response.json() as Promise<GoogleTtsResponse>;
}

const llmModelOptions: LlmModelOption[] = [
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    description: "Fastest and lowest-token option for daily KPI chat.",
    bestFor: "Low cost",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Balanced option for stronger audit reasoning and speed.",
    bestFor: "Balanced",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "Deep reasoning option for complex audit questions if your key supports it.",
    bestFor: "Deep reasoning",
  },
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    description: "Compatibility option for fast answers if available on your account.",
    bestFor: "Compatibility",
  },
  {
    id: "gemini-2.0-flash-lite",
    label: "Gemini 2.0 Flash-Lite",
    description: "Older lightweight option for fast responses if available.",
    bestFor: "Legacy light",
  },
  {
    id: "gemini-1.5-flash",
    label: "Gemini 1.5 Flash",
    description: "Legacy Flash option if still enabled for your API key.",
    bestFor: "Legacy",
  },
  {
    id: "gemini-1.5-pro",
    label: "Gemini 1.5 Pro",
    description: "Legacy Pro option if still enabled for your API key.",
    bestFor: "Legacy pro",
  },
];

const AURALYTIX_INTRO_SCRIPT =
  "Welcome to Auralytix, your AI-powered audit analytics assistant. You can upload audit documents, review key risk indicators, explore detailed insights, and interact with different AI agent personalities through chat and voice. Select an agent, upload your audit files, and begin exploring your audit evidence.";

const fallbackFindings: DetailFinding[] = [];

const defaultAnalysis: AuditAnalysis = {
  companyName: "No documents processed yet",
  processedAt: "Not processed yet",
  sourceFiles: [],
  totalFindings: 0,
  highRiskItems: 0,
  mediumRiskItems: 0,
  lowRiskItems: 0,
  complianceScore: 0,
  pendingActionItems: 0,
  financialDiscrepancyFlags: 0,
  vendorRiskRating: "Low",
  riskSummary:
    "Upload and process a ZIP package to generate dashboard metrics from the extracted document text.",
  findings: fallbackFindings,
  recommendations: [
    "Upload a ZIP package and process the documents to generate evidence-backed recommendations.",
  ],
  annotatedExcerpt:
    "Upload and process audit documents to generate an annotated excerpt from the actual file contents.",
};

function App() {
  const [page, setPage] = useState<Page>("agents");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [chatAgent, setChatAgent] = useState<Agent>(agents[0]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContext>({
    id: 0,
    type: "general",
    topic: "General Audit Review",
  });
  const [selectedLlmModel, setSelectedLlmModel] = useState<string>(() => {
    return localStorage.getItem("audit-dashboard-llm-model") || "gemini-2.5-flash";
  });

  useEffect(() => {
    localStorage.setItem("audit-dashboard-llm-model", selectedLlmModel);
  }, [selectedLlmModel]);

  useEffect(() => {
    if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useLayoutEffect(() => {
    const scrollToPageTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelector(".workspace")?.scrollIntoView({ block: "start", inline: "nearest" });
    };

    scrollToPageTop();
    window.requestAnimationFrame(scrollToPageTop);
    window.setTimeout(scrollToPageTop, 60);
    window.setTimeout(scrollToPageTop, 180);
    window.setTimeout(scrollToPageTop, 420);
  }, [page]);

  const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<DetectedFile[]>([]);
  const [selectedZipName, setSelectedZipName] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [analysis, setAnalysis] = useState<AuditAnalysis>(defaultAnalysis);
  const [hasProcessedDocuments, setHasProcessedDocuments] = useState(false);
  const [extractionRunSummary, setExtractionRunSummary] = useState<ExtractionRunSummary>({
    engine: "none",
    label: "No extraction run yet",
    totalDocuments: 0,
    totalTables: 0,
    totalWarnings: 0,
    ocrWarnings: 0,
    fallbackUsed: false,
  });
  const [isIntroSpeaking, setIsIntroSpeaking] = useState(false);
  const [introStatus, setIntroStatus] = useState("Intro ready");
  const [voiceMuted, setVoiceMuted] = useState(() => {
    return (
      localStorage.getItem("auralytix-voice-muted") === "true" ||
      localStorage.getItem("auralytix-intro-muted") === "true"
    );
  });
  const introRunRef = useRef(0);
  const lastIntroRequestRef = useRef(0);
  const pendingIntroAfterGestureRef = useRef(false);

  useEffect(() => {
    localStorage.setItem("auralytix-voice-muted", String(voiceMuted));
    localStorage.setItem("auralytix-intro-muted", String(voiceMuted));
  }, [voiceMuted]);

  const stopAuralytixIntro = () => {
    introRunRef.current += 1;
    pendingIntroAfterGestureRef.current = false;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setIsIntroSpeaking(false);
    setIntroStatus(voiceMuted ? "Voice muted" : "Intro ready");
  };

  const playAuralytixIntro = async (trigger: "auto" | "manual" = "manual") => {
    lastIntroRequestRef.current = Date.now();

    if (voiceMuted) {
      pendingIntroAfterGestureRef.current = false;
      setIntroStatus("Voice is muted");
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      pendingIntroAfterGestureRef.current = false;
      setIntroStatus("Intro voice is not supported in this browser");
      return;
    }

    introRunRef.current += 1;
    const currentIntroRun = introRunRef.current;

    const introVoices = await loadBrowserSpeechVoices();

    if (currentIntroRun !== introRunRef.current) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(AURALYTIX_INTRO_SCRIPT);
    const introAgentId: AgentId = "professional";
    const introProfile = agentVoiceProfiles[introAgentId];
    const introAgentName = "Professional";
    const introVoice = pickBestBrowserSpeechVoice(introAgentId, introVoices);
    const introVoiceLabel = introVoice
      ? isGoogleBrowserVoice(introVoice)
        ? `${introAgentName} intro · Google browser voice · ${introVoice.name}`
        : `${introAgentName} intro · browser fallback · ${introVoice.name}`
      : `${introAgentName} intro · default browser voice`;

    utterance.lang = introVoice?.lang || "en-US";
    utterance.voice = introVoice || null;
    utterance.rate = clampSpeechRate(0.96 * introProfile.rateMultiplier);
    utterance.pitch = introProfile.pitch;
    utterance.volume = 1;

    utterance.onstart = () => {
      if (currentIntroRun === introRunRef.current) {
        pendingIntroAfterGestureRef.current = false;
        setIsIntroSpeaking(true);
        setIntroStatus(introVoiceLabel);
      }
    };

    utterance.onend = () => {
      if (currentIntroRun === introRunRef.current) {
        setIsIntroSpeaking(false);
        setIntroStatus("Intro ready");
      }
    };

    utterance.onerror = () => {
      if (currentIntroRun === introRunRef.current) {
        setIsIntroSpeaking(false);

        if (trigger === "auto") {
          pendingIntroAfterGestureRef.current = true;
          setIntroStatus("Intro ready · click anywhere to enable voice");
        } else {
          pendingIntroAfterGestureRef.current = false;
          setIntroStatus("Browser blocked voice. Press Play again.");
        }
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const toggleAuralytixVoiceMute = () => {
    const nextMuted = !voiceMuted;

    if (nextMuted) {
      stopAuralytixIntro();
      setIntroStatus("Voice muted");
    } else {
      setIntroStatus("Intro ready");
    }

    setVoiceMuted(nextMuted);
  };

  useEffect(() => {
    if (page !== "agents") {
      return;
    }

    if (voiceMuted) {
      pendingIntroAfterGestureRef.current = false;
      setIntroStatus("Voice muted");
      return;
    }

    pendingIntroAfterGestureRef.current = true;

    const introTimer = window.setTimeout(() => {
      if (Date.now() - lastIntroRequestRef.current > 900) {
        playAuralytixIntro("auto");
      }
    }, 160);

    return () => window.clearTimeout(introTimer);
  }, [page, voiceMuted]);

  useEffect(() => {
    if (page !== "agents" || voiceMuted) {
      return;
    }

    const playPendingIntroAfterGesture = () => {
      if (pendingIntroAfterGestureRef.current && !voiceMuted && page === "agents") {
        pendingIntroAfterGestureRef.current = false;
        playAuralytixIntro("manual");
      }
    };

    window.addEventListener("pointerdown", playPendingIntroAfterGesture, { capture: true });
    window.addEventListener("click", playPendingIntroAfterGesture, { capture: true });
    window.addEventListener("keydown", playPendingIntroAfterGesture, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", playPendingIntroAfterGesture, { capture: true });
      window.removeEventListener("click", playPendingIntroAfterGesture, { capture: true });
      window.removeEventListener("keydown", playPendingIntroAfterGesture, { capture: true });
    };
  }, [page, voiceMuted]);

  const supportedFileCount = uploadedFiles.filter(
    (file) => file.status === "Supported"
  ).length;

  const unsupportedFileCount = uploadedFiles.filter(
    (file) => file.status === "Unsupported"
  ).length;

  const canAccessUpload = Boolean(selectedAgent);
  const canAccessDashboard = hasProcessedDocuments;
  const canAccessDetails = hasProcessedDocuments;
  const canAccessFindings = hasProcessedDocuments;

  const openAgentsPage = () => {
    setPage("agents");

    if (!voiceMuted) {
      playAuralytixIntro("manual");
    }
  };
  const selectedLlmModelOption =
    llmModelOptions.find((model) => model.id === selectedLlmModel) ||
    llmModelOptions[0];

  const handleAgentSelect = (agent: Agent) => {
    setSelectedAgent(agent);
    setChatAgent(agent);
    setPage("upload");
  };

  const handleAgentSwitch = (agent: Agent) => {
    setSelectedAgent(agent);
    setChatAgent(agent);
  };

  const openAgentChat = (context: Omit<ChatContext, "id">) => {
    if (selectedAgent) {
      setChatAgent(selectedAgent);
    }

    setChatContext({
      ...context,
      id: Date.now(),
    });

    setChatOpen(true);
  };

  const handleAgentChat = (agent: Agent) => {
    setChatAgent(agent);

    setChatContext({
      id: Date.now(),
      type: "general",
      topic: "Agent Conversation",
    });

    setChatOpen(true);
  };

  const handleZipUpload = async (file: File | null) => {
    if (!file) return;

    setUploadError("");
    setUploadedFiles([]);
    setSelectedZipFile(null);
    setSelectedZipName("");
    setProcessingProgress(0);
    setHasProcessedDocuments(false);
    setExtractionRunSummary({
      engine: "none",
      label: "ZIP selected, not processed yet",
      totalDocuments: 0,
      totalTables: 0,
      totalWarnings: 0,
      ocrWarnings: 0,
      fallbackUsed: false,
    });

    if (!file.name.toLowerCase().endsWith(".zip")) {
      setUploadError("Please upload a valid ZIP file.");
      return;
    }

    try {
      const zip = await JSZip.loadAsync(file);
      const supportedExtensions = ["pdf", "docx", "xlsx", "csv", "txt", "png", "jpg", "jpeg"];

      const detectedFiles: DetectedFile[] = Object.values(zip.files)
        .filter((zipEntry) => !zipEntry.dir)
        .map((zipEntry) => {
          const fileName = zipEntry.name;
          const extension =
            fileName.split(".").pop()?.toLowerCase() || "unknown";

          return {
            name: fileName,
            extension,
            status: supportedExtensions.includes(extension)
              ? "Supported"
              : "Unsupported",
          };
        });

      if (detectedFiles.length === 0) {
        setUploadError("No files were detected inside the ZIP.");
        return;
      }

      setSelectedZipFile(file);
      setSelectedZipName(file.name);
      setUploadedFiles(detectedFiles);
    } catch {
      setUploadError("Could not read the ZIP file. Please try another file.");
    }
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    await handleZipUpload(event.dataTransfer.files?.[0] || null);
  };

  const handleProcessDocuments = async () => {
    if (!selectedZipFile) {
      setUploadError("Please upload a ZIP file before processing.");
      return;
    }

    if (supportedFileCount === 0) {
      setUploadError("At least one supported audit document is required.");
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(5);
    setUploadError("");

    try {
      let parsedFiles: ParsedAuditFile[] = [];

      try {
        setProcessingProgress(15);

        const backendExtraction = await extractZipWithBackend(selectedZipFile);

        parsedFiles = convertBackendExtractionToParsedFiles(backendExtraction);
        setExtractionRunSummary({
          engine: "backend",
          label: "Backend extraction.py",
          totalDocuments: backendExtraction.summary.totalDocuments,
          totalTables: backendExtraction.summary.totalTables,
          totalWarnings: backendExtraction.summary.totalWarnings,
          ocrWarnings: backendExtraction.summary.ocrWarnings,
          fallbackUsed: false,
        });
        setProcessingProgress(82);
      } catch (backendError) {
        console.warn("Backend extraction failed. Falling back to browser parsing.", backendError);

        setUploadError(
          "Backend extraction was unavailable, so browser-side parsing was used as a fallback. Start FastAPI on port 8000 to use extraction.py."
        );

        parsedFiles = await processZipInBrowser(
          selectedZipFile,
          (progress) => setProcessingProgress(progress),
        );

        setExtractionRunSummary({
          engine: "browser",
          label: "Browser fallback parser",
          totalDocuments: parsedFiles.length,
          totalTables: 0,
          totalWarnings: 1,
          ocrWarnings: 0,
          fallbackUsed: true,
        });
      }

      if (parsedFiles.length === 0) {
        throw new Error("No supported files were extracted from the ZIP.");
      }

      const generatedAnalysis = analyzeAuditFiles(parsedFiles);

      setProcessingProgress(100);

      setTimeout(() => {
        setAnalysis(generatedAnalysis);
        setHasProcessedDocuments(true);
        setIsProcessing(false);
        setPage("dashboard");

        const scrollToDashboardTop = () => {
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        };

        scrollToDashboardTop();
        window.requestAnimationFrame(scrollToDashboardTop);
        window.setTimeout(scrollToDashboardTop, 80);
        window.setTimeout(scrollToDashboardTop, 250);
        window.setTimeout(scrollToDashboardTop, 650);
      }, 350);
    } catch (error) {
      console.error(error);
      setIsProcessing(false);
      setUploadError(
        "Document processing failed. Please check the ZIP contents and try again."
      );
    }
  };

  return (
    <div className="app">
      <div className="background-glow glow-one" />
      <div className="background-glow glow-two" />

      <header className="topbar">
        <button className="brand" onClick={openAgentsPage}>
          <div className="brand-icon ey-brand-icon" aria-label="EY logo mark">
            <span className="ey-logo-text">EY</span>
            <span className="ey-logo-ray" />
          </div>

          <div>
            <h1>EY Auralytix</h1>
            <p>Audit Analytics Dashboard</p>
          </div>
        </button>

        <div className="topbar-actions">
          <div className={`intro-control-card ${voiceMuted ? "muted" : ""}`}>
            <div>
              <strong>EY voice controls</strong>
              <span>{introStatus}</span>
            </div>

            <button
              type="button"
              onClick={() => playAuralytixIntro("manual")}
              disabled={isIntroSpeaking || voiceMuted}
              title={voiceMuted ? "Unmute voice first" : "Play Auralytix intro"}
            >
              <Volume2 size={15} />
              Play
            </button>

            <button
              type="button"
              onClick={isIntroSpeaking ? stopAuralytixIntro : toggleAuralytixVoiceMute}
              title={isIntroSpeaking ? "Stop intro" : voiceMuted ? "Unmute all voice" : "Mute all voice"}
            >
              {isIntroSpeaking ? <XCircle size={15} /> : voiceMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              {isIntroSpeaking ? "Stop" : voiceMuted ? "Unmute" : "Mute"}
            </button>
          </div>

      <nav className="workflow-nav" aria-label="Auralytix workflow">
        <button
          className={`step-nav-button ${page === "agents" ? "active" : ""} complete`}
          onClick={openAgentsPage}
          aria-current={page === "agents" ? "step" : undefined}
        >
          <span className="step-index">01</span>
          <span className="step-copy">
            <strong>Agents</strong>
            <small>Select persona</small>
          </span>
        </button>

        <button
          className={`step-nav-button ${page === "upload" ? "active" : ""} ${canAccessUpload ? "complete" : "locked"}`}
          disabled={!canAccessUpload}
          title={!canAccessUpload ? "Select an agent first" : "Upload audit ZIP"}
          aria-current={page === "upload" ? "step" : undefined}
          onClick={() => {
            if (canAccessUpload) setPage("upload");
          }}
        >
          <span className="step-index">02</span>
          <span className="step-copy">
            <strong>Upload</strong>
            <small>Audit package</small>
          </span>
        </button>

        <button
          className={`step-nav-button ${page === "dashboard" ? "active" : ""} ${canAccessDashboard ? "complete" : "locked"}`}
          disabled={!canAccessDashboard}
          title={
            !canAccessDashboard
              ? "Upload and process documents first"
              : "View dashboard"
          }
          aria-current={page === "dashboard" ? "step" : undefined}
          onClick={() => {
            if (canAccessDashboard) setPage("dashboard");
          }}
        >
          <span className="step-index">03</span>
          <span className="step-copy">
            <strong>Dashboard</strong>
            <small>Discover evidence</small>
          </span>
        </button>

        <button
          className={`step-nav-button ${page === "details" || page === "findings" ? "active" : ""} ${canAccessDetails ? "complete" : "locked"}`}
          disabled={!canAccessDetails}
          title={
            !canAccessDetails
              ? "Upload and process documents first"
              : "View detailed insights"
          }
          aria-current={page === "details" || page === "findings" ? "step" : undefined}
          onClick={() => {
            if (canAccessDetails) setPage("details");
          }}
        >
          <span className="step-index">04</span>
          <span className="step-copy">
            <strong>Details</strong>
            <small>Deep dive</small>
          </span>
        </button>
      </nav>
        </div>
      </header>

      <main>
        <section className="workspace">
          <div className="session-strip">
            <div className="session-status">
              <span>Active review</span>
              <strong>
                {selectedAgent
                  ? `${selectedAgent.name} Agent Active`
                  : "No agent selected yet"}
              </strong>
              <p>
                {selectedAgent
                  ? selectedAgent.tagline
                  : "Select any agent below or switch agents from this bar."}
              </p>
            </div>

            <div className="agent-switcher">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  className={selectedAgent?.id === agent.id ? "active" : ""}
                  onClick={() => handleAgentSwitch(agent)}
                >
                  {agent.name}
                </button>
              ))}
            </div>

            <div className="model-switcher-card">
              <label htmlFor="global-model-select">AI model</label>
              <select
                id="global-model-select"
                value={selectedLlmModel}
                onChange={(event) => setSelectedLlmModel(event.target.value)}
              >
                {llmModelOptions.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
              <small>{selectedLlmModelOption.bestFor}: {selectedLlmModelOption.description}</small>
            </div>
          </div>

          {page === "agents" && (
            <AgentSelectionPage
              selectedAgent={selectedAgent}
              onOpenAgentChat={handleAgentChat}
              onSelectAgent={handleAgentSelect}
            />
          )}

          {page === "upload" && (
            <UploadPage
              selectedZipName={selectedZipName}
              uploadError={uploadError}
              uploadedFiles={uploadedFiles}
              supportedFileCount={supportedFileCount}
              unsupportedFileCount={unsupportedFileCount}
              isProcessing={isProcessing}
              processingProgress={processingProgress}
              onZipUpload={handleZipUpload}
              onDrop={handleDrop}
              onProcessDocuments={handleProcessDocuments}
            />
          )}

          {page === "dashboard" && (
            <DashboardPage
              analysis={analysis}
              extractionRunSummary={extractionRunSummary}
              onOpenChat={openAgentChat}
            />
          )}

          {page === "details" && (
            <DetailedInsightsPage
              analysis={analysis}
              onOpenChat={openAgentChat}
              onOpenFindings={() => setPage("findings")}
            />
          )}

          {page === "findings" && canAccessFindings && (
            <FindingsRegisterPage
              analysis={analysis}
              onBackToDetails={() => setPage("details")}
              onOpenChat={openAgentChat}
            />
          )}
        </section>
      </main>

      <button
        className="floating-chat"
        onClick={() =>
          openAgentChat({
            type: "general",
            topic: `${page} page review`,
          })
        }
      >
        <Bot size={18} />
        Ask EY Agent
      </button>

      {chatOpen && (
        <ChatPanel
          key={chatContext.id}
          agent={chatAgent}
          selectedAgent={selectedAgent}
          context={chatContext}
          analysis={analysis}
          selectedLlmModel={selectedLlmModel}
          voiceMuted={voiceMuted}
          onVoiceMutedChange={setVoiceMuted}
          onLlmModelChange={setSelectedLlmModel}
          onAgentChange={(agent) => {
            setChatAgent(agent);
            setSelectedAgent(agent);
          }}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}

function AgentSelectionPage({
  selectedAgent,
  onOpenAgentChat,
  onSelectAgent,
}: {
  selectedAgent: Agent | null;
  onOpenAgentChat: (agent: Agent) => void;
  onSelectAgent: (agent: Agent) => void;
}) {
  return (
    <div className="page-content">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="hero-badge">
            <Sparkles size={16} />
            AI-powered audit intelligence
          </div>

          <h2>Choose your audit agent.</h2>

          <p>
            Pick a personality. The selected agent will guide dashboard insights,
            detailed findings, and follow-up conversations.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <strong>4</strong>
            <span>Audit agents</span>
          </div>

          <div>
            <strong>Voice</strong>
            <span>Voice powered by TTS</span>
          </div>

          <div>
            <strong>Chat</strong>
            <span>Chat insights</span>
          </div>
        </div>
      </section>

      <section className="agent-grid">
        {agents.map((agent) => (
          <article
            className={`agent-card ${agent.id} ${
              selectedAgent?.id === agent.id ? "selected" : ""
            }`}
            key={agent.id}
          >
              <div className="agent-card-header">
                <div className={`agent-photo-frame ${agent.id}`}>
                  <img
                    src={agent.avatarUrl}
                    alt={`${agent.name} agent avatar`}
                    className="agent-photo"
                  />
                </div>

                <div>
                  <span>{agent.tagline}</span>
                  {selectedAgent?.id === agent.id && <small>Selected</small>}
                </div>
              </div>

            <h3>{agent.name}</h3>
            <p>{agent.description}</p>

            <div className="strength-list">
              {agent.strengths.map((strength) => (
                <span key={strength}>{strength}</span>
              ))}
            </div>

            <div className="sample-response">
              <p>{agent.toneExample}</p>
            </div>

            <div className="card-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => onOpenAgentChat(agent)}
              >
                Chat
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={() => onSelectAgent(agent)}
              >
                Select
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
function UploadPage({
  selectedZipName,
  uploadError,
  uploadedFiles,
  supportedFileCount,
  unsupportedFileCount,
  isProcessing,
  processingProgress,
  onZipUpload,
  onDrop,
  onProcessDocuments,
}: {
  selectedZipName: string;
  uploadError: string;
  uploadedFiles: DetectedFile[];
  supportedFileCount: number;
  unsupportedFileCount: number;
  isProcessing: boolean;
  processingProgress: number;
  onZipUpload: (file: File | null) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onProcessDocuments: () => void;
}) {
  return (
    <div className="page-content">
      <section className="page-header">
        <div>
          <span className="eyebrow">Phase 2</span>
          <h2>Upload audit documents.</h2>
          <p>
            Upload one ZIP file containing PDF, Word files, spreadsheets, CSVs,
            or text files to extract actual contents from the files.
          </p>
        </div>
      </section>

      <section className="upload-layout">
        <div
          className="upload-box"
          onDrop={onDrop}
          onDragOver={(event) => event.preventDefault()}
        >
          <div className="upload-icon">
            <Upload size={44} />
          </div>

          <h3>Drop your audit ZIP file here</h3>
          <p>Supported inside ZIP: PDF, DOCX, XLSX, CSV, and TXT.</p>

          <label className="file-button">
            Choose ZIP File
            <input
              type="file"
              accept=".zip"
              onChange={(event) =>
                onZipUpload(event.target.files?.[0] || null)
              }
            />
          </label>

          {selectedZipName && (
            <div className="selected-zip">
              Selected ZIP: <strong>{selectedZipName}</strong>
            </div>
          )}

          {uploadError && <div className="upload-error">{uploadError}</div>}
        </div>

        <div className="upload-side-card">
          <h3>Processing extracts</h3>

          <div className="info-list">
            <span>PDF audit report text</span>
            <span>DOCX checklist text</span>
            <span>XLSX sheets and rows</span>
            <span>CSV procurement records</span>
            <span>TXT inventory logs</span>
            <span>Risk, finding, owner, and action signals</span>
          </div>
        </div>
      </section>

      <section className="detected-files">
        <div className="detected-header">
          <div>
            <h3>Detected Files</h3>
            <p>
              After upload, click Submit & Process to extract content and build
              dashboard data.
            </p>
          </div>

          <span>{uploadedFiles.length} files</span>
        </div>

        {uploadedFiles.length === 0 ? (
          <div className="empty-state">
            <FileText size={34} />
            <p>No ZIP contents detected yet.</p>
          </div>
        ) : (
          <>
            <div className="file-summary">
              <div>
                <strong>{supportedFileCount}</strong>
                <p>Supported</p>
              </div>

              <div>
                <strong>{unsupportedFileCount}</strong>
                <p>Unsupported</p>
              </div>
            </div>

            {uploadedFiles.map((file) => (
              <div className="file-row" key={file.name}>
                <div>
                  <FileText size={18} />
                  <span>{file.name}</span>
                </div>

                <small
                  className={
                    file.status === "Supported" ? "supported" : "unsupported"
                  }
                >
                  {file.status}
                </small>
              </div>
            ))}

            {isProcessing && (
              <div className="processing-box">
                <div className="processing-header">
                  <strong>Processing Documents</strong>
                  <span>{processingProgress}%</span>
                </div>

                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${processingProgress}%` }}
                  />
                </div>

                <p>
                  Extracting text from PDF/DOCX/XLSX/CSV/TXT files and building
                  dashboard insights from uploaded content.
                </p>
              </div>
            )}

            <button
              className="wide-btn"
              onClick={onProcessDocuments}
              disabled={isProcessing || supportedFileCount === 0}
            >
              {isProcessing ? "Processing Documents..." : "Submit & Process"}
              {!isProcessing && <ArrowRight size={18} />}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function DashboardPage({
  analysis,
  extractionRunSummary,
  onOpenChat,
}: {
  analysis: AuditAnalysis;
  extractionRunSummary: ExtractionRunSummary;
  onOpenChat: (context: Omit<ChatContext, "id">) => void;
}) {
  const kpis = buildDashboardKpis(analysis);
  const displayedRiskTotal =
    analysis.highRiskItems + analysis.mediumRiskItems + analysis.lowRiskItems;
  const riskTotal = Math.max(1, displayedRiskTotal);
  const highRiskPercent = Math.round((analysis.highRiskItems / riskTotal) * 100);
  const mediumRiskPercent = Math.round(
    (analysis.mediumRiskItems / riskTotal) * 100
  );
  const lowRiskPercent = Math.max(0, 100 - highRiskPercent - mediumRiskPercent);
  const topFindings = analysis.findings.slice(0, 3);
  const sourcePreview = analysis.sourceFiles.slice(0, 5);
  const documentTypeSummary = buildDocumentTypeSummary(analysis.sourceFiles);
  const ownerRiskSummary = buildOwnerRiskSummary(analysis.findings);
  const totalDetectedRows = analysis.sourceFiles.reduce(
    (sum, sourceFile) => sum + sourceFile.rowsDetected,
    0
  );
  const evidenceCoverageScore = Math.min(
    100,
    Math.round(
      analysis.sourceFiles.length * 10 +
        Math.min(45, analysis.totalFindings * 2) +
        Math.min(25, Math.floor(totalDetectedRows / 20))
    )
  );
  const riskPosture =
    analysis.highRiskItems > 0
      ? "High attention required"
      : analysis.mediumRiskItems > 0
        ? "Moderate monitoring required"
        : "Stable control position";
  const primaryReviewFocus =
    analysis.pendingActionItems > 0
      ? "Remediation queue"
      : analysis.highRiskItems > 0
        ? "High-risk findings"
        : "Evidence validation";
  const extractionLabel =
    extractionRunSummary.engine === "backend"
      ? "Backend extraction"
      : extractionRunSummary.engine === "browser"
        ? "Browser fallback"
        : "Not processed";

  const reviewReadinessItems = [
    {
      label: "Evidence coverage",
      value: `${evidenceCoverageScore}%`,
      detail: `${analysis.sourceFiles.length} files / ${totalDetectedRows} rows`,
    },
    {
      label: "KPI grounding",
      value: `${analysis.totalFindings}`,
      detail: "formal findings reconciled",
    },
    {
      label: "Extraction engine",
      value: extractionLabel,
      detail:
        extractionRunSummary.engine === "backend"
          ? `${extractionRunSummary.totalTables} tables / ${extractionRunSummary.ocrWarnings} OCR warnings`
          : extractionRunSummary.fallbackUsed
            ? "FastAPI unavailable; browser parser used"
            : "waiting for upload",
    },
    {
      label: "Review focus",
      value: primaryReviewFocus,
      detail: riskPosture,
    },
    {
      label: "Agent workflow",
      value: "Ready",
      detail: "select any card for evidence chat",
    },
  ];

  const maxOwnerTotal = Math.max(
    1,
    ...ownerRiskSummary.map((owner) => owner.total),
  );
  const maxDocumentRows = Math.max(
    1,
    ...documentTypeSummary.map((item) => item.rowsDetected),
  );
  const riskDonutGradient = `conic-gradient(#f97316 0 ${highRiskPercent}%, #ffe600 ${highRiskPercent}% ${
    highRiskPercent + mediumRiskPercent
  }%, #22c55e ${highRiskPercent + mediumRiskPercent}% 100%)`;
  const remediationPressure = Math.min(
    100,
    Math.round((analysis.pendingActionItems / Math.max(1, analysis.totalFindings)) * 100),
  );

  const exportReviewBrief = () => {
    const brief = buildAuralytixReviewBrief(analysis, extractionRunSummary);
    downloadTextFile(
      `auralytix-review-brief-${new Date().toISOString().slice(0, 10)}.txt`,
      brief,
    );
  };

  return (
    <div className="page-content dashboard-page">
      <section className="dashboard-command-center">
        <div className="dashboard-command-copy">
          <span className="eyebrow">EY Audit Command Center</span>
          <h2>{analysis.companyName}</h2>
          <p>
            Evidence-backed audit intelligence generated from uploaded reports,
            statements, checklists, vendor records, inventory logs, and remediation
            trackers. Select any card to open an AI-powered audit explanation.
          </p>

          <div className="dashboard-command-actions">
            <button
              className="primary-btn"
              onClick={() =>
                onOpenChat({
                  type: "general",
                  topic: "General Dashboard",
                })
              }
            >
              Ask EY Agent
              <Sparkles size={17} />
            </button>

            <button
              type="button"
              className="secondary-btn review-brief-btn"
              onClick={exportReviewBrief}
            >
              Export review brief
              <FileText size={16} />
            </button>

            <span className="dashboard-live-badge">
              <span /> Evidence model active
            </span>
          </div>
        </div>

        <div className="dashboard-command-card">
          <div className="command-card-topline">
            <Bot size={22} />
            <span>Dashboard status</span>
          </div>

          <div className="command-metric-row">
            <span>Processed files</span>
            <strong>{analysis.sourceFiles.length}</strong>
          </div>

          <div className="command-metric-row">
            <span>Extraction</span>
            <strong>{extractionRunSummary.label}</strong>
          </div>

          <div className="command-metric-row">
            <span>Risk posture</span>
            <strong>{riskPosture}</strong>
          </div>

          <div className="command-metric-row">
            <span>Last processed</span>
            <strong>{analysis.processedAt}</strong>
          </div>
        </div>
      </section>

      <section className="dashboard-review-ribbon" aria-label="Dashboard review readiness">
        {reviewReadinessItems.map((item) => (
          <div className="review-ribbon-item" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </div>
        ))}
      </section>

      <section className="dashboard-source-note upgraded-source-note">
        <div>
          <strong>{analysis.companyName}</strong>
          <span>{analysis.sourceFiles.length} source files analyzed</span>
        </div>

        <div>
          <strong>{analysis.totalFindings}</strong>
          <span>evidence-backed findings</span>
        </div>

        <div>
          <strong>{analysis.complianceScore}%</strong>
          <span>computed compliance score</span>
        </div>

        <div>
          <strong>{analysis.vendorRiskRating}</strong>
          <span>vendor risk rating</span>
        </div>
      </section>

      <section className="kpi-grid dashboard-kpi-grid">
        {kpis.map((kpi) => (
          <button
            type="button"
            className={`kpi-card upgraded-kpi-card ${getKpiCardClassName(
              kpi.title,
              kpi.value
            )}`}
            key={kpi.title}
            onClick={() =>
              onOpenChat({
                type: "kpi",
                topic: kpi.title,
                kpiTitle: kpi.title,
              })
            }
          >
            <span className="kpi-card-accent" />

            <div className="kpi-card-header-row">
              <div className="kpi-icon">{kpi.icon}</div>
              <small>{kpi.trend}</small>
            </div>

            <div className="kpi-top">
              <span>{kpi.title}</span>
            </div>

            <strong>{kpi.value}</strong>
            <p>{kpi.status}</p>

            <div className="kpi-card-footer">
              <span>Evidence-grounded</span>
              <small>Ask card →</small>
            </div>
          </button>
        ))}
      </section>

      <section className="dashboard-visual-section" aria-label="Dashboard visual insights">
        <div className="visual-section-header">
          <div>
            <span className="eyebrow">Visual Insights</span>
            <h3>Audit analytics</h3>
          </div>
          <p>
            These charts summarize the same uploaded evidence behind the KPI cards.
            Select any visual to ask the selected agent for a focused explanation.
          </p>
        </div>

        <div className="dashboard-visual-grid">
          <button
            type="button"
            className="dashboard-visual-card risk-visual-card"
            onClick={() =>
              onOpenChat({
                type: "general",
                topic: "Risk Severity Breakdown Chart",
              })
            }
          >
            <div className="visual-card-title-row">
              <PieChart size={22} />
              <div>
                <span>Risk Severity Breakdown</span>
                <small>High / Medium / Low split</small>
              </div>
            </div>

            <div className="risk-donut-wrap">
              <div className="risk-donut-chart" style={{ background: riskDonutGradient }}>
                <div>
                  <strong>{displayedRiskTotal}</strong>
                  <small>Findings</small>
                </div>
              </div>

              <div className="visual-legend-list">
                <span><i className="legend-dot high" />High: {analysis.highRiskItems} ({highRiskPercent}%)</span>
                <span><i className="legend-dot medium" />Medium: {analysis.mediumRiskItems} ({mediumRiskPercent}%)</span>
                <span><i className="legend-dot low" />Low: {analysis.lowRiskItems} ({lowRiskPercent}%)</span>
              </div>
            </div>
          </button>

          <div className="dashboard-visual-card owner-visual-card">
            <div className="visual-card-title-row">
              <BarChart3 size={22} />
              <div>
                <span>Findings by Owner</span>
                <small>Department action concentration</small>
              </div>
            </div>

            <div className="owner-chart-list">
              {ownerRiskSummary.length > 0 ? (
                ownerRiskSummary.slice(0, 4).map((owner) => (
                  <button
                    type="button"
                    key={owner.name}
                    onClick={() =>
                      onOpenChat({
                        type: "general",
                        topic: `Findings by owner chart: ${owner.name}`,
                      })
                    }
                  >
                    <div>
                      <span>{owner.name}</span>
                      <strong>{owner.total}</strong>
                    </div>
                    <div className="chart-track">
                      <span style={{ width: `${Math.max(8, Math.round((owner.total / maxOwnerTotal) * 100))}%` }} />
                    </div>
                    <small>{owner.high} high • {owner.medium} medium • {owner.low} low</small>
                  </button>
                ))
              ) : (
                <p>No owner-level finding data available yet.</p>
              )}
            </div>
          </article>

          <article className="dashboard-visual-card document-visual-card">
            <div className="visual-card-title-row">
              <FileSearch size={22} />
              <div>
                <span>Document Coverage</span>
                <small>Files and rows by source type</small>
              </div>
            </div>

            <div className="document-coverage-chart">
              {documentTypeSummary.length > 0 ? (
                documentTypeSummary.slice(0, 4).map((item) => (
                  <button
                    type="button"
                    key={item.extension}
                    onClick={() =>
                      onOpenChat({
                        type: "general",
                        topic: `Document coverage chart: ${item.extension.toUpperCase()} files`,
                      })
                    }
                  >
                    <span>{item.extension.toUpperCase()}</span>
                    <div className="chart-track">
                      <span style={{ width: `${Math.max(8, Math.round((item.rowsDetected / maxDocumentRows) * 100))}%` }} />
                    </div>
                    <strong>{item.count} files</strong>
                    <small>{item.rowsDetected} rows/lines</small>
                  </button>
                ))
              ) : (
                <p>No document coverage available yet.</p>
              )}
            </div>
          </article>

          <button
            type="button"
            className="dashboard-visual-card compliance-visual-card"
            onClick={() =>
              onOpenChat({
                type: "general",
                topic: "Compliance and Pending Actions Chart",
              })
            }
          >
            <div className="visual-card-title-row">
              <ClipboardCheck size={22} />
              <div>
                <span>Compliance & Actions</span>
                <small>Score, pressure, and next-review focus</small>
              </div>
            </div>

            <div className="compliance-visual-stack">
              <div className="compliance-score-circle">
                <strong>{analysis.complianceScore}%</strong>
                <span>Compliance</span>
              </div>

              <div className="compliance-bars">
                <div>
                  <span>Compliance score</span>
                  <div className="chart-track">
                    <span style={{ width: `${analysis.complianceScore}%` }} />
                  </div>
                </div>
                <div>
                  <span>Pending action pressure</span>
                  <div className="chart-track warning">
                    <span style={{ width: `${remediationPressure}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <p>
              {analysis.pendingActionItems} pending actions with {analysis.financialDiscrepancyFlags} financial flags.
            </p>
          </button>
        </div>
      </section>

      <section className="dashboard-intelligence-grid">
        <button
          className="insight-panel risk-panel command-risk-panel"
          onClick={() =>
            onOpenChat({
              type: "general",
              topic: "Risk Summary",
            })
          }
        >
          <div className="panel-title-row">
            <AlertTriangle size={24} />
            <h3>Risk Composition</h3>
          </div>

          <p>{analysis.riskSummary}</p>

          <div className="risk-composition-bars">
            <div>
              <span>High</span>
              <strong>{analysis.highRiskItems}</strong>
              <div className="risk-track">
                <span className="risk-fill high" style={{ width: `${highRiskPercent}%` }} />
              </div>
            </div>

            <div>
              <span>Medium</span>
              <strong>{analysis.mediumRiskItems}</strong>
              <div className="risk-track">
                <span className="risk-fill medium" style={{ width: `${mediumRiskPercent}%` }} />
              </div>
            </div>

            <div>
              <span>Low</span>
              <strong>{analysis.lowRiskItems}</strong>
              <div className="risk-track">
                <span className="risk-fill low" style={{ width: `${lowRiskPercent}%` }} />
              </div>
            </div>
          </div>
        </button>

        <button
          className="insight-panel findings-preview-panel"
          onClick={() =>
            onOpenChat({
              type: "general",
              topic: "Findings Breakdown",
            })
          }
        >
          <div className="panel-title-row">
            <PieChart size={24} />
            <h3>Priority Findings</h3>
          </div>

          <div className="priority-finding-list">
            {topFindings.length > 0 ? (
              topFindings.map((finding, index) => (
                <div key={`${finding.document}-${index}`}>
                  <span className={`risk ${finding.risk.toLowerCase()}`}>
                    {finding.risk}
                  </span>
                  <p>{finding.finding}</p>
                  <small>{finding.document}</small>
                </div>
              ))
            ) : (
              <p>No extracted findings are available yet.</p>
            )}
          </div>
        </button>

        <button
          className="insight-panel recommendation-command-panel"
          onClick={() =>
            onOpenChat({
              type: "recommendation",
              topic: "Top Recommendation",
              recommendation: analysis.recommendations[0],
            })
          }
        >
          <div className="panel-title-row">
            <CheckCircle2 size={24} />
            <h3>Recommended Next Move</h3>
          </div>

          <p>{analysis.recommendations[0]}</p>

          <div className="recommendation-chip-row">
            <span>Owner review</span>
            <span>Evidence check</span>
            <span>Action tracker</span>
          </div>
        </button>
      </section>

      <section className="evidence-source-panel">
        <div className="evidence-source-header">
          <div>
            <span className="eyebrow">Source Evidence</span>
            <h3>Files used for this dashboard</h3>
          </div>
          <p>Select a source file to ask the audit agent what it contributed.</p>
        </div>

        <div className="evidence-source-grid">
          {sourcePreview.length > 0 ? (
            sourcePreview.map((sourceFile) => (
              <button
                key={sourceFile.name}
                className="evidence-source-card"
                onClick={() =>
                  onOpenChat({
                    type: "source",
                    topic: sourceFile.name,
                    sourceFile,
                  })
                }
              >
                <FileText size={20} />
                <strong>{sourceFile.name}</strong>
                <span>
                  {sourceFile.extension.toUpperCase()} • {sourceFile.rowsDetected} rows/lines
                </span>
              </button>
            ))
          ) : (
            <div className="empty-state">
              Upload and process a ZIP package to show source files here.
            </div>
          )}
        </div>
      </section>


      <section className="dashboard-deep-dive-grid">
        <div className="deep-dive-panel evidence-health-panel">
          <div className="panel-title-row">
            <ShieldCheck size={23} />
            <h3>Evidence Health</h3>
          </div>

          <p>
            This section summarizes whether the dashboard has enough extracted file
            content to support the KPI calculations and audit conversations.
          </p>

          <div className="evidence-health-meter">
            <div>
              <span>Coverage score</span>
              <strong>{evidenceCoverageScore}%</strong>
            </div>
            <div className="evidence-meter-track">
              <span style={{ width: `${evidenceCoverageScore}%` }} />
            </div>
          </div>

          <div className="mini-metric-grid">
            <div>
              <strong>{analysis.sourceFiles.length}</strong>
              <span>Files parsed</span>
            </div>
            <div>
              <strong>{totalDetectedRows}</strong>
              <span>Rows/lines</span>
            </div>
            <div>
              <strong>{analysis.totalFindings}</strong>
              <span>Findings</span>
            </div>
          </div>
        </div>

        <div className="deep-dive-panel document-type-panel">
          <div className="panel-title-row">
            <FileSearch size={23} />
            <h3>Document Coverage</h3>
          </div>

          <div className="document-type-list">
            {documentTypeSummary.length > 0 ? (
              documentTypeSummary.map((item) => (
                <div key={item.extension}>
                  <span>{item.extension.toUpperCase()}</span>
                  <strong>{item.count}</strong>
                  <small>{item.rowsDetected} rows/lines detected</small>
                </div>
              ))
            ) : (
              <p>No document coverage available yet.</p>
            )}
          </div>
        </div>

        <div className="deep-dive-panel owner-risk-panel">
          <div className="panel-title-row">
            <ClipboardCheck size={23} />
            <h3>Owner Action Queue</h3>
          </div>

          <div className="owner-risk-list">
            {ownerRiskSummary.length > 0 ? (
              ownerRiskSummary.map((owner) => (
                <button
                  key={owner.name}
                  onClick={() =>
                    onOpenChat({
                      type: "general",
                      topic: `Owner action queue: ${owner.name}`,
                    })
                  }
                >
                  <span>{owner.name}</span>
                  <strong>{owner.total} items</strong>
                  <small>
                    {owner.high} high • {owner.medium} medium • {owner.low} low
                  </small>
                </button>
              ))
            ) : (
              <p>No owner queue available yet.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function buildDocumentTypeSummary(sourceFiles: ParsedAuditFile[]) {
  const summary = new Map<string, { extension: string; count: number; rowsDetected: number }>();

  sourceFiles.forEach((sourceFile) => {
    const extension = sourceFile.extension || "unknown";
    const current = summary.get(extension) || {
      extension,
      count: 0,
      rowsDetected: 0,
    };

    current.count += 1;
    current.rowsDetected += sourceFile.rowsDetected;
    summary.set(extension, current);
  });

  return Array.from(summary.values()).sort((first, second) => {
    if (second.count !== first.count) return second.count - first.count;
    return second.rowsDetected - first.rowsDetected;
  });
}

function buildOwnerRiskSummary(findings: DetailFinding[]) {
  const summary = new Map<
    string,
    { name: string; total: number; high: number; medium: number; low: number }
  >();

  findings.forEach((finding) => {
    const ownerName = finding.owner || "Unassigned";
    const current = summary.get(ownerName) || {
      name: ownerName,
      total: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    current.total += 1;

    if (finding.risk === "High") current.high += 1;
    if (finding.risk === "Medium") current.medium += 1;
    if (finding.risk === "Low") current.low += 1;

    summary.set(ownerName, current);
  });

  return Array.from(summary.values())
    .sort((first, second) => {
      if (second.high !== first.high) return second.high - first.high;
      if (second.total !== first.total) return second.total - first.total;
      return first.name.localeCompare(second.name);
    })
    .slice(0, 4);
}

function getKpiCardClassName(title: string, value: string) {
  const loweredTitle = title.toLowerCase();
  const loweredValue = value.toLowerCase();

  if (loweredTitle.includes("high") || loweredValue === "high") {
    return "severity-high";
  }

  if (loweredTitle.includes("medium") || loweredValue === "medium") {
    return "severity-medium";
  }

  if (loweredTitle.includes("low") || loweredValue === "low") {
    return "severity-low";
  }

  if (loweredTitle.includes("compliance")) {
    return "severity-compliance";
  }

  if (loweredTitle.includes("financial")) {
    return "severity-finance";
  }

  if (loweredTitle.includes("vendor")) {
    return "severity-vendor";
  }

  return "severity-neutral";
}

function DetailedInsightsPage({
  analysis,
  onOpenChat,
  onOpenFindings,
}: {
  analysis: AuditAnalysis;
  onOpenChat: (context: Omit<ChatContext, "id">) => void;
  onOpenFindings: () => void;
}) {
  const highRiskOwners = buildOwnerRiskSummary(analysis.findings)
    .filter((owner) => owner.high > 0)
    .map((owner) => owner.name)
    .slice(0, 3);
  const detailSummary =
    analysis.findings.length > 0
      ? `Auralytix identified ${analysis.totalFindings} findings across ${analysis.sourceFiles.length} source files, including ${analysis.highRiskItems} high-risk items and ${analysis.pendingActionItems} open action signals. Use the full findings register only when a reviewer needs row-level evidence, owner assignment, or source excerpts.`
      : "Upload and process an audit ZIP package to generate a findings summary, row-level evidence, owner assignments, and downloadable review output.";

  return (
    <div className="page-content details-summary-page">
      <section className="page-header split-header">
        <div>
          <span className="eyebrow">Phase 4</span>
          <h2>Detailed insights.</h2>
          <p>
            A cleaner review layer for document-level findings, source evidence,
            and next-step actions without placing the full register on the main page.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() =>
            onOpenChat({
              type: "general",
              topic: "Detailed Insights Overview",
            })
          }
        >
          Ask EY Agent
        </button>
      </section>

      <section className="findings-summary-panel">
        <div className="findings-summary-copy">
          <span className="eyebrow">Findings register summary</span>
          <h3>Summary</h3>
          <p>{detailSummary}</p>

          <div className="details-action-row">
            <button type="button" className="primary-btn" onClick={onOpenFindings}>
              View Full Findings
              <ArrowRight size={17} />
            </button>

            <button
              type="button"
              className="secondary-btn"
              onClick={() => downloadFindingsWorkbook(analysis)}
              disabled={analysis.findings.length === 0}
            >
              Download Excel
              <FileText size={16} />
            </button>
          </div>
        </div>

        <div className="findings-summary-metrics">
          <div>
            <strong>{analysis.totalFindings}</strong>
            <span>Total findings</span>
          </div>
          <div>
            <strong>{analysis.highRiskItems}</strong>
            <span>High risk</span>
          </div>
          <div>
            <strong>{analysis.pendingActionItems}</strong>
            <span>Open actions</span>
          </div>
          <div>
            <strong>{analysis.sourceFiles.length}</strong>
            <span>Source files</span>
          </div>
        </div>
      </section>

      <section className="details-compact-grid">
        <div className="annotation-card">
          <h3>Annotated excerpt preview</h3>
          <p>“{analysis.annotatedExcerpt}”</p>

          <div className="clause-tags">
            <span>Extracted content</span>
            <span>Audit signal</span>
            <span>Agent-ready context</span>
          </div>

          <button
            className="wide-btn"
            onClick={() =>
              onOpenChat({
                type: "excerpt",
                topic: "Annotated audit excerpt",
                excerpt: analysis.annotatedExcerpt,
              })
            }
          >
            Explain Excerpt
          </button>
        </div>

        <div className="annotation-card">
          <h3>Owner focus</h3>
          <p>
            {highRiskOwners.length > 0
              ? `Priority owner review should begin with ${highRiskOwners.join(", ")} based on high-risk finding concentration.`
              : "Owner action concentration will appear after high-risk findings are extracted from the uploaded audit package."}
          </p>

          <div className="clause-tags">
            {buildOwnerRiskSummary(analysis.findings).slice(0, 4).map((owner) => (
              <span key={owner.name}>{owner.name}: {owner.total}</span>
            ))}
          </div>

          <button
            className="wide-btn"
            onClick={() =>
              onOpenChat({
                type: "general",
                topic: "Owner action summary",
              })
            }
          >
            Ask About Owners
          </button>
        </div>
      </section>

      <section className="source-grid compact-source-grid">
        {analysis.sourceFiles.length === 0 ? (
          <div className="source-file-card">
            <strong>No source files processed yet</strong>
            <p>Upload and process a ZIP file to populate this section.</p>
          </div>
        ) : (
          analysis.sourceFiles.slice(0, 6).map((file) => (
            <button
              className="source-file-card"
              key={`${file.name}-${file.extension}`}
              onClick={() =>
                onOpenChat({
                  type: "source",
                  topic: `Source file: ${file.name}`,
                  sourceFile: file,
                })
              }
            >
              <strong>{file.name}</strong>
              <p>
                {file.extension.toUpperCase()} • {file.rowsDetected} detected
                rows/lines • {file.sizeLabel}
              </p>
            </button>
          ))
        )}
      </section>

      <section className="recommendation-panel compact-recommendation-panel">
        <h3>Generated Recommendations</h3>

        <div className="recommendation-list">
          {analysis.recommendations.slice(0, 4).map((recommendation) => (
            <button
              key={recommendation}
              onClick={() =>
                onOpenChat({
                  type: "recommendation",
                  topic: "Recommendation",
                  recommendation,
                })
              }
            >
              {recommendation}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function FindingsRegisterPage({
  analysis,
  onBackToDetails,
  onOpenChat,
}: {
  analysis: AuditAnalysis;
  onBackToDetails: () => void;
  onOpenChat: (context: Omit<ChatContext, "id">) => void;
}) {
  return (
    <div className="page-content findings-register-page">
      <section className="page-header split-header">
        <div>
          <span className="eyebrow">Full register</span>
          <h2>Findings register.</h2>
          <p>
            Row-level audit findings, risk ratings, owners, and source excerpts.
            This view keeps the main Details page clean while preserving full review depth.
          </p>
        </div>

        <div className="details-action-row header-action-row">
          <button type="button" className="secondary-btn" onClick={onBackToDetails}>
            Back to Details
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => downloadFindingsWorkbook(analysis)}
            disabled={analysis.findings.length === 0}
          >
            Download Excel
            <FileText size={16} />
          </button>
        </div>
      </section>

      <section className="details-table full-findings-table">
        <div className="table-header">
          <span>Document</span>
          <span>Finding</span>
          <span>Risk</span>
          <span>Owner</span>
          <span>Action</span>
        </div>

        {analysis.findings.length === 0 ? (
          <div className="empty-state">
            <FileText size={34} />
            <p>No findings available yet. Upload and process a ZIP file first.</p>
          </div>
        ) : (
          analysis.findings.map((row) => (
            <button
              className="table-row"
              key={`${row.document}-${row.finding}`}
              onClick={() =>
                onOpenChat({
                  type: "finding",
                  topic: `${row.document}: ${row.finding}`,
                  finding: row,
                })
              }
            >
              <span>{row.document}</span>
              <span>{row.finding}</span>
              <span className={`risk ${row.risk.toLowerCase()}`}>
                {row.risk}
              </span>
              <span>{row.owner}</span>
              <span className="ask-link">Ask EY Agent</span>
            </button>
          ))
        )}
      </section>
    </div>
  );
}

function ChatPanel({
  agent,
  selectedAgent,
  context,
  analysis,
  selectedLlmModel,
  voiceMuted,
  onVoiceMutedChange,
  onLlmModelChange,
  onAgentChange,
  onClose,
}: {
  agent: Agent;
  selectedAgent: Agent | null;
  context: ChatContext;
  analysis: AuditAnalysis;
  selectedLlmModel: string;
  voiceMuted: boolean;
  onVoiceMutedChange: (muted: boolean) => void;
  onLlmModelChange: (modelId: string) => void;
  onAgentChange: (agent: Agent) => void;
  onClose: () => void;
}) {
  const autoQuestion = buildAutoQuestion(context);
  const selectedChatModelOption =
    llmModelOptions.find((model) => model.id === selectedLlmModel) ||
    llmModelOptions[0];
  const fallbackKpiFollowUps =
    context.type === "kpi" && context.kpiTitle
      ? getKpiFollowUpQuestions(context.kpiTitle, analysis)
      : [];

  const [dynamicKpiFollowUps, setDynamicKpiFollowUps] = useState<KpiFollowUpQuestion[]>([]);
  const [followUpStatus, setFollowUpStatus] = useState<"idle" | "generating" | "dynamic" | "fallback">(
    fallbackKpiFollowUps.length > 0 ? "fallback" : "idle",
  );
  const suggestedKpiFollowUps =
    dynamicKpiFollowUps.length > 0 ? dynamicKpiFollowUps : fallbackKpiFollowUps;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: "agent",
      text: `${agent.toneExample} I am reviewing: ${context.topic}.`,
    },
    {
      sender: "user",
      text: autoQuestion,
    },
    {
      sender: "agent",
      text: "Connecting to the selected AI model and preparing a focused response...",
    },
  ]);

  const [input, setInput] = useState("");
  const [lastUserQuestion, setLastUserQuestion] = useState(autoQuestion);
  const [isThinking, setIsThinking] = useState(false);
  const [backendStatus, setBackendStatus] = useState<
    "checking" | "connected" | "fallback"
  >("checking");
  const [backendLabel, setBackendLabel] = useState("Checking selected AI model");
  const [ttsSupported, setTtsSupported] = useState(true);
  const [voiceInputSupported, setVoiceInputSupported] = useState(true);
  const [availableSpeechVoices, setAvailableSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);
  const [speechRate, setSpeechRate] = useState(0.95);
  const [voiceStatus, setVoiceStatus] = useState("Voice ready");
  const speechRunRef = useRef(0);
  const currentGoogleAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceMutedRef = useRef(voiceMuted);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const pendingQuestionScrollIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const targetIndex = pendingQuestionScrollIndexRef.current;

    if (targetIndex === null) {
      return;
    }

    const targetElement = chatMessagesRef.current?.querySelector(
      `[data-message-index="${targetIndex}"]`,
    );

    if (targetElement instanceof HTMLElement) {
      window.setTimeout(() => {
        targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
        targetElement.classList.add("message-focus-pulse");

        window.setTimeout(() => {
          targetElement.classList.remove("message-focus-pulse");
        }, 900);
      }, 80);
    }

    pendingQuestionScrollIndexRef.current = null;
  }, [messages.length]);

  useEffect(() => {
    voiceMutedRef.current = voiceMuted;

    if (voiceMuted) {
      stopSpeaking("Voice muted");
    } else if (!isSpeaking && !isListening) {
      setVoiceStatus("Voice ready");
    }
  }, [voiceMuted]);

  const agentVoiceProfile = agentVoiceProfiles[agent.id];
  const selectedAgentSpeechVoice = pickBestBrowserSpeechVoice(agent.id, availableSpeechVoices);

  useEffect(() => {
    const canUseTts =
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      "SpeechSynthesisUtterance" in window;

    const canUseVoiceInput =
      typeof window !== "undefined" &&
      Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

    setTtsSupported(canUseTts);
    setVoiceInputSupported(canUseVoiceInput);
    setVoiceStatus(canUseTts || canUseVoiceInput ? "Voice ready" : "Voice not supported");

    const loadSpeechVoices = () => {
      if (canUseTts) {
        setAvailableSpeechVoices(window.speechSynthesis.getVoices());
      }
    };

    loadSpeechVoices();

    if (canUseTts) {
      window.speechSynthesis.onvoiceschanged = loadSpeechVoices;
    }

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const refreshDynamicFollowUps = async ({
    latestAnswer,
    latestQuestion,
    history,
  }: {
    latestAnswer: string;
    latestQuestion: string;
    history: ChatMessage[];
  }) => {
    if (context.type !== "kpi" || !context.kpiTitle || fallbackKpiFollowUps.length === 0) {
      setDynamicKpiFollowUps([]);
      setFollowUpStatus("idle");
      return;
    }

    setFollowUpStatus("generating");

    try {
      const result = await getDynamicFollowUpQuestionsFromBackend({
        agentId: agent.id,
        question: latestQuestion,
        latestAnswer,
        context,
        analysis,
        conversationHistory: history,
        llmModel: selectedLlmModel,
      });

      if (result.suggestions.length > 0) {
        setDynamicKpiFollowUps(result.suggestions);
        setFollowUpStatus(result.provider === "fallback" ? "fallback" : "dynamic");
      } else {
        setDynamicKpiFollowUps([]);
        setFollowUpStatus("fallback");
      }
    } catch (error) {
      console.warn("Dynamic follow-up generation failed; using KPI fallback chips:", error);
      setDynamicKpiFollowUps([]);
      setFollowUpStatus("fallback");
    }
  };

  const cleanTextForSpeech = (text: string) =>
    text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[#*_>|\-]{2,}/g, " ")
      .replace(/[#*_>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const splitSpeechIntoChunks = (text: string) => {
    const cleaned = cleanTextForSpeech(text);

    if (!cleaned) return [];

    const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
    const chunks: string[] = [];
    let currentChunk = "";

    sentences.forEach((sentence) => {
      const trimmedSentence = sentence.trim();

      if (!trimmedSentence) return;

      if ((currentChunk + " " + trimmedSentence).trim().length <= 260) {
        currentChunk = (currentChunk + " " + trimmedSentence).trim();
      } else {
        if (currentChunk) chunks.push(currentChunk);

        if (trimmedSentence.length > 260) {
          for (let index = 0; index < trimmedSentence.length; index += 260) {
            chunks.push(trimmedSentence.slice(index, index + 260));
          }

          currentChunk = "";
        } else {
          currentChunk = trimmedSentence;
        }
      }
    });

    if (currentChunk) chunks.push(currentChunk);

    return chunks;
  };

  const stopSpeaking = (statusMessage = voiceMutedRef.current ? "Voice muted" : "Voice ready") => {
    speechRunRef.current += 1;

    if (currentGoogleAudioRef.current) {
      currentGoogleAudioRef.current.pause();
      currentGoogleAudioRef.current.src = "";
      currentGoogleAudioRef.current = null;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();

      // Chrome can occasionally keep an utterance alive for a tick after cancel().
      // Cancel a second time on the next tick so the chat Mute button stops audio immediately.
      window.setTimeout(() => {
        window.speechSynthesis.cancel();
      }, 0);
    }

    setIsSpeaking(false);
    setSpeakingMessageIndex(null);
    setVoiceStatus(statusMessage);
  };

  const playGoogleAudioChunk = async (
    audioBase64: string,
    mimeType: string,
    currentSpeechRun: number,
  ) =>
    new Promise<void>((resolve, reject) => {
      if (currentSpeechRun !== speechRunRef.current) {
        resolve();
        return;
      }

      const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
      currentGoogleAudioRef.current = audio;

      audio.onended = () => {
        if (currentGoogleAudioRef.current === audio) {
          currentGoogleAudioRef.current = null;
        }

        resolve();
      };

      audio.onerror = () => {
        if (currentGoogleAudioRef.current === audio) {
          currentGoogleAudioRef.current = null;
        }

        reject(new Error("Google TTS audio playback failed."));
      };

      audio.play().catch(reject);
    });

  const speakWithBrowserTts = (
    chunks: string[],
    messageIndex: number,
    currentSpeechRun: number,
  ) => {
    if (voiceMuted || voiceMutedRef.current) {
      setVoiceStatus("Voice muted");
      setIsSpeaking(false);
      setSpeakingMessageIndex(null);
      return;
    }

    if (!ttsSupported || !("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported in this browser. Try Chrome or Edge.");
      setIsSpeaking(false);
      setSpeakingMessageIndex(null);
      setVoiceStatus("Voice not supported");
      return;
    }

    window.speechSynthesis.cancel();
    setIsSpeaking(true);
    setSpeakingMessageIndex(messageIndex);
    setVoiceStatus(`Preparing ${describeBrowserSpeechVoice(agent.id, availableSpeechVoices)}...`);

    const speakChunk = (chunkIndex: number) => {
      if (currentSpeechRun !== speechRunRef.current) return;

      if (voiceMutedRef.current) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        setSpeakingMessageIndex(null);
        setVoiceStatus("Voice muted");
        return;
      }

      if (chunkIndex >= chunks.length) {
        setIsSpeaking(false);
        setSpeakingMessageIndex(null);
        setVoiceStatus("Voice ready");
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      const agentSpecificVoice = pickBestBrowserSpeechVoice(agent.id, availableSpeechVoices);

      if (chunkIndex === 0) {
        setVoiceStatus(describeBrowserSpeechVoice(agent.id, availableSpeechVoices));
      }

      utterance.lang = agentSpecificVoice?.lang || "en-US";
      utterance.voice = agentSpecificVoice || null;
      utterance.rate = clampSpeechRate(speechRate * agentVoiceProfile.rateMultiplier);
      utterance.pitch = agentVoiceProfile.pitch;
      utterance.volume = 1;

      utterance.onend = () => {
        if (currentSpeechRun === speechRunRef.current && !voiceMutedRef.current) {
          speakChunk(chunkIndex + 1);
        }
      };

      utterance.onerror = () => {
        if (currentSpeechRun !== speechRunRef.current) return;

        setIsSpeaking(false);
        setSpeakingMessageIndex(null);
        setVoiceStatus("Voice stopped");
      };

      window.speechSynthesis.speak(utterance);
    };

    speakChunk(0);
  };

  const speakMessage = async (text: string, messageIndex: number) => {
    if (voiceMuted || voiceMutedRef.current) {
      stopSpeaking("Voice muted");
      return;
    }

    const chunks = splitSpeechIntoChunks(text);

    if (chunks.length === 0) return;

    speechRunRef.current += 1;
    const currentSpeechRun = speechRunRef.current;

    if (currentGoogleAudioRef.current) {
      currentGoogleAudioRef.current.pause();
      currentGoogleAudioRef.current.src = "";
      currentGoogleAudioRef.current = null;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    speakWithBrowserTts(chunks, messageIndex, currentSpeechRun);
  };

  const toggleChatVoiceMute = () => {
    const nextMuted = !voiceMutedRef.current;
    voiceMutedRef.current = nextMuted;

    if (nextMuted) {
      stopSpeaking("Voice muted");
    } else {
      setVoiceStatus("Voice ready");
    }

    onVoiceMutedChange(nextMuted);
  };

  const speakLatestAgentMessage = () => {
    if (voiceMuted || voiceMutedRef.current) {
      stopSpeaking("Voice muted");
      return;
    }

    const latestAgentMessageIndex = [...messages]
      .map((message, index) => ({ message, index }))
      .reverse()
      .find(({ message }) => message.sender === "agent")?.index;

    if (latestAgentMessageIndex === undefined) return;

    speakMessage(messages[latestAgentMessageIndex].text, latestAgentMessageIndex);
  };

  const startVoiceInput = () => {
    const SpeechRecognition =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    stopSpeaking();

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceStatus("Listening... speak your question");
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";

      if (transcript) {
        setInput((previousInput) =>
          previousInput.trim()
            ? `${previousInput.trim()} ${transcript}`
            : transcript,
        );
        setVoiceStatus("Voice captured. Review and send.");
      }
    };

    recognition.onerror = () => {
      setVoiceStatus("Voice input failed. Try again.");
    };

    recognition.onend = () => {
      setIsListening(false);
      setVoiceStatus((currentStatus) =>
        currentStatus.includes("captured") ? currentStatus : "Voice ready",
      );
    };

    recognition.start();
  };

  useEffect(() => {
    let isMounted = true;

    async function loadInitialAnswer() {
      setIsThinking(true);
      setBackendStatus("checking");
      setBackendLabel("Checking selected AI model");

      const result = await getAgentAnswerFromBackend({
        agentId: agent.id,
        question: autoQuestion,
        context,
        analysis,
        llmModel: selectedLlmModel,
      });

      if (!isMounted) return;

      setBackendStatus(result.usedFallback ? "fallback" : "connected");
      setBackendLabel(result.providerLabel);

      const initialHistory: ChatMessage[] = [
        {
          sender: "agent",
          text: `${agent.toneExample} I am reviewing: ${context.topic}.`,
        },
        {
          sender: "user",
          text: autoQuestion,
        },
        {
          sender: "agent",
          text: result.answer,
        },
      ];

      setMessages(initialHistory);

      await refreshDynamicFollowUps({
        latestAnswer: result.answer,
        latestQuestion: autoQuestion,
        history: initialHistory,
      });

      setIsThinking(false);
    }

    loadInitialAnswer();

    return () => {
      isMounted = false;
    };
  }, [context.id]);

  const changeAgent = async (agentId: AgentId) => {
    const nextAgent = agents.find((agentOption) => agentOption.id === agentId);

    if (!nextAgent || isThinking) return;

    onAgentChange(nextAgent);

    setMessages((previousMessages) => [
      ...previousMessages,
      {
        sender: "agent",
        text: `Switched to ${nextAgent.name} EY Agent. Re-answering the current audit question with this persona...`,
      },
      {
        sender: "agent",
        text: "Reviewing the clicked audit context with the selected persona...",
      },
    ]);

    setIsThinking(true);
    setBackendStatus("checking");
    setBackendLabel("Checking selected AI model");

    const result = await getAgentAnswerFromBackend({
  agentId: nextAgent.id,
  question: lastUserQuestion,
  context,
  analysis,
  conversationHistory: messages,
  llmModel: selectedLlmModel,
});

    setBackendStatus(result.usedFallback ? "fallback" : "connected");
    setBackendLabel(result.providerLabel);

    const updatedHistory = [
      ...messages,
      {
        sender: "agent" as const,
        text: `Switched to ${nextAgent.name} EY Agent. Re-answering the current audit question with this persona...`,
      },
      {
        sender: "agent" as const,
        text: result.answer,
      },
    ];

    setMessages(updatedHistory);

    await refreshDynamicFollowUps({
      latestAnswer: result.answer,
      latestQuestion: lastUserQuestion,
      history: updatedHistory,
    });

    setIsThinking(false);
  };

  const changeLlmModel = async (modelId: string) => {
    if (!modelId || modelId === selectedLlmModel || isThinking) return;

    const nextModel = llmModelOptions.find((model) => model.id === modelId);

    onLlmModelChange(modelId);

    const conversationHistory: ChatMessage[] = [
      ...messages,
      {
        sender: "agent",
        text: `Switched AI model to ${nextModel?.label || modelId}. Re-answering the current audit question with the same evidence context...`,
      },
    ];

    setMessages([
      ...conversationHistory,
      {
        sender: "agent",
        text: "Checking the selected AI model and reusing the focused audit evidence...",
      },
    ]);

    setIsThinking(true);
    setBackendStatus("checking");
    setBackendLabel("Checking selected AI model");

    const result = await getAgentAnswerFromBackend({
      agentId: agent.id,
      question: lastUserQuestion,
      context,
      analysis,
      conversationHistory,
      llmModel: modelId,
    });

    setBackendStatus(result.usedFallback ? "fallback" : "connected");
    setBackendLabel(result.providerLabel);

    const updatedHistory = [
      ...conversationHistory,
      {
        sender: "agent" as const,
        text: result.answer,
      },
    ];

    setMessages(updatedHistory);

    await refreshDynamicFollowUps({
      latestAnswer: result.answer,
      latestQuestion: lastUserQuestion,
      history: updatedHistory,
    });

    setIsThinking(false);
  };

  const submitChatQuestion = async (questionText: string, clearTypedInput = false) => {
    const userQuestion = questionText.trim();

    if (!userQuestion || isThinking) return;

    stopSpeaking();

    if (clearTypedInput) {
      setInput("");
    }

    setLastUserQuestion(userQuestion);

    const conversationHistory: ChatMessage[] = [
      ...messages,
      {
        sender: "user",
        text: userQuestion,
      },
    ];

    pendingQuestionScrollIndexRef.current = conversationHistory.length - 1;

    setMessages([
      ...conversationHistory,
      {
        sender: "agent",
        text: "Reviewing the uploaded audit context and recent chat history with the selected AI model. This may take a few seconds...",
      },
    ]);

    setIsThinking(true);
    setBackendStatus("checking");
    setBackendLabel("Checking selected AI model");

    const result = await getAgentAnswerFromBackend({
      agentId: agent.id,
      question: userQuestion,
      context,
      analysis,
      conversationHistory,
      llmModel: selectedLlmModel,
    });

    setBackendStatus(result.usedFallback ? "fallback" : "connected");
    setBackendLabel(result.providerLabel);

    const updatedHistory = [
      ...conversationHistory,
      {
        sender: "agent" as const,
        text: result.answer,
      },
    ];

    setMessages(updatedHistory);

    await refreshDynamicFollowUps({
      latestAnswer: result.answer,
      latestQuestion: userQuestion,
      history: updatedHistory,
    });

    setIsThinking(false);
  };

  const sendMessage = async () => {
    await submitChatQuestion(input, true);
  };

  const sendSuggestedFollowUp = async (questionText: string) => {
    await submitChatQuestion(questionText, false);
  };

  return (
    <aside className="chat-panel">
      <div className={`chat-header ${agent.id}`}>
        <div>
          <h3>{agent.name} EY Agent</h3>
          <p>{context.topic}</p>
        </div>

        <button onClick={() => { stopSpeaking(); onClose(); }}>×</button>
      </div>

      <div className="chat-agent-controls">
        <label htmlFor="chat-agent-select">Chatting as</label>

        <select
          id="chat-agent-select"
          value={agent.id}
          onChange={(event) => changeAgent(event.target.value as AgentId)}
          disabled={isThinking}
        >
          {agents.map((agentOption) => (
            <option key={agentOption.id} value={agentOption.id}>
              {agentOption.name}
            </option>
          ))}
        </select>

        <label htmlFor="chat-model-select">AI model</label>

        <select
          id="chat-model-select"
          value={selectedLlmModel}
          onChange={(event) => changeLlmModel(event.target.value)}
          disabled={isThinking}
        >
          {llmModelOptions.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>

        <small>{selectedChatModelOption.description}</small>

        <small>
          {selectedAgent
            ? `${selectedAgent.name} is active for this review.`
            : "No agent was selected before opening chat."}
        </small>
      </div>

      <div className={`llm-status-card ${backendStatus}`}>
        <span className="llm-dot" />

        <div>
          <strong>
            {backendStatus === "connected"
              ? "AI Connected"
              : backendStatus === "fallback"
                ? "Fallback Mode Active"
                : "Checking Model"}
          </strong>

          <small>{backendLabel}</small>
        </div>
      </div>

      <div className="voice-strip voice-strip-enhanced">
        <span className={voiceMuted ? "voice-status muted" : isSpeaking || isListening ? "voice-status active" : "voice-status"}>
          <Volume2 size={16} />
          <div className="voice-status-copy">
            <strong>{voiceStatus}</strong>
            <small>
              {voiceMuted
                ? "Read-aloud is muted for intro and chat"
                : selectedAgentSpeechVoice
                  ? `${agentVoiceProfile.label} · ${isGoogleBrowserVoice(selectedAgentSpeechVoice) ? "browser voice" : "browser fallback"}: ${selectedAgentSpeechVoice.name}`
                  : `${agentVoiceProfile.label} · default browser voice`}
            </small>
          </div>
        </span>

        <button
          type="button"
          className="voice-action"
          onClick={speakLatestAgentMessage}
          disabled={!ttsSupported || voiceMuted || isSpeaking || isThinking}
        >
          Read
        </button>

        <button
          type="button"
          className="voice-action"
          onClick={() => stopSpeaking()}
          disabled={!isSpeaking}
        >
          Stop
        </button>

        <button
          type="button"
          className={`voice-action ${voiceMuted ? "muted" : ""}`}
          onClick={toggleChatVoiceMute}
          title={voiceMuted ? "Unmute Auralytix voice" : "Mute all Auralytix voice playback"}
        >
          {voiceMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          {voiceMuted ? "Unmute" : "Mute"}
        </button>

        <label className="voice-speed-control">
          <span>Speed</span>
          <select
            value={speechRate}
            onChange={(event) => setSpeechRate(Number(event.target.value))}
            disabled={isSpeaking || voiceMuted}
          >
            <option value={0.8}>Slow</option>
            <option value={0.95}>Normal</option>
            <option value={1.15}>Fast</option>
          </select>
        </label>
      </div>

      {suggestedKpiFollowUps.length > 0 && (
        <div className="kpi-followup-panel">
          <div className="kpi-followup-header">
            <span>{followUpStatus === "dynamic" ? "Smart follow-ups" : "Follow-ups"}</span>
            <small>{followUpStatus === "generating" ? "Generating..." : followUpStatus === "dynamic" ? "Answer-aware" : "Safe fallback"}</small>
          </div>

          <div className="kpi-followup-chips">
            {suggestedKpiFollowUps.map((followUp) => (
              <button
                type="button"
                key={followUp.question}
                title={followUp.question}
                onClick={() => sendSuggestedFollowUp(followUp.question)}
                disabled={isThinking}
              >
                {followUp.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chat-messages" ref={chatMessagesRef}>
        {messages.map((message, index) => (
          <div className={`message ${message.sender}`} key={index} data-message-index={index}>
            {message.sender === "agent" ? (
              <>
                <MarkdownMessage text={message.text} />

                <div className="message-voice-actions">
                  <button
                    type="button"
                    onClick={() => speakMessage(message.text, index)}
                    disabled={!ttsSupported || voiceMuted || isSpeaking}
                  >
                    <Volume2 size={14} />
                    {voiceMuted ? "Muted" : isSpeaking && speakingMessageIndex === index ? "Reading..." : "Read aloud"}
                  </button>

                  <button
                    type="button"
                    onClick={() => stopSpeaking()}
                    disabled={!isSpeaking || speakingMessageIndex !== index}
                  >
                    Stop
                  </button>
                </div>
              </>
            ) : (
              message.text
            )}
          </div>
        ))}
      </div>

      <div className="chat-input">
        <input
          value={input}
          placeholder={
            isThinking
              ? "Agent is reviewing the audit context..."
              : isListening
                ? "Listening to your question..."
                : "Ask or speak a follow-up question..."
          }
          disabled={isThinking}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && sendMessage()}
        />

        <button
          type="button"
          className={isListening ? "mic-button listening" : "mic-button"}
          onClick={startVoiceInput}
          disabled={isThinking || !voiceInputSupported || isListening}
          title={voiceInputSupported ? "Speak a question" : "Voice input is not supported"}
        >
          <Mic size={18} />
        </button>

        <button type="button" onClick={sendMessage} disabled={isThinking}>
          <Send size={18} />
        </button>
      </div>
    </aside>
  );
}

function MarkdownMessage({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {text}
    </ReactMarkdown>
  );
}

function buildAuralytixReviewBrief(
  analysis: AuditAnalysis,
  extractionRunSummary: ExtractionRunSummary,
): string {
  const sourceFileLines = analysis.sourceFiles
    .slice(0, 12)
    .map((sourceFile, index) => {
      return `${index + 1}. ${sourceFile.name} (${sourceFile.extension}, ${sourceFile.rowsDetected} rows/lines, ${sourceFile.sizeLabel})`;
    })
    .join("\n");

  const findingLines = analysis.findings
    .slice(0, 8)
    .map((finding, index) => {
      return `${index + 1}. [${finding.risk}] ${finding.finding} | Owner: ${finding.owner} | Source: ${finding.document}`;
    })
    .join("\n");

  const recommendationLines = analysis.recommendations
    .slice(0, 8)
    .map((recommendation, index) => `${index + 1}. ${recommendation}`)
    .join("\n");

  return [
    "AURALYTIX REVIEW BRIEF",
    "====================",
    `Generated: ${new Date().toLocaleString()}`,
    `Company: ${analysis.companyName}`,
    "",
    "1. Workflow overview",
    "Auralytix is an AI-powered audit analytics assistant supporting agent selection, audit ZIP upload, evidence-backed dashboard KPIs, document-grounded KPI chat, smart follow-up chips, voice input, read-aloud, and global mute controls.",
    "",
    "2. Extraction summary",
    `Engine: ${extractionRunSummary.label}`,
    `Documents: ${extractionRunSummary.totalDocuments}`,
    `Tables: ${extractionRunSummary.totalTables}`,
    `Warnings: ${extractionRunSummary.totalWarnings}`,
    `OCR warnings: ${extractionRunSummary.ocrWarnings}`,
    `Fallback used: ${extractionRunSummary.fallbackUsed ? "Yes" : "No"}`,
    "",
    "3. Dashboard KPIs",
    `Total findings: ${analysis.totalFindings}`,
    `High risk items: ${analysis.highRiskItems}`,
    `Medium risk items: ${analysis.mediumRiskItems}`,
    `Low risk items: ${analysis.lowRiskItems}`,
    `Compliance score: ${analysis.complianceScore}%`,
    `Pending actions: ${analysis.pendingActionItems}`,
    `Financial flags: ${analysis.financialDiscrepancyFlags}`,
    `Vendor risk rating: ${analysis.vendorRiskRating}`,
    "",
    "4. Recommended review path",
    "1. Show the Agents page and Auralytix intro/mute controls.",
    "2. Upload the sample Northstar audit ZIP.",
    "3. Open Dashboard and explain evidence coverage.",
    "4. Click Pending Actions first because it uses deterministic remediation tracker logic.",
    "5. Click a smart follow-up chip such as Status split? or Closure proof?",
    "6. Use Read Latest, Stop Voice, and Mute to review voice controls.",
    "7. Open High Risk Items or Compliance Score if extra validation is requested.",
    "",
    "5. Source files",
    sourceFileLines || "No source files available.",
    "",
    "6. Priority findings",
    findingLines || "No findings available.",
    "",
    "7. Generated recommendations",
    recommendationLines || "No recommendations available.",
    "",
    "8. Operational notes",
    "- Cloud TTS requires valid service-account credentials; browser TTS remains available when cloud credentials are not configured.",
    "- OCR works for image-only/scanned text; scanned table cell reconstruction depends on source document quality.",
    "- Dashboard KPI values should be treated as computed claims and reconciled against uploaded evidence.",
  ].join("\n");
}

function buildFindingRecommendedNextStep(finding: DetailFinding) {
  if (finding.risk === "High") {
    return `Prioritize immediate owner review with ${finding.owner}, request supporting evidence, and set a dated remediation action.`;
  }

  if (finding.risk === "Medium") {
    return `Assign ${finding.owner} to validate the finding, collect missing support, and track closure in the remediation queue.`;
  }

  return `Monitor the item, document the evidence trail, and close after the owner confirms support.`;
}

function downloadFindingsWorkbook(analysis: AuditAnalysis) {
  const rows = analysis.findings.map((finding, index) => ({
    "Finding ID": finding.findingId || `AUR-${String(index + 1).padStart(3, "0")}`,
    Document: finding.document,
    Finding: finding.finding,
    Risk: finding.risk,
    Owner: finding.owner,
    Excerpt: finding.excerpt,
    "Recommended Next Step": buildFindingRecommendedNextStep(finding),
  }));

  const worksheet = XLSX.utils.json_to_sheet(
    rows.length > 0
      ? rows
      : [
          {
            "Finding ID": "",
            Document: "No findings available",
            Finding: "Upload and process an audit ZIP package first.",
            Risk: "",
            Owner: "",
            Excerpt: "",
            "Recommended Next Step": "",
          },
        ],
  );

  worksheet["!cols"] = [
    { wch: 14 },
    { wch: 34 },
    { wch: 58 },
    { wch: 14 },
    { wch: 22 },
    { wch: 72 },
    { wch: 58 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Findings Register");
  XLSX.writeFile(
    workbook,
    `auralytix-findings-register-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function extractZipWithBackend(file: File): Promise<BackendExtractionResponse> {
  const formData = new FormData();
  formData.append("uploaded_file", file);

  const response = await fetch("http://localhost:8000/api/extract-zip", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Backend extraction endpoint failed.");
  }

  return response.json() as Promise<BackendExtractionResponse>;
}

function convertBackendExtractionToParsedFiles(
  extraction: BackendExtractionResponse,
): ParsedAuditFile[] {
  return extraction.documents.map((document) => {
    const tableText = document.tables
      .map((table) => {
        return [
          `\n--- Table ${table.table_index} from ${table.page_or_sheet} ---`,
          backendTableToMarkdown(table.rows),
        ].join("\n");
      })
      .join("\n");

    const warningText = document.warnings.length
      ? `\n\nExtraction warnings:\n${document.warnings.map((warning) => `- ${warning}`).join("\n")}`
      : "";

    const combinedText = [document.text, tableText, warningText]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    const rowsDetected = Math.max(
      countRows(combinedText),
      document.tables.reduce((total, table) => total + table.rows.length, 0),
    );

    return {
      name: readableFileName(document.source_file),
      extension: getExtensionFromBackendDocument(document),
      text: combinedText || "No extractable text was returned by backend extraction.",
      rowsDetected,
      sizeLabel: `${combinedText.length.toLocaleString()} chars`,
    };
  });
}

function getExtensionFromBackendDocument(document: BackendExtractedDocument) {
  const extensionFromName = document.source_file.split(".").pop()?.toLowerCase();

  if (extensionFromName) {
    return extensionFromName;
  }

  return document.source_type.replace("pdf_ocr", "pdf");
}

function backendTableToMarkdown(rows: string[][]) {
  if (!rows.length) {
    return "";
  }

  const maxColumns = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => [
    ...row,
    ...Array(maxColumns - row.length).fill(""),
  ]);

  const header = normalizedRows[0];
  const body = normalizedRows.slice(1);
  const separator = Array(maxColumns).fill("---");

  return [header, separator, ...body]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

async function processZipInBrowser(
  file: File,
  onProgress: (progress: number) => void,
): Promise<ParsedAuditFile[]> {
  const zip = await JSZip.loadAsync(file);

  const supportedEntries = Object.values(zip.files).filter((zipEntry) => {
    if (zipEntry.dir) return false;

    const extension =
      zipEntry.name.split(".").pop()?.toLowerCase() || "unknown";

    return ["pdf", "docx", "xlsx", "csv", "txt"].includes(extension);
  });

  const parsedFiles: ParsedAuditFile[] = [];

  for (let index = 0; index < supportedEntries.length; index += 1) {
    const zipEntry = supportedEntries[index];
    const extension =
      zipEntry.name.split(".").pop()?.toLowerCase() || "unknown";

    const parsedFile = await parseZipEntry(zipEntry, extension);
    parsedFiles.push(parsedFile);

    const progress = 20 + Math.round(((index + 1) / supportedEntries.length) * 65);
    onProgress(progress);
  }

  return parsedFiles;
}

async function getAgentAnswerFromBackend({
  agentId,
  question,
  context,
  analysis,
  conversationHistory = [],
  llmModel,
}: {
  agentId: AgentId;
  question: string;
  context: ChatContext;
  analysis: AuditAnalysis;
  conversationHistory?: ChatMessage[];
  llmModel?: string;
}) {
  try {
    const response = await fetch("http://localhost:8000/api/agent-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agentId,
        question,
        contextType: context.type,
        topic: context.topic,
        kpiTitle: context.kpiTitle,
        finding: context.finding,
        recommendation: context.recommendation,
        sourceFile: context.sourceFile
          ? compactSourceFileForAgent(context.sourceFile)
          : undefined,
        excerpt: context.excerpt,
        focusedEvidence: buildFocusedEvidenceForAgent({
          question,
          context,
          analysis,
        }),
        analysis: compactAnalysisForAgent(analysis),
        conversationHistory: conversationHistory.slice(-8),
        llmModel,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    const data = await response.json();

    if (!data.answer) {
      throw new Error("Backend returned no answer.");
    }

    return {
      answer: data.answer as string,
      usedFallback: false,
      providerLabel: `${data.provider ?? "ollama"} • ${
        data.model ?? "local model"
      }`,
    };
  } catch (error) {
    console.error("Agent backend failed:", error);

    return {
      answer: `I could not reach the local Ollama backend, so I am using the built-in fallback response for review continuity.

${generateAgentResponse(agentId, context, question, analysis)}

Backend checklist:
1. Confirm Ollama is running.
2. Confirm the FastAPI backend is running on http://localhost:8000.
3. Validate with: Invoke-RestMethod http://localhost:8000/api/health`,
      usedFallback: true,
      providerLabel: "Using built-in fallback because backend is unavailable",
    };
  }
}

async function getDynamicFollowUpQuestionsFromBackend({
  agentId,
  question,
  latestAnswer,
  context,
  analysis,
  conversationHistory = [],
  llmModel,
}: {
  agentId: AgentId;
  question: string;
  latestAnswer: string;
  context: ChatContext;
  analysis: AuditAnalysis;
  conversationHistory?: ChatMessage[];
  llmModel?: string;
}): Promise<DynamicFollowUpResponse> {
  if (context.type !== "kpi" || !context.kpiTitle) {
    return {
      suggestions: [],
      provider: "fallback",
      model: "not-a-kpi",
    };
  }

  const fallbackSuggestions = getKpiFollowUpQuestions(
    context.kpiTitle,
    analysis,
    latestAnswer,
  );

  try {
    const response = await fetch("http://localhost:8000/api/follow-up-suggestions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agentId,
        question,
        latestAnswer: truncateText(latestAnswer, 2400),
        contextType: context.type,
        topic: context.topic,
        kpiTitle: context.kpiTitle,
        analysis: compactAnalysisForAgent(analysis),
        conversationHistory: conversationHistory.slice(-8),
        fallbackSuggestions,
        llmModel,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = (await response.json()) as DynamicFollowUpResponse;
    const suggestions = sanitizeFollowUpSuggestions(
      data.suggestions,
      fallbackSuggestions,
    );

    return {
      suggestions,
      provider: data.provider || "gemini",
      model: data.model || llmModel || "selected model",
    };
  } catch (error) {
    console.warn("Follow-up suggestion endpoint failed:", error);

    return {
      suggestions: fallbackSuggestions,
      provider: "fallback",
      model: "local-safe-followups",
    };
  }
}

function sanitizeFollowUpSuggestions(
  suggestions: KpiFollowUpQuestion[] | undefined,
  fallbackSuggestions: KpiFollowUpQuestion[],
): KpiFollowUpQuestion[] {
  const cleaned = (suggestions || [])
    .map((item) => ({
      label: truncateText(String(item.label || "").replace(/[:.]+$/g, "").trim(), 18),
      question: String(item.question || "").trim(),
    }))
    .filter((item) => item.label.length > 0 && item.question.length > 12)
    .slice(0, 3);

  return cleaned.length > 0 ? cleaned : fallbackSuggestions;
}

function compactAnalysisForAgent(analysis: AuditAnalysis) {
  const remediationActionStatusCounts = getRemediationActionStatusCounts(analysis.sourceFiles);
  const financialFlagPopulationCounts = getFinancialFlagPopulationCounts(analysis.sourceFiles);

  return {
    companyName: analysis.companyName,
    processedAt: analysis.processedAt,
    totalFindings: analysis.totalFindings,
    highRiskItems: analysis.highRiskItems,
    mediumRiskItems: analysis.mediumRiskItems,
    lowRiskItems: analysis.lowRiskItems,
    complianceScore: analysis.complianceScore,
    pendingActionItems: analysis.pendingActionItems,
    remediationActionStatusCounts,
    financialFlagPopulationCounts,
    financialDiscrepancyFlags: analysis.financialDiscrepancyFlags,
    vendorRiskRating: analysis.vendorRiskRating,
    riskSummary: truncateText(analysis.riskSummary, 900),
    findings: analysis.findings.slice(0, 24).map((finding) => ({
      document: finding.document,
      finding: truncateText(finding.finding, 260),
      risk: finding.risk,
      owner: finding.owner,
      excerpt: truncateText(finding.excerpt, 420),
    })),
    recommendations: analysis.recommendations
      .slice(0, 6)
      .map((recommendation) => truncateText(recommendation, 300)),
    annotatedExcerpt: truncateText(analysis.annotatedExcerpt, 800),
    sourceFiles: analysis.sourceFiles.slice(0, 10).map(compactSourceFileForAgent),
  };
}



function compactSourceFileForAgent(file: ParsedAuditFile) {
  const isRemediationTracker = /remediation|action tracker/i.test(file.name);

  return {
    name: file.name,
    extension: file.extension,
    rowsDetected: file.rowsDetected,
    sizeLabel: file.sizeLabel,
    text: truncateText(file.text, isRemediationTracker ? 7000 : 1200),
  };
}



function buildAutoQuestion(context: ChatContext) {
  if (context.type === "kpi" && context.kpiTitle) {
    return `Analyze the "${context.kpiTitle}" card using only the uploaded audit documents and extracted dashboard evidence. Do not define the term generally. First determine what population this card is actually using from the uploaded evidence, then reconcile any conflicting values across source files, explain which value is best supported, cite the source evidence, and state the next action. If the dashboard value conflicts with the uploaded documents, say so clearly instead of forcing the numbers to match.`;
  }

  if (context.type === "finding" && context.finding) {
    return `Analyze this audit finding using only the uploaded document evidence. Explain what the finding says, what source evidence supports it, why the assigned risk level is or is not justified, and what ${context.finding.owner} should do next: ${context.finding.finding}`;
  }

  if (context.type === "recommendation" && context.recommendation) {
    return `Analyze this recommendation using only the uploaded audit documents and extracted findings. Explain which evidence supports it, which risks it addresses, whether it is sufficiently grounded, and how it should be turned into an action plan: ${context.recommendation}`;
  }

  if (context.type === "source" && context.sourceFile) {
    return `Analyze the uploaded source file "${context.sourceFile.name}". Explain what audit evidence it contributes, what claims or dashboard metrics it supports, what limitations it has, and what should be reviewed in the file.`;
  }

  if (context.type === "excerpt") {
    return "Analyze this extracted audit excerpt using the uploaded document context. Explain what claim it supports, what risk signal it contains, and what should be checked next.";
  }

  return "Analyze this audit view using only the uploaded document evidence. Summarize the key claims, supporting evidence, conflicts across sources, and recommended next steps.";
}




function getKpiFollowUpQuestions(
  kpiTitle: string,
  analysis?: AuditAnalysis,
  latestAnswer = "",
): KpiFollowUpQuestion[] {
  return buildAnswerAwareKpiFollowUps({
    kpiTitle,
    latestAnswer,
    analysis,
  });
}

function buildAnswerAwareKpiFollowUps({
  kpiTitle,
  latestAnswer,
  analysis,
}: {
  kpiTitle: string;
  latestAnswer?: string;
  analysis?: AuditAnalysis;
}): KpiFollowUpQuestion[] {
  const title = kpiTitle.toLowerCase();
  const answer = (latestAnswer || "").toLowerCase();
  const dashboardValue = analysis ? getDashboardValueForQuestion(kpiTitle, analysis) : "this value";
  const suggestions: KpiFollowUpQuestion[] = [];

  const addSuggestion = (label: string, question: string) => {
    const cleanLabel = truncateText(label.replace(/[?.:]+$/g, "").trim(), 18);
    const cleanQuestion = question.trim();

    if (!cleanLabel || cleanQuestion.length < 12) return;

    const duplicate = suggestions.some(
      (item) => item.label.toLowerCase() === cleanLabel.toLowerCase() || item.question.toLowerCase() === cleanQuestion.toLowerCase(),
    );

    if (!duplicate && suggestions.length < 3) {
      suggestions.push({ label: cleanLabel, question: cleanQuestion });
    }
  };

  const statusMatch = latestAnswer?.match(
    /Open\s+(\d+).*?In\s+Progress\s+(\d+).*?Overdue\s+(\d+).*?Closed\s+(\d+)/is,
  );

  if (statusMatch) {
    addSuggestion(
      "Status math",
      `Show the Pending Actions status calculation again using Open ${statusMatch[1]}, In Progress ${statusMatch[2]}, Overdue ${statusMatch[3]}, and Closed ${statusMatch[4]}. Explain which statuses are included and excluded.`,
    );
    addSuggestion(
      "Overdue first",
      `From the Pending Actions evidence, which overdue actions should be triaged first and what closure proof is required?`,
    );
  }

  if (answer.includes("conflict") || answer.includes("mismatch") || answer.includes("not supported") || answer.includes("different population")) {
    addSuggestion(
      "Resolve mismatch",
      `What exact source-population mismatch is affecting the ${kpiTitle} card, and how should the dashboard label or calculation be corrected?`,
    );
  }

  if (answer.includes("source") || answer.includes("evidence") || answer.includes("uploaded") || answer.includes("tracker")) {
    addSuggestion(
      "Best source",
      `Which uploaded source file is the strongest evidence for the ${kpiTitle} value, and what exact excerpt or table should I cite?`,
    );
  }

  if (title.includes("pending") || title.includes("action")) {
    addSuggestion(
      "Closure proof",
      "What closure evidence is required before these pending actions can be marked closed?",
    );
  } else if (title.includes("financial") || title.includes("flag")) {
    if (answer.includes("workbook") || answer.includes("pdf")) {
      addSuggestion(
        "Workbook vs PDF",
        "Reconcile the Financial Flags workbook/dashboard subset against the broader PDF financial-statement population and tell me which value the dashboard should show.",
      );
    } else {
      addSuggestion(
        "Flag scope",
        "What source population is Financial Flags using, and is it counting financial-statement rows, audit findings, or exception signals?",
      );
    }
  } else if (title.includes("compliance")) {
    addSuggestion(
      "Score formula",
      "What evidence explains the Compliance Score calculation, and does it come from control testing, checklist rows, or formal findings?",
    );
  } else if (title.includes("vendor")) {
    addSuggestion(
      "Vendor evidence",
      "Which vendor or procurement records support the Vendor Risk rating, and is the rating based on findings or signal patterns?",
    );
  } else if (title.includes("high") || title.includes("medium") || title.includes("low") || title.includes("total")) {
    addSuggestion(
      "Finding IDs",
      `Which distinct IA finding IDs support the ${kpiTitle} value of ${dashboardValue}?`,
    );
  }

  addSuggestion(
    "Why this value",
    `Why is the ${kpiTitle} card showing ${dashboardValue}, and what uploaded evidence supports that value?`,
  );

  addSuggestion(
    "Next audit step",
    `Based on the best-supported ${kpiTitle} value, what is the next audit action and who should own it?`,
  );

  return suggestions.slice(0, 3);
}



function buildFocusedEvidenceForAgent({
  question,
  context,
  analysis,
}: {
  question: string;
  context: ChatContext;
  analysis: AuditAnalysis;
}) {
  const focusedQuestion = `${question} ${context.topic} ${
    context.kpiTitle || ""
  } ${context.finding?.finding || ""} ${context.recommendation || ""} ${
    context.excerpt || ""
  }`;

  const evidence = retrieveRelevantEvidence(focusedQuestion, context, analysis);

  const reasoningContext = buildEvidenceFirstReasoningContext({
    question: focusedQuestion,
    context,
    analysis,
  });

  const clickedFindingEvidence = context.finding
    ? [
        {
          sourceName: context.finding.document,
          evidenceType: "Clicked finding from dashboard",
          risk: context.finding.risk,
          owner: context.finding.owner,
          snippet: context.finding.excerpt,
        },
      ]
    : [];

  const clickedSourceEvidence = context.sourceFile
    ? [
        {
          sourceName: context.sourceFile.name,
          evidenceType: "Clicked uploaded source file",
          risk: "N/A",
          owner: "N/A",
          snippet: truncateText(context.sourceFile.text, 1400),
        },
      ]
    : [];

  const clickedExcerptEvidence = context.excerpt
    ? [
        {
          sourceName: "Annotated excerpt",
          evidenceType: "Clicked excerpt",
          risk: "N/A",
          owner: "N/A",
          snippet: context.excerpt,
        },
      ]
    : [];

  const clickedKpiEvidence = context.kpiTitle
    ? buildKpiFocusedEvidence(context.kpiTitle, analysis)
    : [];

  const retrievedEvidence = evidence.map((item) => ({
    sourceName: item.sourceName,
    evidenceType: "Retrieved uploaded document evidence",
    risk: "N/A",
    owner: "N/A",
    snippet: item.snippet,
  }));

  return [
    reasoningContext,
    ...clickedKpiEvidence,
    ...clickedFindingEvidence,
    ...clickedSourceEvidence,
    ...clickedExcerptEvidence,
    ...retrievedEvidence,
  ]
    .filter((item) => item.snippet && item.snippet.trim().length > 0)
    .slice(0, 18)
    .map((item) => ({
      ...item,
      snippet: truncateText(item.snippet, 1200),
    }));
}


function buildEvidenceFirstReasoningContext({
  question,
  context,
  analysis,
}: {
  question: string;
  context: ChatContext;
  analysis: AuditAnalysis;
}) {
  const formalPopulation = summarizeFormalFindingPopulation(analysis.findings);
  const activeValue = context.kpiTitle ? getDashboardValueForQuestion(context.kpiTitle, analysis) : "No specific KPI value selected";
  const relevantSources = retrieveRelevantEvidence(question, context, analysis)
    .slice(0, 8)
    .map((item) => `${item.sourceName}: ${truncateText(item.snippet, 220)}`)
    .join(" || ");

  return {
    sourceName: "Generated reasoning instructions - not an uploaded source",
    evidenceType: "Evidence-first answer guardrail",
    risk: "N/A",
    owner: "N/A",
    snippet: [
      context.kpiTitle ? `Active KPI/card: ${context.kpiTitle}. Dashboard displayed value/label: ${activeValue}.` : `Active view: ${context.topic}.`,
      `Do not assume the dashboard value is automatically correct. Treat it as a computed claim that must be reconciled against uploaded source evidence.`,
      `Use uploaded source snippets as the source of truth. If source snippets conflict, explain each population separately instead of merging them.`,
      `Known dashboard formal-finding population from extracted findings: ${formalPopulation}. This is context, not proof for every card.`,
      `Relevant uploaded snippets retrieved for this question: ${relevantSources || "No strong snippets retrieved; answer should say direct evidence is limited."}`,
    ].join(" "),
  };
}

function getDashboardValueForQuestion(kpiTitle: string, analysis: AuditAnalysis): string {
  const title = kpiTitle.toLowerCase();

  if (title.includes("total")) return String(analysis.totalFindings);
  if (title.includes("high")) return String(analysis.highRiskItems);
  if (title.includes("medium")) return String(analysis.mediumRiskItems);
  if (title.includes("low")) return String(analysis.lowRiskItems);
  if (title.includes("compliance")) return `${analysis.complianceScore}%`;
  if (title.includes("pending") || title.includes("action")) return String(analysis.pendingActionItems);
  if (title.includes("financial") || title.includes("flag")) return String(analysis.financialDiscrepancyFlags);
  if (title.includes("vendor")) return analysis.vendorRiskRating;

  return "Unknown displayed value";
}


function generateAgentResponse(
  agentId: AgentId,
  context: ChatContext,
  question: string,
  analysis: AuditAnalysis
) {
  const answerData = buildContextAwareAnswer(context, question, analysis);

  if (agentId === "professional") {
    return `Executive summary: ${answerData.mainPoint}

Business impact: ${answerData.impact}

Recommended action: ${answerData.action}

Evidence to reference: ${answerData.evidence}`;
  }

  if (agentId === "friendly") {
    return `Here is the simple version: ${answerData.mainPoint}

Why it matters: ${answerData.impact}

What you should do next: ${answerData.action}

Where this came from: ${answerData.evidence}`;
  }

  if (agentId === "creative") {
    return `Audit signal: ${answerData.mainPoint}

Pattern I see: ${answerData.impact}

Best next move: ${answerData.action}

Breadcrumbs from the files: ${answerData.evidence}`;
  }

  return `Analytical view: ${answerData.mainPoint}

Risk logic: ${answerData.impact}

Recommended validation: ${answerData.action}

Supporting evidence: ${answerData.evidence}`;
}

function buildContextAwareAnswer(
  context: ChatContext,
  question: string,
  analysis: AuditAnalysis
) {
  const intent = detectFollowUpIntent(question);
  const evidence = retrieveRelevantEvidence(question, context, analysis);
  const focus = getFocusText(context, analysis);
  const evidenceText = formatEvidence(evidence);

  if (context.type === "kpi" && context.kpiTitle) {
    return buildKpiAnswer(context.kpiTitle, intent, analysis, evidenceText);
  }

  if (context.type === "finding" && context.finding) {
    return buildFindingAnswer(context.finding, intent, evidenceText);
  }

  if (context.type === "recommendation" && context.recommendation) {
    return buildRecommendationAnswer(
      context.recommendation,
      intent,
      analysis,
      evidenceText
    );
  }

  if (context.type === "source" && context.sourceFile) {
    return {
      mainPoint: `${context.sourceFile.name} contributed ${context.sourceFile.rowsDetected} extracted rows or lines and about ${context.sourceFile.sizeLabel} of text.`,
      impact: `The file supports themes related to ${summarizeDominantThemes(context.sourceFile.text)}.`,
      action:
        "Use this file as supporting evidence when discussing the related findings. Check whether the extracted rows support the risk rating and owner assignment.",
      evidence: evidenceText,
    };
  }

  if (context.type === "excerpt" && context.excerpt) {
    return {
      mainPoint:
        "The excerpt is direct evidence from the uploaded audit package.",
      impact:
        "It matters because it can be used in the meeting to show that the dashboard is grounded in the source documents, not only mock UI.",
      action:
        "Tie the excerpt to a finding, confirm the source document, and assign an owner for the related remediation.",
      evidence: `"${truncateText(context.excerpt, 180)}"`,
    };
  }

  if (intent === "evidence") {
    return {
      mainPoint: `The strongest evidence to check is connected to ${focus}.`,
      impact:
        "Evidence quality matters because it determines whether the finding can be defended in the audit review.",
      action:
        "Open the relevant source file, check the extracted excerpt, confirm the sampled record, and verify whether the control owner has supporting documentation.",
      evidence: evidenceText,
    };
  }

  if (intent === "mitigation") {
    return {
      mainPoint: `To mitigate the current audit risk, focus on ${focus}.`,
      impact:
        "The risk is important because unresolved findings can become repeat observations or control failures.",
      action:
        "Rank high-risk items first, assign named owners, request missing evidence, define due dates, and track closure status.",
      evidence: evidenceText,
    };
  }

  return {
    mainPoint: `The current audit package has ${analysis.totalFindings} findings: ${analysis.highRiskItems} high-risk, ${analysis.mediumRiskItems} medium-risk, and ${analysis.lowRiskItems} low-risk.`,
    impact: `The strongest theme is ${summarizeDominantThemesFromAnalysis(analysis)}, with a compliance score of ${analysis.complianceScore}% and ${analysis.vendorRiskRating} vendor risk.`,
    action:
      "Start with the high-risk findings, then review the source files and one recommendation that turns the finding into a remediation action.",
    evidence: evidenceText,
  };
}

function buildKpiAnswer(
  kpiTitle: string,
  intent: FollowUpIntent,
  analysis: AuditAnalysis,
  evidence: string
) {
  if (kpiTitle === "Vendor Risk") {
    if (intent === "mitigation") {
      return {
        mainPoint: `Vendor risk is rated ${analysis.vendorRiskRating}, so procurement controls need targeted review.`,
        impact:
          "The main exposure is incomplete approval evidence, weak purchase-order support, or missing approval trail for sampled vendors.",
        action:
          "Mitigate it by reviewing sampled vendor records, checking approval thresholds, confirming purchase-order support, assigning Procurement as owner, and requesting missing approval evidence.",
        evidence,
      };
    }

    if (intent === "evidence") {
      return {
        mainPoint:
          "For vendor risk, the evidence should come from vendor records, purchase orders, approval trails, and procurement exceptions.",
        impact:
          "Without that evidence, the team cannot prove that vendor onboarding or purchasing controls operated correctly.",
        action:
          "Check vendor/procurement files first, then compare sampled records against the approval policy and threshold requirements.",
        evidence,
      };
    }

    return {
      mainPoint: `Vendor risk is rated ${analysis.vendorRiskRating}.`,
      impact:
        "This means the package contains procurement or vendor-related signals that require review before the meeting.",
      action:
        "Focus on vendor approval evidence, purchase-order support, threshold approvals, and whether exceptions have named owners.",
      evidence,
    };
  }

  if (kpiTitle === "High Risk Items") {
    return {
      mainPoint: `There are ${analysis.highRiskItems} high-risk findings.`,
      impact:
        "High-risk findings should be handled first because they may involve missing evidence, financial exposure, vendor gaps, or control failures.",
      action:
        "Assign one owner per high-risk finding, request evidence, define due dates, and track remediation status.",
      evidence,
    };
  }

  if (kpiTitle === "Medium Risk Items") {
    return {
      mainPoint: `There are ${analysis.mediumRiskItems} medium-risk findings.`,
      impact:
        "Medium-risk items are not the first emergency, but they can become recurring findings if not tracked.",
      action:
        "Schedule follow-up testing and make sure each item has an owner and target date.",
      evidence,
    };
  }

  if (kpiTitle === "Low Risk Items") {
    return {
      mainPoint: `There are ${analysis.lowRiskItems} low-risk findings.`,
      impact:
        "Low-risk items are useful for trend monitoring and early control improvement.",
      action:
        "Track them periodically and look for repeat themes across departments or files.",
      evidence,
    };
  }

  if (kpiTitle === "Compliance Score") {
    return {
      mainPoint: `The compliance score is ${analysis.complianceScore}%.`,
      impact:
        "A score below 85% suggests that evidence quality, control documentation, or remediation tracking needs improvement.",
      action:
        "Improve documentation quality, attach supporting evidence, and make sure each open action has a clear owner.",
      evidence,
    };
  }

  if (kpiTitle === "Pending Actions") {
    return {
      mainPoint: `There are ${analysis.pendingActionItems} open remediation signals.`,
      impact:
        "Open actions create follow-up risk because issues may remain unresolved after the audit review.",
      action:
        "Create a remediation tracker with owner, due date, required evidence, and current status.",
      evidence,
    };
  }

  if (kpiTitle === "Financial Flags") {
    return {
      mainPoint: `There are ${analysis.financialDiscrepancyFlags} financial discrepancy signals.`,
      impact:
        "These flags may point to variance, reconciliation, ledger, or supporting-evidence issues.",
      action:
        "Review reconciliation evidence, variance explanations, ledger support, and closure status for exceptions.",
      evidence,
    };
  }

  return {
    mainPoint: `${kpiTitle} is part of the uploaded audit analysis.`,
    impact:
      "It should be interpreted together with detailed findings, recommendations, and source-file evidence.",
    action:
      "Open the related detailed finding or source file before making a final conclusion.",
    evidence,
  };
}

function buildFindingAnswer(
  finding: DetailFinding,
  intent: FollowUpIntent,
  evidence: string
) {
  if (intent === "mitigation") {
    return {
      mainPoint: `The finding is: "${finding.finding}"`,
      impact: `It is rated ${finding.risk}, and the likely owner is ${finding.owner}.`,
      action: `Mitigate it by confirming the root cause, asking ${finding.owner} for missing evidence, defining a due date, and testing whether the corrected control works.`,
      evidence,
    };
  }

  if (intent === "evidence") {
    return {
      mainPoint: `The evidence should support this finding: "${finding.finding}"`,
      impact:
        "The finding is only defensible if the source record, sample, or excerpt clearly supports it.",
      action: `Check ${finding.document}, validate the excerpt, and request supporting documentation from ${finding.owner}.`,
      evidence,
    };
  }

  return {
    mainPoint: `The finding is "${finding.finding}" from ${finding.document}.`,
    impact: `It is rated ${finding.risk}, which means it should be handled according to severity and business exposure.`,
    action: `The next action is to validate the excerpt, confirm the root cause, and ask ${finding.owner} for a remediation plan.`,
    evidence,
  };
}

function buildRecommendationAnswer(
  recommendation: string,
  intent: FollowUpIntent,
  analysis: AuditAnalysis,
  evidence: string
) {
  if (intent === "evidence") {
    return {
      mainPoint: `For this recommendation, the evidence should prove why the action is needed: "${recommendation}"`,
      impact:
        "Evidence is important because it connects the recommendation back to the uploaded files and the extracted findings.",
      action:
        "Collect the related source-file excerpts, link each one to a finding, and attach owner/date/status fields in the remediation tracker.",
      evidence,
    };
  }

  return {
    mainPoint: `The recommendation is: "${recommendation}"`,
    impact: `It connects to ${analysis.highRiskItems} high-risk findings, ${analysis.pendingActionItems} open action signals, and ${analysis.vendorRiskRating} vendor risk.`,
    action:
      "Turn it into an action plan: list related findings, assign named owners, set due dates, request evidence, and track closure status.",
    evidence,
  };
}

function detectFollowUpIntent(question: string): FollowUpIntent {
  const lowerQuestion = question.toLowerCase();

  if (
    /mitigate|fix|solve|reduce|handle|address|prevent|remediate|action/.test(
      lowerQuestion
    )
  ) {
    return "mitigation";
  }

  if (
    /evidence|check|verify|support|document|proof|source|file|record/.test(
      lowerQuestion
    )
  ) {
    return "evidence";
  }

  if (/owner|responsible|who|department|team/.test(lowerQuestion)) {
    return "owner";
  }

  if (/why|risk|high|medium|low|severity|impact|exposure/.test(lowerQuestion)) {
    return "risk";
  }

  if (/timeline|due|when|deadline|priority|prioritize/.test(lowerQuestion)) {
    return "timeline";
  }

  if (/summarize|summary|explain|what does|meaning/.test(lowerQuestion)) {
    return "summary";
  }

  return "generic";
}

function retrieveRelevantEvidence(
  question: string,
  context: ChatContext,
  analysis: AuditAnalysis
): EvidenceResult[] {
  const weightedQuery = `${question} ${context.topic} ${context.kpiTitle || ""} ${
    context.finding?.finding || ""
  } ${context.recommendation || ""} ${context.excerpt || ""}`;

  const keywords = extractSearchKeywords(weightedQuery);
  const candidates: EvidenceResult[] = [];

  analysis.sourceFiles.forEach((file) => {
    const snippets = findTopKeywordSnippets(file.text, keywords, 3);

    snippets.forEach((snippet, index) => {
      candidates.push({
        sourceName: file.name,
        snippet,
        score:
          scoreText(snippet, keywords) * 3 +
          scoreText(file.name, keywords) * 2 +
          Math.max(0, 3 - index),
      });
    });
  });

  analysis.findings.forEach((finding) => {
    const combinedFinding = `${finding.document}: ${finding.finding} ${finding.risk} ${finding.owner} ${finding.excerpt}`;

    candidates.push({
      sourceName: finding.document,
      snippet: combinedFinding,
      score:
        scoreText(combinedFinding, keywords) * 3 +
        (finding.risk === "High" ? 3 : finding.risk === "Medium" ? 2 : 1),
    });
  });

  if (context.finding) {
    candidates.push({
      sourceName: context.finding.document,
      snippet: context.finding.excerpt,
      score: 80,
    });
  }

  if (context.sourceFile) {
    const snippets = findTopKeywordSnippets(context.sourceFile.text, keywords, 4);
    (snippets.length ? snippets : [firstMeaningfulExcerpt(context.sourceFile.text) || `${context.sourceFile.name} was processed as a source file.`])
      .filter(Boolean)
      .forEach((snippet, index) => {
        candidates.push({
          sourceName: context.sourceFile!.name,
          snippet,
          score: 90 - index,
        });
      });
  }

  if (context.excerpt) {
    candidates.push({
      sourceName: "Annotated Excerpt",
      snippet: context.excerpt,
      score: 90,
    });
  }

  const seen = new Set<string>();

  return candidates
    .filter((candidate) => candidate.snippet.length > 0)
    .sort((a, b) => b.score - a.score)
    .filter((candidate) => {
      const key = `${candidate.sourceName}:${candidate.snippet.slice(0, 120)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 14);
}



function extractSearchKeywords(text: string) {
  const stopWords = new Set([
    "what",
    "does",
    "mean",
    "should",
    "this",
    "that",
    "with",
    "from",
    "about",
    "into",
    "tell",
    "next",
    "audit",
    "agent",
    "question",
    "current",
    "review",
    "explain",
    "please",
    "need",
    "make",
    "sure",
    "using",
    "uploaded",
    "documents",
    "evidence",
    "dashboard",
    "card",
    "analyze",
  ]);

  const lower = cleanText(text).toLowerCase();

  const words = lower
    .replace(/[^a-z0-9.%\- ]/g, " ")
    .split(" ")
    .filter((word) => word.length > 2 && !stopWords.has(word));

  const phraseBoosts = [
    "formal finding",
    "finding id",
    "ia-",
    "risk summary",
    "chart data",
    "dashboard summary",
    "control testing",
    "compliance score",
    "financial statements",
    "audit note",
    "remediation",
    "action tracker",
    "vendor",
    "procurement",
    "inventory",
    "reconciliation",
    "revenue",
    "treasury",
    "financial close",
    "owner",
    "status",
    "high",
    "medium",
    "low",
    "q1",
    "q2",
    "q3",
    "q4",
  ].filter((phrase) => lower.includes(phrase));

  return Array.from(new Set([...phraseBoosts, ...words])).slice(0, 24);
}



function findBestKeywordSnippet(text: string, keywords: string[]) {
  return findTopKeywordSnippets(text, keywords, 1)[0] || "";
}

function findTopKeywordSnippets(text: string, keywords: string[], limit = 3) {
  const lines = text
    .split(/\n|\. /)
    .map((line) => cleanText(line))
    .filter((line) => line.length > 24)
    .filter((line) => !isHeaderLikeLine(line));

  if (lines.length === 0) {
    return [];
  }

  if (keywords.length === 0) {
    return lines.slice(0, limit).map((line) => truncateText(line, 420));
  }

  const scoredLines = lines
    .map((line, index) => {
      const numberBoost = /\b\d+(?:\.\d+)?%?\b/.test(line) ? 2 : 0;
      const auditIdBoost = /\bIA[-\s]?\d{2,4}(?:[-\s]?\d{2,4})?\b/i.test(line) ? 3 : 0;
      const severityBoost = /\b(high|medium|low|overdue|open|closed|in progress|pass|fail|partial|not tested)\b/i.test(line) ? 2 : 0;

      return {
        line,
        index,
        score: scoreText(line, keywords) * 3 + numberBoost + auditIdBoost + severityBoost,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const snippets: string[] = [];
  const seen = new Set<string>();

  for (const item of scoredLines) {
    const key = item.line.slice(0, 120).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    snippets.push(truncateText(item.line, 520));
    if (snippets.length >= limit) break;
  }

  return snippets;
}



function scoreText(text: string, keywords: string[]) {
  const lowerText = text.toLowerCase();

  return keywords.reduce((score, keyword) => {
    if (lowerText.includes(keyword)) {
      return score + 1;
    }

    return score;
  }, 0);
}

function formatEvidence(evidence: EvidenceResult[]) {
  if (evidence.length === 0) {
    return "No exact source snippet matched the follow-up, so use the extracted findings and source files as supporting context.";
  }

  return evidence
    .map(
      (item, index) =>
        `${index + 1}. ${item.sourceName}: "${truncateText(item.snippet, 150)}"`
    )
    .join("\n");
}

function getFocusText(context: ChatContext, analysis: AuditAnalysis) {
  if (context.finding) {
    return `${context.finding.finding} owned by ${context.finding.owner}`;
  }

  if (context.recommendation) {
    return context.recommendation;
  }

  if (context.kpiTitle) {
    return context.kpiTitle;
  }

  if (context.sourceFile) {
    return context.sourceFile.name;
  }

  return `${analysis.highRiskItems} high-risk findings and ${analysis.pendingActionItems} open action signals`;
}

async function parseZipEntry(
  zipEntry: JSZip.JSZipObject,
  extension: string
): Promise<ParsedAuditFile> {
  if (extension === "txt" || extension === "csv") {
    const text = await zipEntry.async("text");

    return {
      name: readableFileName(zipEntry.name),
      extension,
      text,
      rowsDetected: countRows(text),
      sizeLabel: formatTextSize(text.length),
    };
  }

  if (extension === "docx") {
    const arrayBuffer = await zipEntry.async("arraybuffer");
    const result = await mammoth.extractRawText({ arrayBuffer });

    return {
      name: readableFileName(zipEntry.name),
      extension,
      text: result.value,
      rowsDetected: countRows(result.value),
      sizeLabel: formatTextSize(result.value.length),
    };
  }

  if (extension === "xlsx") {
    const arrayBuffer = await zipEntry.async("arraybuffer");
    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    const sheetTexts = workbook.SheetNames.map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      return `Sheet: ${sheetName}\n${csv}`;
    });

    const text = sheetTexts.join("\n\n");

    return {
      name: readableFileName(zipEntry.name),
      extension,
      text,
      rowsDetected: countRows(text),
      sizeLabel: formatTextSize(text.length),
    };
  }

  if (extension === "pdf") {
    const arrayBuffer = await zipEntry.async("arraybuffer");
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
    }).promise;

    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");

      pageTexts.push(pageText);
    }

    const text = pageTexts.join("\n\n");

    return {
      name: readableFileName(zipEntry.name),
      extension,
      text,
      rowsDetected: countRows(text),
      sizeLabel: formatTextSize(text.length),
    };
  }

  return {
    name: readableFileName(zipEntry.name),
    extension,
    text: "",
    rowsDetected: 0,
    sizeLabel: "0 characters",
  };
}

type AuditDocumentType =
  | "vendor"
  | "compliance"
  | "risk"
  | "internalAudit"
  | "inventory"
  | "financial"
  | "general";

type AuditRule = {
  id: string;
  documentTypes: Array<AuditDocumentType | "any">;
  risk: RiskLevel;
  owner: string;
  finding: string;
  patterns: RegExp[];
};

const auditRules: AuditRule[] = [
  {
    id: "vendor-missing-approval",
    documentTypes: ["vendor", "any"],
    risk: "High",
    owner: "Procurement",
    finding: "Vendor approval evidence is incomplete or missing.",
    patterns: [
      /\b(approval|approved|approver).{0,70}\b(missing|incomplete|not available|not documented|absent|exception)\b/i,
      /\b(missing|incomplete|absent).{0,70}\b(approval|approver|purchase order|po)\b/i,
      /\bvendor.{0,80}\b(no approval|without approval|approval gap)\b/i,
    ],
  },
  {
    id: "vendor-high-risk",
    documentTypes: ["vendor", "risk", "any"],
    risk: "High",
    owner: "Procurement",
    finding: "High-risk vendor or procurement exposure requires immediate review.",
    patterns: [
      /\b(high|critical).{0,50}\b(vendor|supplier|procurement|purchase order|po)\b/i,
      /\b(vendor|supplier|procurement).{0,60}\b(high risk|critical|material)\b/i,
      /\b(single source|sole source|concentration|restricted supplier)\b/i,
    ],
  },
  {
    id: "vendor-missing-documentation",
    documentTypes: ["vendor", "any"],
    risk: "Medium",
    owner: "Procurement",
    finding: "Procurement documentation is incomplete or requires follow-up.",
    patterns: [
      /\b(invoice|purchase order|po|contract|vendor file).{0,70}\b(missing|incomplete|not provided|unsupported)\b/i,
      /\b(procurement|vendor).{0,80}\b(documentation|supporting evidence|file).{0,50}\b(incomplete|missing|unsupported)\b/i,
    ],
  },
  {
    id: "compliance-failed-control",
    documentTypes: ["compliance", "internalAudit", "any"],
    risk: "High",
    owner: "Compliance",
    finding: "A control or compliance requirement failed or is non-compliant.",
    patterns: [
      /\b(fail|failed|non-compliant|not compliant|control failure|control gap)\b/i,
      /\b(requirement|policy|control).{0,70}\b(failed|not met|non-compliant|exception)\b/i,
    ],
  },
  {
    id: "compliance-missing-evidence",
    documentTypes: ["compliance", "internalAudit", "any"],
    risk: "Medium",
    owner: "Compliance",
    finding: "Compliance evidence is missing, incomplete, or partially documented.",
    patterns: [
      /\b(evidence|documentation|support).{0,70}\b(missing|incomplete|partial|not attached|not provided)\b/i,
      /\b(partial|partially compliant|needs improvement|in progress)\b/i,
    ],
  },
  {
    id: "risk-high-impact",
    documentTypes: ["risk", "internalAudit", "any"],
    risk: "High",
    owner: "Risk Management",
    finding: "High-impact or high-likelihood risk requires priority mitigation.",
    patterns: [
      /\b(high|critical).{0,50}\b(impact|likelihood|residual risk|inherent risk)\b/i,
      /\b(residual risk|inherent risk).{0,50}\b(high|critical)\b/i,
      /\b(high impact|high likelihood|critical risk)\b/i,
    ],
  },
  {
    id: "risk-weak-mitigation",
    documentTypes: ["risk", "internalAudit", "any"],
    risk: "Medium",
    owner: "Risk Management",
    finding: "Risk mitigation appears weak, incomplete, or not fully assigned.",
    patterns: [
      /\b(mitigation|control response|action plan).{0,80}\b(weak|incomplete|missing|not assigned|pending)\b/i,
      /\b(owner|responsible party).{0,60}\b(missing|not assigned|tbd|pending)\b/i,
    ],
  },
  {
    id: "finance-variance",
    documentTypes: ["financial", "internalAudit", "any"],
    risk: "High",
    owner: "Finance",
    finding: "Financial variance, discrepancy, or unsupported balance requires review.",
    patterns: [
      /\b(variance|discrepancy|mismatch|unreconciled|reconciliation exception)\b/i,
      /\b(unsupported|unexplained).{0,50}\b(balance|amount|expense|revenue|cash|invoice)\b/i,
      /\b(financial|ledger|invoice|revenue|expense).{0,80}\b(variance|mismatch|discrepancy|exception)\b/i,
    ],
  },
  {
    id: "inventory-ledger-mismatch",
    documentTypes: ["inventory", "financial", "any"],
    risk: "High",
    owner: "Operations",
    finding: "Inventory count does not align with ledger or system records.",
    patterns: [
      /\b(inventory|stock|warehouse|physical count).{0,80}\b(mismatch|variance|shortage|overage|ledger difference)\b/i,
      /\b(ledger|system quantity).{0,80}\b(mismatch|variance|does not match|difference)\b/i,
      /\b(shrinkage|negative quantity|stock variance)\b/i,
    ],
  },
  {
    id: "overdue-remediation",
    documentTypes: ["internalAudit", "compliance", "risk", "any"],
    risk: "Medium",
    owner: "Internal Audit",
    finding: "Remediation action is pending, overdue, or unresolved.",
    patterns: [
      /\b(overdue|past due|unresolved|pending|open action|not completed|action required)\b/i,
      /\b(remediation|corrective action|management action).{0,80}\b(pending|overdue|open|not complete|unresolved)\b/i,
    ],
  },
  {
    id: "audit-exception",
    documentTypes: ["internalAudit", "any"],
    risk: "Medium",
    owner: "Internal Audit",
    finding: "Audit exception or control observation requires management follow-up.",
    patterns: [
      /\b(audit exception|exception noted|observation|control weakness|deficiency)\b/i,
      /\b(finding|issue).{0,60}\b(open|requires review|management response|corrective action)\b/i,
    ],
  },
];

function analyzeAuditFiles(parsedFiles: ParsedAuditFile[]): AuditAnalysis {
  const allText = parsedFiles.map((file) => file.text).join("\n\n");
  const companyName = extractCompanyName(allText, parsedFiles);

  const canonicalFindings = extractCanonicalAuditFindings(parsedFiles);
  const findings = canonicalFindings.length > 0 ? canonicalFindings : extractFindings(parsedFiles);

  const highRiskItems = findings.filter(
    (finding) => finding.risk === "High"
  ).length;

  const mediumRiskItems = findings.filter(
    (finding) => finding.risk === "Medium"
  ).length;

  const lowRiskItems = findings.filter(
    (finding) => finding.risk === "Low"
  ).length;

  const pendingActionItems = calculatePendingActionItems(parsedFiles, findings);
  const financialDiscrepancyFlags = calculateFinancialFlags(parsedFiles, findings);
  const complianceScore =
    extractControlTestingDashboardScore(allText) ||
    extractComplianceScore(allText) ||
    calculateEvidenceBasedComplianceScore(allText, findings);

  const vendorRiskRating = calculateVendorRiskRating(parsedFiles, findings);

  const totalFindings = findings.length;

  const riskSummary = buildEvidenceRiskSummary({
    totalFindings,
    highRiskItems,
    mediumRiskItems,
    lowRiskItems,
    allText,
    findings,
    sourceFileCount: parsedFiles.length,
  });

  const recommendations = buildRecommendations({
    highRiskItems,
    mediumRiskItems,
    complianceScore,
    pendingActionItems,
    financialDiscrepancyFlags,
    vendorRiskRating,
    findings,
  });

  const annotatedExcerpt =
    findings.find((finding) => finding.risk === "High")?.excerpt ||
    findings.find((finding) => finding.risk === "Medium")?.excerpt ||
    findings[0]?.excerpt ||
    firstMeaningfulExcerpt(allText) ||
    "The uploaded files were processed, but no strong audit exception excerpt was detected.";

  return {
    companyName,
    processedAt: new Date().toLocaleString(),
    sourceFiles: parsedFiles,
    totalFindings,
    highRiskItems,
    mediumRiskItems,
    lowRiskItems,
    complianceScore,
    pendingActionItems,
    financialDiscrepancyFlags,
    vendorRiskRating,
    riskSummary,
    findings,
    recommendations,
    annotatedExcerpt,
  };
}


function extractCanonicalAuditFindings(parsedFiles: ParsedAuditFile[]): DetailFinding[] {
  const findingsById = new Map<string, DetailFinding>();

  const formalSourceFiles = parsedFiles.filter((file) => isFormalAuditFindingSource(file));
  const filesToScan = formalSourceFiles.length > 0 ? formalSourceFiles : parsedFiles.filter((file) => !isSupportingSignalOnlySource(file.name));

  const saveFinding = (finding: DetailFinding) => {
    const findingId = finding.findingId;

    if (!findingId) {
      return;
    }

    const existing = findingsById.get(findingId);

    if (!existing) {
      findingsById.set(findingId, finding);
      return;
    }

    const existingHasStatus = /Status:/i.test(existing.excerpt);
    const newHasStatus = /Status:/i.test(finding.excerpt);

    if (!existingHasStatus && newHasStatus) {
      const statusMatch = finding.excerpt.match(/Status: [^|]+/i);
      const mergedExcerpt = statusMatch
        ? `${existing.excerpt} | ${statusMatch[0]}`
        : existing.excerpt;

      findingsById.set(findingId, {
        ...existing,
        excerpt: truncateText(mergedExcerpt, 360),
      });

      return;
    }

    const existingScore = scoreCanonicalFindingQuality(existing);
    const newScore = scoreCanonicalFindingQuality(finding);

    if (newScore > existingScore) {
      findingsById.set(findingId, finding);
    }
  };

  filesToScan.forEach((file) => {
    const fileName = readableFileName(file.name);
    const isRemediationTracker = /remediation|action tracker/i.test(file.name);

    const lines = file.text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => /\bIA(?:-\d{4})?-\d{3}\b/i.test(line));

    lines.forEach((line) => {
      const cells = parseCsvLikeLine(line);
      const idMatch = line.match(/\bIA(?:-\d{4})?-\d{3}\b/i);

      if (!idMatch) {
        return;
      }

      const findingId = idMatch[0].toUpperCase();
      const idIndex = cells.findIndex((cell) => /\bIA(?:-\d{4})?-\d{3}\b/i.test(cell));
      const safeIdIndex = idIndex >= 0 ? idIndex : 0;

      const risk = pickRiskLevel([
        cells[safeIdIndex + 1],
        cells[safeIdIndex + 2],
        cells[safeIdIndex + 3],
        cells[safeIdIndex + 4],
        line,
      ]);

      if (!risk) {
        return;
      }

      const owner = isRemediationTracker
        ? pickRemediationOwnerCandidate(cells, safeIdIndex, file.name, line)
        : pickOwnerCandidate(cells, safeIdIndex, file.name, line);
      const findingText = pickFindingTextCandidate(cells, safeIdIndex, isRemediationTracker);
      const statusText = pickStatusCandidate(cells, safeIdIndex);
      const categoryText = cleanText(isRemediationTracker ? (cells[safeIdIndex + 3] || cells[safeIdIndex + 2] || "Remediation action") : (cells[safeIdIndex + 1] || "Audit finding"));
      const excerptParts = [findingId, categoryText, risk, owner, findingText];

      if (statusText) {
        excerptParts.push(`Status: ${statusText}`);
      }

      saveFinding({
        findingId,
        document: fileName,
        finding: findingText || `Formal audit finding ${findingId} requires review.`,
        risk,
        owner,
        excerpt: truncateText(excerptParts.filter(Boolean).join(" | "), 320),
      });
    });
  });

  return Array.from(findingsById.values()).sort((a, b) => {
    return (a.findingId || "").localeCompare(b.findingId || "", undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}


function normalizeFileNameForMatching(fileName: string): string {
  return fileName.toLowerCase().replace(/[_\-]+/g, " ");
}

function isFormalAuditFindingSource(file: ParsedAuditFile): boolean {
  const name = normalizeFileNameForMatching(file.name);

  if (isSupportingSignalOnlySource(name)) {
    return false;
  }

  return /detailed findings|evidence index|internal audit report|student audit report|audit report|remediation action tracker|remediation tracker/i.test(name);
}

function isSupportingSignalOnlySource(fileName: string): boolean {
  const name = normalizeFileNameForMatching(fileName);

  return /compliance checklist|risk assessment matrix|risk matrix|vendor|procurement records|inventory|financial statements|financials risk matrix|workbook|general ledger/i.test(name);
}

function pickRiskLevel(candidates: Array<string | undefined>): RiskLevel | null {
  for (const candidate of candidates) {
    if (!candidate) continue;

    const trimmed = cleanText(candidate);

    if (/^high$/i.test(trimmed) || /\bhigh\s*risk\b/i.test(trimmed)) return "High";
    if (/^medium$/i.test(trimmed) || /\bmedium\s*risk\b/i.test(trimmed)) return "Medium";
    if (/^low$/i.test(trimmed) || /\blow\s*risk\b/i.test(trimmed)) return "Low";
  }

  return null;
}

function pickOwnerCandidate(cells: string[], idIndex: number, fileName: string, line: string): string {
  const candidates = [
    // Common formal finding layout:
    // Finding ID, Process, Risk, Owner, Location, Finding, Root Cause, Evidence, Remediation, Due Date, Status
    cells[idIndex + 3],
    cells[idIndex + 4],
    cells[idIndex + 1],
    cells[idIndex + 2],
  ]
    .map((cell) => cleanText(cell || ""))
    .filter((cell) => {
      if (!cell) return false;
      if (pickRiskLevel([cell])) return false;
      if (/^IA(?:-\d{4})?-\d{3}$/i.test(cell)) return false;
      if (/^ACT-/i.test(cell)) return false;
      if (/^\d{4}-\d{2}-\d{2}$/.test(cell)) return false;
      if (/^(open|closed|overdue|in progress|pending)$/i.test(cell)) return false;
      if (cell.length > 45) return false;
      return true;
    });

  return candidates[0] || inferOwner(fileName, line);
}


function pickRemediationOwnerCandidate(cells: string[], idIndex: number, fileName: string, line: string): string {
  const candidates = [
    // Common remediation tracker layout:
    // Action ID, Finding ID, Owner, Action Description, Priority, Target Date, Status
    cells[idIndex + 1],
    cells[idIndex + 2],
    cells[idIndex + 3],
    cells[idIndex + 4],
  ]
    .map((cell) => cleanText(cell || ""))
    .filter((cell) => {
      if (!cell) return false;
      if (pickRiskLevel([cell])) return false;
      if (/^IA(?:-\d{4})?-\d{3}$/i.test(cell)) return false;
      if (/^ACT-/i.test(cell)) return false;
      if (/^\d{4}-\d{2}-\d{2}$/.test(cell)) return false;
      if (/^(open|closed|overdue|in progress|pending)$/i.test(cell)) return false;
      if (cell.length > 45) return false;
      return true;
    });

  return candidates[0] || inferOwner(fileName, line);
}

function pickFindingTextCandidate(cells: string[], idIndex: number, isRemediationTracker: boolean): string {
  const preferredIndexes = isRemediationTracker
    ? [idIndex + 6, idIndex + 5, idIndex + 3, idIndex + 2]
    : [idIndex + 5, idIndex + 6, idIndex + 7, idIndex + 4];

  const preferred = preferredIndexes
    .map((index) => cleanText(cells[index] || ""))
    .find((cell) => isUsefulFindingText(cell));

  if (preferred) {
    return preferred;
  }

  const fallback = cells
    .slice(idIndex + 1)
    .map((cell) => cleanText(cell || ""))
    .filter(isUsefulFindingText)
    .sort((a, b) => b.length - a.length)[0];

  return fallback || "Formal audit finding requires review.";
}

function isUsefulFindingText(cell: string): boolean {
  if (!cell) return false;
  if (pickRiskLevel([cell])) return false;
  if (/^IA(?:-\d{4})?-\d{3}$/i.test(cell)) return false;
  if (/^ACT-/i.test(cell)) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(cell)) return false;
  if (/^(open|closed|overdue|in progress|pending)$/i.test(cell)) return false;
  return cell.length >= 24;
}

function pickStatusCandidate(cells: string[], idIndex: number): string {
  const status = cells
    .slice(idIndex + 1, idIndex + 8)
    .map((cell) => cleanText(cell || ""))
    .find((cell) => /^(open|closed|overdue|in progress|pending)$/i.test(cell));

  return status || "";
}

function scoreCanonicalFindingQuality(finding: DetailFinding) {
  let score = 0;

  if (finding.findingId) score += 3;
  if (!/formal audit finding/i.test(finding.finding)) score += 3;
  if (finding.excerpt.length > 80) score += 2;
  if (/internal audit|detailed findings|evidence index|risk matrix/i.test(finding.document)) score += 2;
  if (/remediation/i.test(finding.document)) score += 1;

  return score;
}

function parseRiskLevel(value: string): RiskLevel | null {
  if (/\bhigh\b/i.test(value)) return "High";
  if (/\bmedium\b/i.test(value)) return "Medium";
  if (/\blow\b/i.test(value)) return "Low";
  return null;
}

function parseCsvLikeLine(line: string): string[] {
  const trimmed = line.trim();

  // Markdown tables from backend extraction use pipes. Some cells contain commas,
  // so pipe rows must be split before CSV commas. This is important for full-row
  // KPI counts such as the Remediation Action Tracker.
  if (trimmed.includes("|") && /^\|/.test(trimmed)) {
    return trimmed
      .split("|")
      .map((cell) => cleanText(cell))
      .filter(Boolean);
  }

  if (trimmed.includes("\t") && !trimmed.includes(",")) {
    return trimmed.split("\t").map((cell) => cleanText(cell));
  }

  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(cleanText(current));
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(cleanText(current));

  if (cells.length <= 1 && trimmed.includes("\t")) {
    return trimmed.split("\t").map((cell) => cleanText(cell));
  }

  if (cells.length <= 1 && trimmed.includes("|")) {
    return trimmed
      .split("|")
      .map((cell) => cleanText(cell))
      .filter(Boolean);
  }

  return cells;
}


function extractControlTestingDashboardScore(text: string) {
  const dashboardEvidence = getControlTestingDashboardEvidenceFromText(text);

  if (dashboardEvidence.currentScore !== null) {
    return dashboardEvidence.currentScore;
  }

  return null;
}

type ControlTestingDashboardEvidence = {
  currentQuarter: string | null;
  currentScore: number | null;
  currentEvidenceCompleteness: number | null;
  quarterSummary: string;
};

function getControlTestingDashboardEvidenceFromText(text: string): ControlTestingDashboardEvidence {
  const lines = text
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);

  const rows: Array<{
    label: string;
    score: number;
    evidenceCompleteness: number | null;
    sourceText: string;
  }> = [];

  const addRow = (
    label: string,
    score: number,
    evidenceCompleteness: number | null,
    sourceText: string
  ) => {
    if (score < 0 || score > 100) {
      return;
    }

    const normalizedLabel = cleanText(label || "Uploaded score row");
    const normalizedSource = cleanText(sourceText);
    const duplicate = rows.some(
      (row) => row.label === normalizedLabel && row.score === score
    );

    if (!duplicate) {
      rows.push({
        label: normalizedLabel,
        score,
        evidenceCompleteness:
          evidenceCompleteness !== null && evidenceCompleteness >= 0 && evidenceCompleteness <= 100
            ? evidenceCompleteness
            : null,
        sourceText: normalizedSource,
      });
    }
  };

  const getContext = (index: number) =>
    lines.slice(Math.max(0, index - 24), Math.min(lines.length, index + 10)).join(" ");

  const hasScoreContext = (context: string) =>
    /compliance score|control testing|control dashboard|testing dashboard|evidence completeness|control effectiveness|compliance dashboard/i.test(context);

  // Case 1: table rows where one line contains the period/quarter and the percentages.
  // Example: Q4 81% 82% Some remediation completed.
  lines.forEach((line, index) => {
    const context = getContext(index);

    if (!hasScoreContext(`${context} ${line}`)) {
      return;
    }

    const periodMatch = line.match(/\b(Q[1-4]|FY\s*\d{2,4}|20\d{2}|\d{4}[-/]\d{1,2})\b/i);
    const percentages = Array.from(line.matchAll(/(\d{1,3})\s*%/g)).map((match) => Number(match[1]));

    if (periodMatch && percentages.length >= 1) {
      addRow(
        periodMatch[1].toUpperCase().replace(/\s+/g, ""),
        percentages[0],
        percentages.length >= 2 ? percentages[1] : null,
        line
      );
    }
  });

  // Case 2: extracted PDF text where a row is split across lines.
  // Example: Q4 / 81% / 82% / Some remediation completed.
  lines.forEach((line, index) => {
    const periodMatch = line.match(/^\s*(Q[1-4]|FY\s*\d{2,4}|20\d{2})\s*$/i);

    if (!periodMatch) {
      return;
    }

    const context = getContext(index);

    if (!hasScoreContext(context)) {
      return;
    }

    const nextWindow = lines.slice(index + 1, index + 6);
    const percentages = nextWindow
      .map((candidate) => candidate.match(/^(\d{1,3})\s*%$/))
      .filter(Boolean)
      .map((match) => Number(match?.[1]));

    if (percentages.length >= 1) {
      addRow(
        periodMatch[1].toUpperCase().replace(/\s+/g, ""),
        percentages[0],
        percentages.length >= 2 ? percentages[1] : null,
        [line, ...nextWindow.slice(0, 4)].join(" | ")
      );
    }
  });

  // Case 3: sentence-style evidence.
  // Example: latest compliance score is 81%.
  const sentencePattern = /(?:current|latest|overall|dashboard|reported)?\s*(?:compliance score|control effectiveness score|control testing score)[^0-9%]{0,50}(\d{1,3})\s*%/gi;
  let sentenceMatch: RegExpExecArray | null;

  while ((sentenceMatch = sentencePattern.exec(text)) !== null) {
    const score = Number(sentenceMatch[1]);
    addRow("Explicit compliance score", score, null, sentenceMatch[0]);
  }

  if (rows.length === 0) {
    return {
      currentQuarter: null,
      currentScore: null,
      currentEvidenceCompleteness: null,
      quarterSummary: "No explicit compliance-score row was detected in the uploaded extraction output.",
    };
  }

  const rankLabel = (label: string) => {
    const quarterMatch = label.match(/^Q([1-4])$/i);
    if (quarterMatch) return 100 + Number(quarterMatch[1]);

    const yearMatch = label.match(/20\d{2}/);
    if (yearMatch) return Number(yearMatch[0]);

    return 0;
  };

  const latest = rows
    .slice()
    .sort((a, b) => rankLabel(b.label) - rankLabel(a.label))[0];

  const quarterSummary = rows
    .slice()
    .sort((a, b) => rankLabel(a.label) - rankLabel(b.label))
    .map((row) =>
      row.evidenceCompleteness !== null
        ? `${row.label}: ${row.score}% score / ${row.evidenceCompleteness}% evidence completeness`
        : `${row.label}: ${row.score}% score`
    )
    .join("; ");

  return {
    currentQuarter: latest.label,
    currentScore: latest.score,
    currentEvidenceCompleteness: latest.evidenceCompleteness,
    quarterSummary,
  };
}

function buildComplianceScoreReconciliationNote(sourceFiles: ParsedAuditFile[], complianceScore: number): string {
  const allText = sourceFiles.map((file) => file.text).join("\n\n");
  const scoreEvidence = getControlTestingDashboardEvidenceFromText(allText);
  const checklistCounts = countComplianceChecklistResults(sourceFiles);
  const formalComplianceCounts = countFormalComplianceFindings(sourceFiles);

  const notes: string[] = [];

  if (scoreEvidence.currentScore !== null) {
    notes.push(
      `The uploaded files contain an explicit compliance-score source row supporting the current score as ${scoreEvidence.currentQuarter} ${scoreEvidence.currentScore}%` +
        (scoreEvidence.currentEvidenceCompleteness !== null
          ? ` with ${scoreEvidence.currentEvidenceCompleteness}% evidence completeness`
          : "") +
        `. Detected score rows: ${scoreEvidence.quarterSummary}.`
    );
  } else {
    notes.push(`No explicit compliance-score source row was detected, so the displayed ${complianceScore}% score should be treated as calculated/estimated from the uploaded evidence rather than a directly reported dashboard value.`);
  }

  if (checklistCounts.total > 0) {
    notes.push(
      `The uploaded checklist/control-test population is separate from the compliance-score formula unless the file explicitly defines that formula: ${checklistCounts.total} tests (${checklistCounts.pass} Pass, ${checklistCounts.fail} Fail, ${checklistCounts.partial} Partial, ${checklistCounts.notTested} Not Tested).`
    );
  }

  if (formalComplianceCounts.total > 0) {
    notes.push(
      `Formal compliance findings are also separate from the score: ${formalComplianceCounts.total} Compliance-related formal findings (${formalComplianceCounts.high} High, ${formalComplianceCounts.medium} Medium, ${formalComplianceCounts.low} Low). These support risk context but do not mathematically create the score unless the uploaded file says so.`
    );
  }

  return notes.join(" ");
}

function countComplianceChecklistResults(sourceFiles: ParsedAuditFile[]) {
  const counts = {
    total: 0,
    pass: 0,
    fail: 0,
    partial: 0,
    notTested: 0,
  };

  sourceFiles
    .filter((file) => /compliance.*checklist|checklist.*compliance/i.test(file.name))
    .forEach((file) => {
      file.text.split(/\r?\n/).forEach((line) => {
        if (!/CTRL-\d{2}-\d{2}/i.test(line)) {
          return;
        }

        const cells = parseCsvLikeLine(line).map((cell) => cleanText(cell));
        const result = cells.find((cell) => /^(Pass|Fail|Partial|Not Tested)$/i.test(cell));

        if (!result) {
          return;
        }

        counts.total += 1;

        if (/^Pass$/i.test(result)) counts.pass += 1;
        if (/^Fail$/i.test(result)) counts.fail += 1;
        if (/^Partial$/i.test(result)) counts.partial += 1;
        if (/^Not Tested$/i.test(result)) counts.notTested += 1;
      });
    });

  return counts;
}

function countFormalComplianceFindings(sourceFiles: ParsedAuditFile[]) {
  const counts = {
    total: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  const seen = new Set<string>();

  sourceFiles
    .filter((file) => isFormalAuditFindingSource(file))
    .forEach((file) => {
      file.text.split(/\r?\n/).forEach((line) => {
        if (!/\bIA(?:-\d{4})?-\d{3}\b/i.test(line) || !/Compliance/i.test(line)) {
          return;
        }

        const idMatch = line.match(/\bIA(?:-\d{4})?-\d{3}\b/i);
        const findingId = idMatch?.[0].toUpperCase();

        if (!findingId || seen.has(findingId)) {
          return;
        }

        const risk = pickRiskLevel(parseCsvLikeLine(line));

        if (!risk) {
          return;
        }

        seen.add(findingId);
        counts.total += 1;

        if (risk === "High") counts.high += 1;
        if (risk === "Medium") counts.medium += 1;
        if (risk === "Low") counts.low += 1;
      });
    });

  return counts;
}

function buildMetricPopulationReconciliationNote(sourceFiles: ParsedAuditFile[]): string {
  const notes: string[] = [];

  sourceFiles.forEach((file) => {
    if (isFormalAuditFindingSource(file)) {
      return;
    }

    const counts = countExactRiskCellsInStructuredText(file.text);

    if (counts.total === 0) {
      return;
    }

    const name = readableFileName(file.name);
    const normalizedName = normalizeFileNameForMatching(file.name);

    if (/compliance checklist/i.test(normalizedName)) {
      notes.push(`${name}: ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low compliance checklist/control evidence signals.`);
      return;
    }

    if (/risk assessment matrix|risk matrix/i.test(normalizedName)) {
      notes.push(`${name}: ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low risk-matrix entries.`);
      return;
    }

    if (/vendor|procurement/i.test(normalizedName)) {
      notes.push(`${name}: ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low vendor/procurement records.`);
      return;
    }

    if (/inventory/i.test(normalizedName)) {
      notes.push(`${name}: ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low inventory records.`);
      return;
    }

    if (/financial|workbook|ledger/i.test(normalizedName)) {
      notes.push(`${name}: ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low finance/workbook rows.`);
    }
  });

  if (notes.length === 0) {
    return "No separate supporting signal population counts were detected from non-formal source tables.";
  }

  return `Supporting signal populations detected for reconciliation: ${notes.slice(0, 5).join(" ")}`;
}

function countExactRiskCellsInStructuredText(text: string): { high: number; medium: number; low: number; total: number } {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("|") || line.includes(",") || line.includes("\t"))
    .map(parseCsvLikeLine)
    .filter((cells) => cells.length >= 3);

  const counts = { high: 0, medium: 0, low: 0, total: 0 };

  rows.forEach((cells) => {
    const riskCells = cells.filter((cell) => /^(high|medium|low)$/i.test(cleanText(cell)));

    if (riskCells.length !== 1) {
      return;
    }

    const risk = riskCells[0].toLowerCase();

    if (risk === "high") counts.high += 1;
    if (risk === "medium") counts.medium += 1;
    if (risk === "low") counts.low += 1;

    counts.total += 1;
  });

  return counts;
}

function getRiskCountsFromFindings(findings: DetailFinding[]) {
  return {
    High: findings.filter((finding) => finding.risk === "High").length,
    Medium: findings.filter((finding) => finding.risk === "Medium").length,
    Low: findings.filter((finding) => finding.risk === "Low").length,
  };
}

function getActiveRiskFromKpiTitle(kpiTitle: string): RiskLevel | null {
  const title = kpiTitle.toLowerCase();

  if (title.includes("high")) return "High";
  if (title.includes("medium")) return "Medium";
  if (title.includes("low")) return "Low";

  return null;
}

function extractProcessFromFinding(finding: DetailFinding): string {
  const parts = finding.excerpt
    .split("|")
    .map((part) => cleanText(part))
    .filter(Boolean);

  const possibleProcess = parts[1];

  if (
    possibleProcess &&
    !pickRiskLevel([possibleProcess]) &&
    !/^IA(?:-\d{4})?-\d{3}$/i.test(possibleProcess) &&
    !/^(open|closed|overdue|in progress|pending)$/i.test(possibleProcess)
  ) {
    return toTitleCase(possibleProcess);
  }

  return inferOwner(finding.document, `${finding.finding} ${finding.excerpt}`);
}

function getFindingStatus(finding: DetailFinding): string {
  const statusMatch = finding.excerpt.match(/Status:\s*([^|]+)/i);

  if (statusMatch) {
    return toTitleCase(cleanText(statusMatch[1]));
  }

  const genericMatch = `${finding.finding} ${finding.excerpt}`.match(/\b(open|closed|overdue|in progress|pending)\b/i);

  return genericMatch ? toTitleCase(genericMatch[1]) : "Not stated";
}

function summarizeCountsByLabel(values: string[], limit = 6): string {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    const label = value || "Unknown";
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  const rows = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => `${label}: ${count}`);

  return rows.length ? rows.join("; ") : "No breakdown detected.";
}

function summarizeFormalFindingPopulation(findings: DetailFinding[]): string {
  const counts = getRiskCountsFromFindings(findings);
  const total = findings.length;

  return `Formal audit finding population: ${total} distinct IA finding IDs (${counts.High} High, ${counts.Medium} Medium, ${counts.Low} Low).`;
}

function summarizeProcessBreakdown(findings: DetailFinding[], risk?: RiskLevel | null): string {
  const scopedFindings = risk ? findings.filter((finding) => finding.risk === risk) : findings;
  return summarizeCountsByLabel(scopedFindings.map(extractProcessFromFinding), 8);
}

function summarizeOwnerBreakdown(findings: DetailFinding[], risk?: RiskLevel | null): string {
  const scopedFindings = risk ? findings.filter((finding) => finding.risk === risk) : findings;
  return summarizeCountsByLabel(scopedFindings.map((finding) => finding.owner || "Unknown"), 8);
}

function summarizeStatusBreakdown(findings: DetailFinding[], risk?: RiskLevel | null): string {
  const scopedFindings = risk ? findings.filter((finding) => finding.risk === risk) : findings;
  return summarizeCountsByLabel(scopedFindings.map(getFindingStatus), 8);
}

function getFormalKpiValue(kpiTitle: string, analysis: AuditAnalysis): string {
  const title = kpiTitle.toLowerCase();

  if (title.includes("total")) return String(analysis.totalFindings);
  if (title.includes("high")) return String(analysis.highRiskItems);
  if (title.includes("medium")) return String(analysis.mediumRiskItems);
  if (title.includes("low")) return String(analysis.lowRiskItems);

  return "N/A";
}

function getSupportingSignalDetailsForKpi(kpiTitle: string, sourceFiles: ParsedAuditFile[]): string {
  const title = kpiTitle.toLowerCase();
  const details: string[] = [];

  sourceFiles.forEach((file) => {
    const normalizedName = normalizeFileNameForMatching(file.name);
    const counts = countExactRiskCellsInStructuredText(file.text);

    if (counts.total === 0) {
      return;
    }

    const readableName = readableFileName(file.name);

    if (title.includes("vendor") && /vendor|procurement/i.test(normalizedName)) {
      details.push(`${readableName}: ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low vendor/procurement supporting signals.`);
      return;
    }

    if (title.includes("financial") && /financial|workbook|ledger|inventory|revenue|treasury/i.test(normalizedName)) {
      const metricEvidence = getFinancialFlagMetricEvidence([file]);

      if (metricEvidence) {
        details.push(`${readableName}: ${metricEvidence.value} financial-statement evidence rows/flags detected through ${metricEvidence.method}.`);
      } else {
        details.push(`${readableName}: ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low finance/inventory/revenue supporting signals.`);
      }

      return;
    }

    if (title.includes("compliance") && /compliance checklist|control/i.test(normalizedName)) {
      details.push(`${readableName}: ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low compliance checklist/control signals.`);
      return;
    }

    if (/total|high|medium|low/i.test(title) && !isFormalAuditFindingSource(file)) {
      if (/compliance checklist/i.test(normalizedName)) {
        details.push(`${readableName}: ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low compliance checklist/control signals, not formal findings.`);
      } else if (/risk assessment matrix|risk matrix/i.test(normalizedName)) {
        details.push(`${readableName}: ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low risk-register signals, not formal findings.`);
      } else if (/vendor|procurement/i.test(normalizedName)) {
        details.push(`${readableName}: ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low vendor/procurement signals, not formal findings.`);
      } else if (/inventory/i.test(normalizedName)) {
        details.push(`${readableName}: ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low inventory signals, not formal findings.`);
      } else if (/financial|workbook|ledger/i.test(normalizedName)) {
        details.push(`${readableName}: ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low finance/workbook signals, not formal findings.`);
      }
    }
  });

  if (details.length === 0) {
    return "No separate supporting signal population was detected for this KPI.";
  }

  return details.slice(0, 8).join(" ");
}

function buildStrictKpiEvidenceBrief(kpiTitle: string, analysis: AuditAnalysis): string {
  const title = kpiTitle.toLowerCase();
  const activeRisk = getActiveRiskFromKpiTitle(kpiTitle);
  const formalCounts = getRiskCountsFromFindings(analysis.findings);
  const formalPopulation = summarizeFormalFindingPopulation(analysis.findings);
  const supportingSignals = getSupportingSignalDetailsForKpi(kpiTitle, analysis.sourceFiles);

  if (title.includes("compliance")) {
    return [
      `ACTIVE KPI ONLY: ${kpiTitle}. Do not answer other KPI cards unless explicitly asked.`,
      `Current Compliance Score displayed by the dashboard: ${analysis.complianceScore}%.`,
      `This card is a compliance/control-testing score metric, not a formal audit finding count.`,
      buildComplianceScoreReconciliationNote(analysis.sourceFiles, analysis.complianceScore),
      `${formalPopulation} Formal findings are risk context only and should not be used as the score formula unless the uploaded evidence states that formula.`,
      `Relevant supporting signal populations: ${supportingSignals}`,
    ].join(" ");
  }

  if (title.includes("pending")) {
    const remediationCounts = getRemediationActionStatusCounts(analysis.sourceFiles);
    const remediationBreakdown = remediationCounts.total > 0
      ? `Remediation tracker action population: ${remediationCounts.total} distinct actions. Status breakdown: Open ${remediationCounts.open}, In Progress ${remediationCounts.inProgress}, Overdue ${remediationCounts.overdue}, Closed ${remediationCounts.closed}. Pending/non-closed actions = ${remediationCounts.pending}. Closed actions are excluded.`
      : "No complete remediation tracker status breakdown was detected; validate the card against uploaded action tracker status fields.";

    return [
      `ACTIVE KPI ONLY: ${kpiTitle}. Do not answer other KPI cards unless explicitly asked.`,
      `Current Pending Actions displayed by the dashboard: ${analysis.pendingActionItems}.`,
      `This card should be explained from remediation/action tracker status evidence, not from every extracted finding row and not from generated recommendations.`,
      remediationBreakdown,
      `Formal finding status breakdown is context only and should not replace remediation action status counts: ${summarizeStatusBreakdown(analysis.findings)}.`,
      `Owner breakdown for unresolved-risk context: ${summarizeOwnerBreakdown(analysis.findings)}.`,
    ].join(" ");
  }

  if (title.includes("financial")) {
    const financeFindings = analysis.findings.filter((finding) =>
      /finance|financial|revenue|treasury|close|variance|reconciliation|journal|ledger/i.test(
        `${finding.document} ${finding.owner} ${finding.finding} ${finding.excerpt}`
      )
    );

    return [
      `ACTIVE KPI ONLY: ${kpiTitle}. Do not answer other KPI cards unless explicitly asked.`,
      `Current Financial Flags displayed by the dashboard: ${analysis.financialDiscrepancyFlags}.`,
      describeFinancialFlagMetricEvidence(analysis.sourceFiles, analysis.financialDiscrepancyFlags),
      `This KPI is a finance/financial-statement evidence-signal metric, not the formal audit finding total.`,
      `Formal finance-related findings are context only unless no explicit uploaded financial-statement row or flag metric exists. Formal finance-related context detected: ${financeFindings.length}. Risk split: ${summarizeFormalFindingPopulation(financeFindings)}.`,
      `Relevant supporting signal populations: ${supportingSignals}`,
    ].join(" ");
  }

  if (title.includes("vendor")) {
    const vendorFindings = analysis.findings.filter((finding) =>
      /vendor|procurement|supplier|purchase order|approval/i.test(
        `${finding.document} ${finding.owner} ${finding.finding} ${finding.excerpt}`
      )
    );

    return [
      `ACTIVE KPI ONLY: ${kpiTitle}. Do not answer other KPI cards unless explicitly asked.`,
      `Current Vendor Risk rating displayed by the dashboard: ${analysis.vendorRiskRating}.`,
      `This KPI is a vendor/procurement risk rating using formal vendor/procurement findings plus supporting vendor/procurement signals. It is not itself a formal finding count.`,
      `Relevant formal vendor/procurement findings detected: ${vendorFindings.length}. Risk split: ${summarizeFormalFindingPopulation(vendorFindings)}.`,
      `Relevant supporting signal populations: ${supportingSignals}`,
    ].join(" ");
  }

  if (title.includes("total") || activeRisk) {
    const cardValue = getFormalKpiValue(kpiTitle, analysis);
    const scopedFindings = activeRisk ? analysis.findings.filter((finding) => finding.risk === activeRisk) : analysis.findings;

    return [
      `ACTIVE KPI ONLY: ${kpiTitle}. Do not answer other KPI cards unless explicitly asked.`,
      `The displayed formal audit finding KPI value should reconcile to ${cardValue}.`,
      `${formalPopulation}`,
      activeRisk
        ? `For this ${activeRisk} KPI, use only the ${scopedFindings.length} formal IA findings rated ${activeRisk}. Do not add checklist, risk-register, vendor, inventory, or finance raw signal rows to this count.`
        : `For Total Audit Findings, use only the ${analysis.totalFindings} distinct formal IA finding IDs. Do not add checklist, risk-register, vendor, inventory, or finance raw signal rows to this count.`,
      `Formal finding process breakdown for this scope: ${summarizeProcessBreakdown(analysis.findings, activeRisk)}.`,
      `Formal finding owner breakdown for this scope: ${summarizeOwnerBreakdown(analysis.findings, activeRisk)}.`,
      `Formal finding status breakdown for this scope: ${summarizeStatusBreakdown(analysis.findings, activeRisk)}.`,
      `Supporting populations detected for reconciliation only: ${supportingSignals}`,
    ].join(" ");
  }

  return [
    `ACTIVE KPI ONLY: ${kpiTitle}. Do not answer unrelated KPI cards unless explicitly asked.`,
    `${formalPopulation}`,
    `Supporting populations detected for reconciliation: ${supportingSignals}`,
  ].join(" ");
}


function buildRemediationActionEvidenceItems(sourceFiles: ParsedAuditFile[]) {
  const counts = getRemediationActionStatusCounts(sourceFiles);
  const remediationFiles = sourceFiles.filter((file) =>
    /remediation|action tracker/i.test(file.name)
  );

  if (counts.total === 0 || remediationFiles.length === 0) {
    return [];
  }

  const sourceNames = remediationFiles.map((file) => readableFileName(file.name)).join("; ");
  const sampleRows = remediationFiles
    .flatMap((file) =>
      file.text
        .split(/\r?\n/)
        .map((line) => cleanText(line))
        .filter((line) => /\b(ACT-\d{4}-\d{3}|IA-\d{4}-\d{3})\b/i.test(line))
        .slice(0, 3)
        .map((line) => `${readableFileName(file.name)} row: ${line}`)
    )
    .slice(0, 5)
    .join(" || ");

  return [
    {
      sourceName: sourceNames,
      evidenceType: "Uploaded remediation tracker status evidence",
      risk: "N/A",
      owner: "N/A",
      snippet: [
        `Remediation tracker population from uploaded source files: ${counts.total} distinct actions.`,
        `Status counts: Open ${counts.open}, In Progress ${counts.inProgress}, Overdue ${counts.overdue}, Closed ${counts.closed}.`,
        `Pending/non-closed actions = ${counts.open} + ${counts.inProgress} + ${counts.overdue} = ${counts.pending}.`,
        `Closed actions are excluded.`,
        sampleRows ? `Sample action rows: ${sampleRows}` : "",
      ].filter(Boolean).join(" "),
    },
  ];
}

function buildKpiFocusedEvidence(kpiTitle: string, analysis: AuditAnalysis) {
  const title = kpiTitle.toLowerCase();
  let matchedFindings: DetailFinding[] = [];

  if (title.includes("high")) {
    matchedFindings = analysis.findings.filter((finding) => finding.risk === "High");
  } else if (title.includes("medium")) {
    matchedFindings = analysis.findings.filter((finding) => finding.risk === "Medium");
  } else if (title.includes("low")) {
    matchedFindings = analysis.findings.filter((finding) => finding.risk === "Low");
  } else if (title.includes("total")) {
    matchedFindings = analysis.findings;
  } else if (title.includes("compliance")) {
    matchedFindings = analysis.findings.filter((finding) =>
      /compliance|policy attestation|control|evidence retention/i.test(
        `${finding.document} ${finding.owner} ${finding.finding} ${finding.excerpt}`
      )
    );
  } else if (title.includes("pending")) {
    // Pending Actions is a remediation-tracker status KPI, not a formal-finding KPI.
    // Keep formal findings out of the focused evidence for this card so the model
    // cannot confuse Detailed Findings with remediation action status.
    matchedFindings = [];
  } else if (title.includes("financial")) {
    matchedFindings = analysis.findings.filter((finding) =>
      /finance|financial|revenue|treasury|close|variance|reconciliation|journal|ledger|inventory/i.test(
        `${finding.document} ${finding.owner} ${finding.finding} ${finding.excerpt}`
      )
    );
  } else if (title.includes("vendor")) {
    matchedFindings = analysis.findings.filter((finding) =>
      /vendor|procurement|supplier|purchase order|approval/i.test(
        `${finding.document} ${finding.owner} ${finding.finding} ${finding.excerpt}`
      )
    );
  }

  const strictBrief = {
    sourceName: "Deterministic KPI evidence brief",
    evidenceType: "Authoritative metric reconciliation",
    risk: "N/A",
    owner: "N/A",
    snippet: buildStrictKpiEvidenceBrief(kpiTitle, analysis),
  };

  const supportingBrief = {
    sourceName: "Supporting signal populations",
    evidenceType: "Reconciliation only - do not merge into formal findings",
    risk: "N/A",
    owner: "N/A",
    snippet: getSupportingSignalDetailsForKpi(kpiTitle, analysis.sourceFiles),
  };

  const remediationActionEvidence = title.includes("pending")
    ? buildRemediationActionEvidenceItems(analysis.sourceFiles)
    : [];
  const financialFlagEvidence = title.includes("financial")
    ? buildFinancialFlagEvidenceItems(analysis.sourceFiles)
    : [];

  return [
    ...remediationActionEvidence,
    ...financialFlagEvidence,
    strictBrief,
    supportingBrief,
    ...matchedFindings.slice(0, 8).map((finding) => ({
      sourceName: finding.document,
      evidenceType: "Formal audit finding",
      risk: finding.risk,
      owner: finding.owner,
      snippet: truncateText(
        `${finding.findingId ? `${finding.findingId} | ` : ""}${finding.finding} | Owner: ${finding.owner} | ${finding.excerpt}`,
        900
      ),
    })),
  ];
}

function extractFindings(parsedFiles: ParsedAuditFile[]): DetailFinding[] {
  const findings: DetailFinding[] = [];

  parsedFiles.forEach((file) => {
    const documentType = inferDocumentType(file);
    const evidenceLines = splitEvidenceLines(file.text);

    auditRules.forEach((rule) => {
      if (
        !rule.documentTypes.includes("any") &&
        !rule.documentTypes.includes(documentType)
      ) {
        return;
      }

      const evidenceLine = findRuleEvidence(evidenceLines, rule.patterns);

      if (!evidenceLine) return;

      findings.push({
        document: readableFileName(file.name),
        finding: rule.finding,
        risk: rule.risk,
        owner: rule.owner || inferOwner(file.name, evidenceLine),
        excerpt: truncateText(evidenceLine, 260),
      });
    });

    const directFindingLines = evidenceLines.filter((line) =>
      isDirectAuditFinding(line)
    );

    directFindingLines.forEach((line) => {
      findings.push({
        document: readableFileName(file.name),
        finding: buildFindingTitle(line),
        risk: inferRiskFromEvidence(line),
        owner: inferOwner(file.name, line),
        excerpt: truncateText(line, 260),
      });
    });
  });

  return dedupeFindings(findings);
}

function inferDocumentType(file: ParsedAuditFile): AuditDocumentType {
  const combinedText = `${file.name} ${file.text.slice(0, 1200)}`.toLowerCase();

  if (/vendor|supplier|procurement|purchase order|\bpo\b|invoice/.test(combinedText)) {
    return "vendor";
  }

  if (/compliance|checklist|policy|regulatory|control requirement/.test(combinedText)) {
    return "compliance";
  }

  if (/risk assessment|risk matrix|likelihood|impact|residual risk/.test(combinedText)) {
    return "risk";
  }

  if (/internal audit|audit report|audit finding|management response/.test(combinedText)) {
    return "internalAudit";
  }

  if (/inventory|stock|warehouse|physical count|ledger quantity/.test(combinedText)) {
    return "inventory";
  }

  if (/financial|balance sheet|income statement|revenue|expense|cash flow|reconciliation/.test(combinedText)) {
    return "financial";
  }

  return "general";
}

function splitEvidenceLines(text: string) {
  return text
    .split(/\r?\n|\. /)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 18)
    .filter((line) => !/^[,\s|;-]+$/.test(line));
}

function findRuleEvidence(lines: string[], patterns: RegExp[]) {
  return (
    lines.find((line) =>
      patterns.some((pattern) => {
        pattern.lastIndex = 0;
        return pattern.test(line);
      })
    ) || ""
  );
}

function isDirectAuditFinding(line: string) {
  const auditSignalPattern =
    /\b(finding|exception|high risk|medium risk|low risk|non-compliant|not compliant|failed|failure|gap|weakness|deficiency|variance|mismatch|discrepancy|unreconciled|unsupported|missing evidence|incomplete|overdue|unresolved|pending remediation|control issue)\b/i;

  return auditSignalPattern.test(line);
}

function buildFindingTitle(line: string) {
  const cleaned = line.replace(/\s+/g, " ").trim();

  if (/vendor|supplier|procurement|purchase order|\bpo\b/i.test(cleaned)) {
    return "Vendor or procurement control issue detected.";
  }

  if (/variance|mismatch|discrepancy|reconciliation|ledger|invoice|revenue|expense/i.test(cleaned)) {
    return "Financial discrepancy or reconciliation issue detected.";
  }

  if (/inventory|stock|warehouse|physical count/i.test(cleaned)) {
    return "Inventory reconciliation or count issue detected.";
  }

  if (/compliance|policy|control|non-compliant|failed/i.test(cleaned)) {
    return "Compliance or control evidence issue detected.";
  }

  if (/risk|impact|likelihood|mitigation/i.test(cleaned)) {
    return "Risk assessment or mitigation issue detected.";
  }

  if (/overdue|pending|unresolved|remediation|corrective action/i.test(cleaned)) {
    return "Open remediation action requires follow-up.";
  }

  return truncateText(cleaned, 140);
}

function inferRiskFromEvidence(text: string): RiskLevel {
  if (
    /\b(critical|high risk|high-risk|material|severe|urgent|failed|non-compliant|unreconciled|unsupported|missing approval|control failure)\b/i.test(
      text
    )
  ) {
    return "High";
  }

  if (
    /\b(medium risk|medium-risk|moderate|pending|overdue|exception|variance|mismatch|partial|incomplete|deficiency|weakness)\b/i.test(
      text
    )
  ) {
    return "Medium";
  }

  return "Low";
}

function dedupeFindings(findings: DetailFinding[]) {
  const seen = new Set<string>();

  return findings.filter((finding) => {
    const key = `${finding.document}-${finding.finding}-${finding.excerpt}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getRemediationActionStatusCounts(parsedFiles: ParsedAuditFile[]) {
  const counts = {
    total: 0,
    open: 0,
    inProgress: 0,
    overdue: 0,
    closed: 0,
    pending: 0,
  };

  const remediationFiles = parsedFiles.filter((file) => /remediation|action tracker/i.test(file.name));
  const actionsByKey = new Map<string, string>();

  remediationFiles.forEach((file) => {
    file.text
      .split(/\r?\n/)
      .map((line) => parseCsvLikeLine(line))
      .forEach((cells) => {
        const joined = cells.join(" ");
        const actionId = joined.match(/\bACT-\d{4}-\d{3}\b/i)?.[0]?.toUpperCase();
        const findingId = joined.match(/\bIA-\d{4}-\d{3}\b/i)?.[0]?.toUpperCase();
        const statusCell = cells.find((cell) => /^(open|in progress|overdue|closed)$/i.test(cleanText(cell)));

        if (!statusCell || (!actionId && !findingId)) {
          return;
        }

        const key = actionId || findingId || joined.slice(0, 80);
        actionsByKey.set(key, cleanText(statusCell).toLowerCase());
      });
  });

  actionsByKey.forEach((status) => {
    if (status === "open") counts.open += 1;
    if (status === "in progress") counts.inProgress += 1;
    if (status === "overdue") counts.overdue += 1;
    if (status === "closed") counts.closed += 1;
  });

  counts.total = actionsByKey.size;
  counts.pending = counts.open + counts.inProgress + counts.overdue;

  return counts;
}

function calculatePendingActionItems(
  parsedFiles: ParsedAuditFile[],
  findings: DetailFinding[]
) {
  const statusCounts = getRemediationActionStatusCounts(parsedFiles);

  if (statusCounts.pending > 0) {
    return statusCounts.pending;
  }

  return findings.filter((finding) =>
    /\b(open|overdue|in progress|pending)\b/i.test(
      `${finding.finding} ${finding.excerpt}`
    )
  ).length;
}



function getFinancialFlagPopulationCounts(sourceFiles: ParsedAuditFile[]) {
  let workbookRows = 0;
  let pdfAuditNoteRows = 0;
  let explicitDashboardRows = 0;
  const workbookSources: string[] = [];
  const pdfSources: string[] = [];
  const explicitSources: string[] = [];

  sourceFiles.forEach((file) => {
    const readableName = readableFileName(file.name);
    const normalizedName = normalizeFileNameForMatching(file.name);
    const isPdf = file.extension.toLowerCase() === "pdf" || /\.pdf$/i.test(file.name);
    const isWorkbook = file.extension.toLowerCase() === "xlsx" || /workbook|financial statements/i.test(normalizedName);

    if (isWorkbook) {
      const explicitMetricPatterns = [
        /\bfinancial\s+statements?\s+rows?\b\s*[:|,\t -]*\s*(\d{1,6})\b/i,
        /\bfinancial\s+statement\s+audit\s*note\s+rows?\b\s*[:|,\t -]*\s*(\d{1,6})\b/i,
        /\bfinancial\s+flags?\b\s*[:|,\t -]*\s*(\d{1,6})\b/i,
        /\bfinance\s+flags?\b\s*[:|,\t -]*\s*(\d{1,6})\b/i,
      ];

      splitEvidenceLines(file.text).forEach((line) => {
        explicitMetricPatterns.forEach((pattern) => {
          const match = line.match(pattern);
          const value = Number.parseInt(match?.[1] || "", 10);

          if (Number.isFinite(value) && value > explicitDashboardRows) {
            explicitDashboardRows = value;
            explicitSources.push(`${readableName}: ${truncateText(line, 180)}`);
          }
        });
      });

      const structuredRows = countFinancialStatementRowsFromStructuredText(file.text);
      if (structuredRows > workbookRows) {
        workbookRows = structuredRows;
        workbookSources.push(`${readableName}: ${structuredRows} structured financial-statement rows with audit notes`);
      }
    }

    if (isPdf || /student audit report|audit report/i.test(normalizedName)) {
      const pdfRows = countFinancialStatementAuditNoteRows(file.text);
      if (pdfRows > pdfAuditNoteRows) {
        pdfAuditNoteRows = pdfRows;
        pdfSources.push(`${readableName}: ${pdfRows} financial-statement audit-note rows`);
      }
    }
  });

  const dashboardWorkbookRows = explicitDashboardRows || workbookRows;

  return {
    dashboardWorkbookRows,
    workbookRows,
    explicitDashboardRows,
    pdfAuditNoteRows,
    workbookSources: workbookSources.slice(0, 4),
    pdfSources: pdfSources.slice(0, 4),
    explicitSources: explicitSources.slice(0, 4),
  };
}

function buildFinancialFlagEvidenceItems(sourceFiles: ParsedAuditFile[]) {
  const counts = getFinancialFlagPopulationCounts(sourceFiles);

  if (counts.dashboardWorkbookRows <= 0 && counts.pdfAuditNoteRows <= 0) {
    return [];
  }

  return [
    {
      sourceName: "Uploaded financial-statement evidence",
      evidenceType: "Financial Flags population reconciliation",
      risk: "N/A",
      owner: "N/A",
      snippet: [
        counts.dashboardWorkbookRows > 0
          ? `Dashboard/workbook financial-statement row population: ${counts.dashboardWorkbookRows}.`
          : "No explicit dashboard/workbook financial-statement row population was detected.",
        counts.pdfAuditNoteRows > 0
          ? `Broader PDF financial-statement audit-note population: ${counts.pdfAuditNoteRows}.`
          : "No broader PDF financial-statement audit-note population was detected.",
        counts.dashboardWorkbookRows > 0 && counts.pdfAuditNoteRows > 0 && counts.dashboardWorkbookRows !== counts.pdfAuditNoteRows
          ? `These are separate populations: ${counts.dashboardWorkbookRows} is the current workbook/dashboard subset; ${counts.pdfAuditNoteRows} is the broader PDF financial-statement flag population.`
          : "No workbook-vs-PDF financial-statement population conflict was detected.",
        counts.explicitSources.length ? `Explicit dashboard/workbook metric evidence: ${counts.explicitSources.join(" || ")}.` : "",
        counts.workbookSources.length ? `Workbook evidence: ${counts.workbookSources.join(" || ")}.` : "",
        counts.pdfSources.length ? `PDF evidence: ${counts.pdfSources.join(" || ")}.` : "",
      ].filter(Boolean).join(" "),
    },
  ];
}

function getFinancialFlagMetricEvidence(parsedFiles: ParsedAuditFile[]): {
  value: number;
  source: string;
  method: string;
  note: string;
} | null {
  const explicitMetricPatterns = [
    /\bfinancial\s+statements?\s+rows?\b\s*[:|,\t -]*\s*(\d{1,6})\b/i,
    /\bfinancial\s+statement\s+audit\s*note\s+rows?\b\s*[:|,\t -]*\s*(\d{1,6})\b/i,
    /\bfinancial\s+flags?\b\s*[:|,\t -]*\s*(\d{1,6})\b/i,
    /\bfinance\s+flags?\b\s*[:|,\t -]*\s*(\d{1,6})\b/i,
  ];

  for (const file of parsedFiles) {
    const lines = splitEvidenceLines(file.text);

    for (const line of lines) {
      for (const pattern of explicitMetricPatterns) {
        const match = line.match(pattern);

        if (match) {
          const value = Number.parseInt(match[1], 10);

          if (Number.isFinite(value) && value >= 0) {
            return {
              value,
              source: readableFileName(file.name),
              method: "explicit uploaded metric",
              note: `Uploaded evidence contains an explicit financial metric line: "${truncateText(line, 180)}".`,
            };
          }
        }
      }
    }
  }

  for (const file of parsedFiles) {
    const rows = countFinancialStatementRowsFromStructuredText(file.text);

    if (rows > 0) {
      return {
        value: rows,
        source: readableFileName(file.name),
        method: "structured financial-statement rows",
        note: `Detected ${rows} structured financial-statement rows with audit notes in the uploaded file.`,
      };
    }
  }

  for (const file of parsedFiles) {
    const rows = countFinancialStatementAuditNoteRows(file.text);

    if (rows > 0) {
      return {
        value: rows,
        source: readableFileName(file.name),
        method: "financial-statement audit-note rows",
        note: `Detected ${rows} financial-statement audit-note rows in uploaded evidence.`,
      };
    }
  }

  return null;
}

function countFinancialStatementRowsFromStructuredText(text: string): number {
  const lines = text.split(/\r?\n/);
  let inFinancialStatementsSection = false;
  let seenHeader = false;
  let count = 0;

  for (const rawLine of lines) {
    const line = cleanText(rawLine);
    const lowerLine = line.toLowerCase();

    if (/^---\s*sheet:\s*financial statements\b/i.test(line) || /^table\s+\d+\s+from\s+financial statements\b/i.test(line)) {
      inFinancialStatementsSection = true;
      seenHeader = false;
      continue;
    }

    if (inFinancialStatementsSection && /^---\s*sheet:/i.test(line) && !/financial statements/i.test(line)) {
      break;
    }

    if (!inFinancialStatementsSection) {
      continue;
    }

    if (/\bstatement\s+line\b/i.test(line) && /\baudit\s+note\b/i.test(line)) {
      seenHeader = true;
      continue;
    }

    if (!seenHeader) {
      continue;
    }

    if (looksLikeFinancialStatementDataRow(line)) {
      count += 1;
    }
  }

  return count;
}

function countFinancialStatementAuditNoteRows(text: string): number {
  const seen = new Set<string>();

  const addRow = (line: string) => {
    if (!looksLikeFinancialStatementDataRow(line)) {
      return;
    }

    const key = similarityKey(line);

    if (!seen.has(key)) {
      seen.add(key);
    }
  };

  // Pass 1: count rows in narrative/selectable PDF text after financial-statement headings.
  const narrativeLines = splitEvidenceLines(text);
  let inStatementSection = false;

  for (const rawLine of narrativeLines) {
    const line = cleanText(rawLine);

    if (/\b(statement of financial position|statement of income|cash[- ]?flow statement|balance sheet|income statement|cash flow)\b/i.test(line)) {
      inStatementSection = true;
      continue;
    }

    if (!inStatementSection) {
      continue;
    }

    if (/\b(appendix|risk matrix|remediation|vendor|inventory reconciliation|compliance checklist|control testing dashboard)\b/i.test(line)) {
      inStatementSection = false;
      continue;
    }

    addRow(line);
  }

  // Pass 2: count backend-extracted markdown tables. This catches financial
  // statement sections whose selectable PDF text is split/truncated but whose
  // table extraction is complete, such as income-statement and cash-flow rows.
  const tableLines = text.split(/\r?\n/);
  let inFinancialTable = false;
  let passedSeparator = false;

  for (const rawLine of tableLines) {
    const line = cleanText(rawLine);
    const lowerLine = line.toLowerCase();

    if (/^---\s*table\s+\d+\s+from\s+/i.test(line)) {
      inFinancialTable = false;
      passedSeparator = false;
      continue;
    }

    if (/^\|/.test(rawLine.trim()) && /audit\s+note/i.test(line) && /\b(statement\s+line|line)\b/i.test(line) && /2024|2023|change/i.test(line)) {
      inFinancialTable = true;
      passedSeparator = false;
      continue;
    }

    if (!inFinancialTable) {
      continue;
    }

    if (/^\|?\s*---/.test(line) || /\|\s*---\s*\|/.test(rawLine)) {
      passedSeparator = true;
      continue;
    }

    if (!/^\|/.test(rawLine.trim())) {
      inFinancialTable = false;
      passedSeparator = false;
      continue;
    }

    if (!passedSeparator || /statement\s+line|audit\s+note/.test(lowerLine)) {
      continue;
    }

    addRow(line);
  }

  return seen.size;
}

function looksLikeFinancialStatementDataRow(line: string): boolean {
  const cleaned = cleanText(line.replace(/^\|/, "").replace(/\|$/, ""));

  if (!cleaned || /statement\s+line|audit\s+note|---/.test(cleaned.toLowerCase())) {
    return false;
  }

  const hasFinancialLabel = /\b(net sales|sales|revenue|cost of goods|gross profit|selling|distribution|general|administrative|operating income|operating cash flow|capital expenditures?|capex|debt repayment|net cash movement|cash movement|inventory|accounts payable|accrued liabilities|cash|receivables|payables|assets|liabilities|equity|expense|expenditures?|income|profit|loss|debt)\b/i.test(cleaned);
  const numericMatches = cleaned.match(/-?\d+(?:\.\d+)?%?/g) || [];
  const hasAuditNoteLanguage = /\b(audit note|cutoff|testing|required|review|variance|margin|manual|journal|exception|exceptions|detected|aging|elevated|support|reconciliation|shrink|vendor|approval|control|offsets|collections|fixtures|technology|covenant|available|movement|increase|increased|grew|retained|earnings|capitalization)\b/i.test(cleaned);

  return hasFinancialLabel && numericMatches.length >= 2 && hasAuditNoteLanguage;
}

function describeFinancialFlagMetricEvidence(parsedFiles: ParsedAuditFile[], displayedValue: number): string {
  const evidence = getFinancialFlagMetricEvidence(parsedFiles);

  if (!evidence) {
    return `No explicit uploaded financial-flag metric or financial-statement row population was detected. Current displayed value is ${displayedValue}, so treat it as lower-confidence and validate the source rows before relying on it.`;
  }

  return `Current displayed value ${displayedValue} is derived from ${evidence.method} in ${evidence.source}. ${evidence.note} This is a financial-statement evidence-signal population, not a formal audit finding count.`;
}

function calculateFinancialFlags(
  parsedFiles: ParsedAuditFile[],
  findings: DetailFinding[]
) {
  const uploadedMetricEvidence = getFinancialFlagMetricEvidence(parsedFiles);

  if (uploadedMetricEvidence) {
    return uploadedMetricEvidence.value;
  }

  const financialPattern =
    /\b(finance|financial|revenue|treasury|close|variance|mismatch|discrepancy|reconciliation|unreconciled|unsupported|ledger|invoice|journal|cash)\b/i;

  const financeRelatedFormalFindings = findings.filter((finding) =>
    financialPattern.test(`${finding.document} ${finding.owner} ${finding.finding} ${finding.excerpt}`)
  ).length;

  return financeRelatedFormalFindings;
}

function calculateEvidenceBasedComplianceScore(
  allText: string,
  findings: DetailFinding[]
) {
  const passedSignals = countMatches(
    allText,
    /\b(pass|passed|compliant|complete|completed|adequate|effective|implemented)\b/gi
  );

  const partialSignals = countMatches(
    allText,
    /\b(partial|partially compliant|in progress|needs improvement|requires improvement)\b/gi
  );

  const failedSignals = countMatches(
    allText,
    /\b(fail|failed|non-compliant|not compliant|missing evidence|incomplete evidence|control failure|exception)\b/gi
  );

  const totalSignals = passedSignals + partialSignals + failedSignals;

  if (totalSignals >= 3) {
    const score = Math.round(
      ((passedSignals + partialSignals * 0.5) / totalSignals) * 100
    );

    return clamp(score, 45, 98);
  }

  const highRiskItems = findings.filter((finding) => finding.risk === "High").length;
  const mediumRiskItems = findings.filter(
    (finding) => finding.risk === "Medium"
  ).length;
  const lowRiskItems = findings.filter((finding) => finding.risk === "Low").length;

  return clamp(96 - highRiskItems * 8 - mediumRiskItems * 4 - lowRiskItems, 45, 96);
}

function calculateVendorRiskRating(
  parsedFiles: ParsedAuditFile[],
  findings: DetailFinding[]
): RiskLevel {
  const vendorPattern = /\b(vendor|supplier|procurement|purchase order|\bpo\b|invoice|approval)\b/i;

  const vendorLineCount = countEvidenceLines(parsedFiles, vendorPattern);

  const vendorFindings = findings.filter((finding) =>
    vendorPattern.test(`${finding.document} ${finding.finding} ${finding.excerpt}`)
  );

  const highVendorFindings = vendorFindings.filter(
    (finding) => finding.risk === "High"
  ).length;

  const mediumVendorFindings = vendorFindings.filter(
    (finding) => finding.risk === "Medium"
  ).length;

  if (highVendorFindings >= 1 || vendorFindings.length >= 3) {
    return "High";
  }

  if (mediumVendorFindings >= 1 || vendorLineCount >= 3) {
    return "Medium";
  }

  return "Low";
}

function countEvidenceLines(parsedFiles: ParsedAuditFile[], pattern: RegExp) {
  return parsedFiles.reduce((total, file) => {
    const matchingLines = splitEvidenceLines(file.text).filter((line) => {
      pattern.lastIndex = 0;
      return pattern.test(line);
    });

    return total + matchingLines.length;
  }, 0);
}

function buildEvidenceRiskSummary(input: {
  totalFindings: number;
  highRiskItems: number;
  mediumRiskItems: number;
  lowRiskItems: number;
  allText: string;
  findings: DetailFinding[];
  sourceFileCount: number;
}) {
  if (input.totalFindings === 0) {
    return `The uploaded audit package was processed across ${input.sourceFileCount} source files. No strong evidence-backed exception was detected by the current rule engine, so the package should be manually reviewed for risks that may not use standard audit keywords.`;
  }

  const theme = summarizeFindingThemes(input.findings) || summarizeDominantThemes(input.allText);

  return `The uploaded audit package was analyzed using distinct formal IA finding IDs as the primary dashboard metric. It produced ${input.totalFindings} formal audit findings: ${input.highRiskItems} high-risk, ${input.mediumRiskItems} medium-risk, and ${input.lowRiskItems} low-risk. Broader extracted rows from checklists, risk matrices, vendor records, financial workbooks, inventory logs, and remediation trackers are treated as supporting evidence signals rather than merged into the formal audit finding count. The strongest detected theme is ${theme}.`;
}

function summarizeFindingThemes(findings: DetailFinding[]) {
  const themes = [
    {
      label: "vendor approvals and procurement documentation",
      count: findings.filter((finding) =>
        /vendor|supplier|procurement|purchase order|\bpo\b|approval/i.test(
          `${finding.document} ${finding.finding} ${finding.excerpt}`
        )
      ).length,
    },
    {
      label: "financial variances and reconciliation exceptions",
      count: findings.filter((finding) =>
        /variance|mismatch|discrepancy|reconciliation|ledger|invoice|financial/i.test(
          `${finding.document} ${finding.finding} ${finding.excerpt}`
        )
      ).length,
    },
    {
      label: "compliance evidence and control failures",
      count: findings.filter((finding) =>
        /compliance|control|policy|failed|non-compliant|evidence/i.test(
          `${finding.document} ${finding.finding} ${finding.excerpt}`
        )
      ).length,
    },
    {
      label: "inventory reconciliation and operational records",
      count: findings.filter((finding) =>
        /inventory|stock|warehouse|physical count|operations/i.test(
          `${finding.document} ${finding.finding} ${finding.excerpt}`
        )
      ).length,
    },
    {
      label: "remediation ownership and open action tracking",
      count: findings.filter((finding) =>
        /pending|overdue|unresolved|remediation|corrective action|owner/i.test(
          `${finding.document} ${finding.finding} ${finding.excerpt}`
        )
      ).length,
    },
  ];

  const strongestTheme = themes.sort((a, b) => b.count - a.count)[0];

  return strongestTheme.count > 0 ? strongestTheme.label : "";
}

function buildDashboardKpis(analysis: AuditAnalysis): DashboardKpi[] {
  return [
    {
      title: "Total Audit Findings",
      value: String(analysis.totalFindings),
      status: `${analysis.sourceFiles.length} source files analyzed`,
      trend: "Evidence-backed",
      icon: <ClipboardCheck size={22} />,
    },
    {
      title: "High Risk Items",
      value: String(analysis.highRiskItems),
      status:
        analysis.highRiskItems > 0
          ? "Immediate review required"
          : "No high-risk items detected",
      trend: analysis.highRiskItems > 0 ? "Critical" : "Clear",
      icon: <AlertTriangle size={22} />,
    },
    {
      title: "Medium Risk Items",
      value: String(analysis.mediumRiskItems),
      status:
        analysis.mediumRiskItems > 0
          ? "Planned remediation review"
          : "No medium-risk items detected",
      trend: analysis.mediumRiskItems > 0 ? "Monitor" : "Clear",
      icon: <FileSearch size={22} />,
    },
    {
      title: "Low Risk Items",
      value: String(analysis.lowRiskItems),
      status:
        analysis.lowRiskItems > 0
          ? "Track periodically"
          : "No low-risk items detected",
      trend: "Stable",
      icon: <CheckCircle2 size={22} />,
    },
    {
      title: "Compliance Score",
      value: `${analysis.complianceScore}%`,
      status:
        analysis.complianceScore >= 85
          ? "Healthy control position"
          : "Below ideal threshold",
      trend: analysis.complianceScore >= 85 ? "Good" : "Review",
      icon: <ShieldCheck size={22} />,
    },
    {
      title: "Pending Actions",
      value: String(analysis.pendingActionItems),
      status:
        analysis.pendingActionItems > 0
          ? "Open remediation signals"
          : "No open action signals",
      trend: analysis.pendingActionItems > 0 ? "Open" : "Clear",
      icon: <XCircle size={22} />,
    },
    {
      title: "Financial Flags",
      value: String(analysis.financialDiscrepancyFlags),
      status:
        analysis.financialDiscrepancyFlags > 0
          ? "Variance and mismatch signals"
          : "No financial flags detected",
      trend: "Finance",
      icon: <BarChart3 size={22} />,
    },
    {
      title: "Vendor Risk",
      value: analysis.vendorRiskRating,
      status: "Procurement and vendor evidence",
      trend: "Vendor",
      icon: <AlertTriangle size={22} />,
    },
  ];
}

function buildRecommendations(input: {
  highRiskItems: number;
  mediumRiskItems: number;
  complianceScore: number;
  pendingActionItems: number;
  financialDiscrepancyFlags: number;
  vendorRiskRating: RiskLevel;
  findings: DetailFinding[];
}) {
  const recommendations: string[] = [];

  const hasVendorFinding = input.findings.some((finding) =>
    /vendor|supplier|procurement|purchase order|\bpo\b|approval/i.test(
      `${finding.document} ${finding.finding} ${finding.excerpt}`
    )
  );

  const hasComplianceFinding = input.findings.some((finding) =>
    /compliance|control|policy|evidence|non-compliant|failed/i.test(
      `${finding.document} ${finding.finding} ${finding.excerpt}`
    )
  );

  const hasFinancialFinding = input.findings.some((finding) =>
    /financial|variance|mismatch|discrepancy|reconciliation|ledger|invoice/i.test(
      `${finding.document} ${finding.finding} ${finding.excerpt}`
    )
  );

  if (input.highRiskItems > 0) {
    recommendations.push(
      `Prioritize the ${input.highRiskItems} high-risk formal audit findings and assign named remediation owners.`
    );
  }

  if (hasVendorFinding || input.vendorRiskRating !== "Low") {
    recommendations.push(
      `Perform a targeted vendor/procurement review because vendor risk is rated ${input.vendorRiskRating} based on extracted approval and procurement evidence.`
    );
  }

  if (hasFinancialFinding || input.financialDiscrepancyFlags > 0) {
    recommendations.push(
      `Review the ${input.financialDiscrepancyFlags} financial discrepancy or reconciliation signals and attach supporting invoice, ledger, or reconciliation evidence.`
    );
  }

  if (hasComplianceFinding || input.complianceScore < 85) {
    recommendations.push(
      `Improve control documentation and evidence quality because the calculated compliance score is ${input.complianceScore}%.`
    );
  }

  if (input.pendingActionItems > 0) {
    recommendations.push(
      `Create an action tracker for the ${input.pendingActionItems} pending or open remediation signals and confirm due dates with owners.`
    );
  }

  if (input.mediumRiskItems > 0) {
    recommendations.push(
      `Schedule a planned remediation review for the ${input.mediumRiskItems} medium-risk items to prevent escalation.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Maintain periodic monitoring because the uploaded files did not produce strong exception signals under the current audit rule set."
    );
  }

  return recommendations;
}

function extractCompanyName(text: string, parsedFiles: ParsedAuditFile[]) {
  const combinedFileNames = parsedFiles.map((file) => file.name).join(" ");
  const combinedText = `${combinedFileNames} ${text}`;

  const northstarMatch = combinedText.match(/\b(Northstar Retail Group)\b/i);

  if (northstarMatch?.[1]) {
    return "Northstar Retail Group";
  }

  const companyPatterns = [
    /Company:\s*([A-Z][A-Za-z0-9&., ]{3,80})/i,
    /Entity:\s*([A-Z][A-Za-z0-9&., ]{3,80})/i,
    /([A-Z][A-Za-z0-9&., ]{3,80})\s+(?:Internal Audit Report|Audit Report|Compliance Checklist|Risk Assessment)/,
  ];

  for (const pattern of companyPatterns) {
    const match = combinedText.match(pattern);

    if (match?.[1]) {
      return cleanCompanyName(match[1]);
    }
  }

  return "Uploaded Audit Package";
}

function cleanCompanyName(name: string) {
  const cleaned = cleanText(name)
    .replace(
      /\b(Mock|Dataset|Page|Internal|Audit|Report|Compliance|Checklist)\b/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  return toTitleCase(cleaned || "Uploaded Audit Package");
}

function extractComplianceScore(text: string) {
  const patterns = [
    /compliance score[^0-9]{0,20}(\d{2,3})\s*%/i,
    /(\d{2,3})\s*%\s*(?:compliance|compliant)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = Number(match?.[1]);

    if (value >= 0 && value <= 100) {
      return value;
    }
  }

  return null;
}

function inferVendorRiskRating(
  text: string,
  findings: DetailFinding[]
): RiskLevel {
  const vendorMentions = countMatches(
    text,
    /\b(vendor|procurement|supplier|purchase order|approval trail)\b/gi
  );

  const highVendorFindings = findings.filter(
    (finding) => finding.owner === "Procurement" && finding.risk === "High"
  ).length;

  if (vendorMentions > 6 || highVendorFindings >= 1) {
    return "High";
  }

  if (vendorMentions > 2) {
    return "Medium";
  }

  return "Low";
}

function summarizeDominantThemes(text: string) {
  const themes = [
    {
      label: "vendor approvals and procurement documentation",
      count: countMatches(text, /\b(vendor|procurement|supplier|approval)\b/gi),
    },
    {
      label: "inventory reconciliation and ledger mismatches",
      count: countMatches(text, /\b(inventory|ledger|stock|count|warehouse)\b/gi),
    },
    {
      label: "financial variances and reconciliation exceptions",
      count: countMatches(
        text,
        /\b(financial|revenue|expense|variance|reconciliation|cash flow)\b/gi
      ),
    },
    {
      label: "control ownership and remediation tracking",
      count: countMatches(
        text,
        /\b(control|owner|remediation|action|pending|overdue)\b/gi
      ),
    },
  ];

  const sortedThemes = themes.sort((a, b) => b.count - a.count);

  return sortedThemes[0].count > 0
    ? sortedThemes[0].label
    : "general audit control review";
}

function summarizeDominantThemesFromAnalysis(analysis: AuditAnalysis) {
  const findingText = analysis.findings
    .map((finding) => finding.finding)
    .join(" ");

  return summarizeDominantThemes(findingText);
}

function findBestExcerpt(
  parsedFiles: ParsedAuditFile[],
  primary: RegExp,
  secondary: RegExp
) {
  for (const file of parsedFiles) {
    const lines = file.text
      .split(/\n|\. /)
      .map((line) => cleanText(line))
      .filter((line) => line.length > 45)
      .filter((line) => line.length < 260)
      .filter((line) => primary.test(line) && secondary.test(line))
      .filter((line) => !isHeaderLikeLine(line));

    if (lines[0]) {
      return truncateText(lines[0], 220);
    }
  }

  return "";
}

function inferRiskLevel(text: string): RiskLevel {
  if (/\b(critical|high|material|severe|urgent|high-value)\b/i.test(text)) {
    return "High";
  }

  if (
    /\b(medium|moderate|pending|overdue|exception|variance|mismatch|gap|remediation|owner)\b/i.test(
      text
    )
  ) {
    return "Medium";
  }

  return "Low";
}

function inferOwner(fileName: string, text: string) {
  const combinedText = `${fileName} ${text}`.toLowerCase();

  if (/vendor|procurement|supplier|purchase/.test(combinedText)) {
    return "Procurement";
  }

  if (/inventory|warehouse|stock|ledger/.test(combinedText)) {
    return "Operations";
  }

  if (/financial|revenue|cash|expense|balance|p&l|profit/.test(combinedText)) {
    return "Finance";
  }

  if (/compliance|policy|checklist|regulatory/.test(combinedText)) {
    return "Compliance";
  }

  if (/risk|matrix/.test(combinedText)) {
    return "Risk Management";
  }

  return "Internal Audit";
}

function firstMeaningfulExcerpt(text: string) {
  return (
    text
      .split(/\n|\. /)
      .map((line) => cleanText(line))
      .filter((line) => !isHeaderLikeLine(line))
      .find((line) => line.length > 60) || ""
  );
}

function isHeaderLikeLine(line: string) {
  return (
    /mock internal audit dataset/i.test(line) ||
    /prepared for/i.test(line) ||
    /report date/i.test(line) ||
    /executive package/i.test(line) ||
    /^page\s+\d+/i.test(line) ||
    line.split(" ").length < 5
  );
}

function makeFindingSentence(line: string) {
  const cleaned = truncateText(line, 118);

  if (/[.!?]$/.test(cleaned)) {
    return cleaned;
  }

  return `${cleaned}.`;
}

function countRows(text: string) {
  return text
    .split(/\n/)
    .map((row) => row.trim())
    .filter(Boolean).length;
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length || 0;
}

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").replace(/,+/g, ",").trim();
}

function truncateText(text: string, maxLength: number) {
  const cleaned = cleanText(text);

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength - 3)}...`;
}

function readableFileName(fileName: string) {
  return (
    fileName
      .split("/")
      .pop()
      ?.replace(/\.[^/.]+$/, "")
      .replace(/_/g, " ")
      .trim() || fileName
  );
}

function formatTextSize(characterCount: number) {
  if (characterCount < 1000) {
    return `${characterCount} characters`;
  }

  return `${Math.round(characterCount / 100) / 10}k characters`;
}

function similarityKey(text: string) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(" ")
    .slice(0, 8)
    .join(" ");
}

function toTitleCase(text: string) {
  return cleanText(text)
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default App;