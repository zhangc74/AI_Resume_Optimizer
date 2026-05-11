"use client";

import type { User } from "@supabase/supabase-js";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { getSupabaseClient, getSupabaseConfigError } from "@/lib/supabase";

const MAX_RESUME_CHARS = 8000;
const MAX_JD_CHARS = 8000;

type AnalysisResult = {
  matchScore: number;
  overallMatch: string;
  strengths: string[];
  missingKeywords: string[];
  suggestions: string[];
  exampleBulletRewrites: string[];
};

type HistoryItem = {
  id: string;
  created_at: string;
  resume_text: string;
  job_description: string;
  match_score: number;
  overall_match: string;
  strengths: string[];
  missing_keywords: string[];
  suggestions: string[];
  example_bullet_rewrites: string[];
};

type AnalyzeResponse = {
  analysis?: AnalysisResult;
  saved?: boolean;
  recordId?: string | null;
  cacheHit?: boolean;
  ragUsed?: boolean;
  analysisMode?: "cache" | "rag" | "full";
  error?: string;
};

type HistoryResponse = {
  history?: HistoryItem[];
  message?: string;
  error?: string;
};

type TranslatedAnalysis = {
  overallMatchZh: string;
  strengthsZh: string[];
  missingKeywordsZh: string[];
  suggestionsZh: string[];
  exampleBulletRewritesZh: string[];
};

type Language = "en" | "zh";

const UI_COPY = {
  en: {
    appEyebrow: "V7 Final AI Resume Optimizer",
    appTitle: "AI Resume Optimizer",
    appIntro:
      "Compare a resume against a job description, get structured AI feedback, translate it to Chinese, and save private history when signed in.",
    account: "Account",
    historyAccess: "History Access",
    signedIn: "Signed in",
    guest: "Guest",
    signInPrompt: "Sign in to save and view your analysis history.",
    signIn: "Sign In",
    signUp: "Sign Up",
    signOut: "Sign Out",
    resume: "Resume",
    jobDescription: "Job Description",
    uploadResume: "Upload PDF / DOCX Resume",
    analyze: "Analyze Resume",
    analyzing: "Analyzing...",
    clear: "Clear",
    addInputs: "Add both inputs to enable analysis.",
    analysisResult: "Analysis Result",
    copyResult: "Copy Result",
    translate: "Translate to Chinese",
    translating: "Translating...",
    matchScore: "Match Score",
    overallMatch: "Overall Match",
    strengths: "Strengths",
    missingKeywords: "Missing Keywords",
    suggestions: "Resume Improvement Suggestions",
    rewrites: "Example Bullet Rewrites",
    waiting: "Waiting for analysis",
    resultsAppear: "Results will appear here",
    analysisHistory: "Analysis History",
    load: "Load",
    delete: "Delete",
    copied: "Copied!",
  },
  zh: {
    appEyebrow: "V7 最终版 AI 简历优化器",
    appTitle: "AI 简历优化器",
    appIntro:
      "对比简历和岗位 JD，生成结构化 AI 分析，支持中文翻译，并在登录后保存私人历史记录。",
    account: "账户",
    historyAccess: "历史记录权限",
    signedIn: "已登录",
    guest: "游客",
    signInPrompt: "登录后可以保存和查看分析历史。",
    signIn: "登录",
    signUp: "注册",
    signOut: "退出",
    resume: "简历",
    jobDescription: "岗位 JD",
    uploadResume: "上传 PDF / DOCX 简历",
    analyze: "分析简历",
    analyzing: "分析中...",
    clear: "清空",
    addInputs: "请先填写简历和岗位 JD。",
    analysisResult: "分析结果",
    copyResult: "复制结果",
    translate: "翻译成中文",
    translating: "翻译中...",
    matchScore: "匹配分数",
    overallMatch: "整体匹配度",
    strengths: "优势",
    missingKeywords: "缺失关键词",
    suggestions: "简历优化建议",
    rewrites: "Bullet 改写示例",
    waiting: "等待分析",
    resultsAppear: "结果会显示在这里",
    analysisHistory: "分析历史",
    load: "加载",
    delete: "删除",
    copied: "已复制",
  },
} satisfies Record<Language, Record<string, string>>;

function CharacterCounter({
  count,
  max,
  label,
}: {
  count: number;
  max: number;
  label: string;
}) {
  const isOverLimit = count > max;

  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className={isOverLimit ? "text-red-600" : "text-slate-500"}>
        {count}/{max} characters
      </span>
      {isOverLimit ? (
        <span className="text-right text-red-600">
          {label} is too long.
        </span>
      ) : null}
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
    </div>
  );
}

function TranslationBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm leading-relaxed text-emerald-950">
      <p className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
        Chinese Translation
      </p>
      <p className="hidden">
        中文翻译
      </p>
      {children}
    </div>
  );
}

function formatAnalysisForClipboard(
  analysis: AnalysisResult,
  translation: TranslatedAnalysis | null,
) {
  return [
    `Match Score: ${analysis.matchScore}/100`,
    "",
    "Overall Match:",
    analysis.overallMatch,
    ...(translation ? ["", "Chinese Translation:", translation.overallMatchZh] : []),
    "",
    "Strengths:",
    ...analysis.strengths.map((item, index) =>
      translation?.strengthsZh[index]
        ? `- ${item}\n  Chinese: ${translation.strengthsZh[index]}`
        : `- ${item}`,
    ),
    "",
    "Missing Keywords:",
    ...analysis.missingKeywords.map((item, index) =>
      translation?.missingKeywordsZh[index]
        ? `- ${item}\n  Chinese: ${translation.missingKeywordsZh[index]}`
        : `- ${item}`,
    ),
    "",
    "Suggestions:",
    ...analysis.suggestions.map((item, index) =>
      translation?.suggestionsZh[index]
        ? `- ${item}\n  Chinese: ${translation.suggestionsZh[index]}`
        : `- ${item}`,
    ),
    "",
    "Example Bullet Rewrites:",
    ...analysis.exampleBulletRewrites.map((item, index) =>
      translation?.exampleBulletRewritesZh[index]
        ? `- ${item}\n  Chinese: ${translation.exampleBulletRewritesZh[index]}`
        : `- ${item}`,
    ),
  ].join("\n");
}

function historyItemToAnalysis(item: HistoryItem): AnalysisResult {
  return {
    matchScore: item.match_score,
    overallMatch: item.overall_match,
    strengths: item.strengths,
    missingKeywords: item.missing_keywords,
    suggestions: item.suggestions,
    exampleBulletRewrites: item.example_bullet_rewrites,
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getAuthErrorMessage(error: unknown) {
  if (error instanceof TypeError) {
    return "Failed to connect to Supabase Auth. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";
  }

  return error instanceof Error ? error.message : "Authentication failed.";
}

async function getAccessToken() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || null;
  } catch (error) {
    console.warn("Supabase session could not be refreshed.", error);
    return null;
  }
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("en");
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [translation, setTranslation] = useState<TranslatedAnalysis | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [isSupabaseConfigured, setIsSupabaseConfigured] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfWarning, setPdfWarning] = useState("");
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState("");

  const isResumeEmpty = !resumeText.trim();
  const isJobDescriptionEmpty = !jobDescription.trim();
  const isResumeTooLong = resumeText.length > MAX_RESUME_CHARS;
  const isJobDescriptionTooLong = jobDescription.length > MAX_JD_CHARS;
  const isAnalyzeDisabled =
    isLoading ||
    isResumeEmpty ||
    isJobDescriptionEmpty ||
    isResumeTooLong ||
    isJobDescriptionTooLong;
  const t = UI_COPY[language];

  const fetchHistory = useCallback(async () => {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      setHistory([]);
      setHistoryStatus("Sign in to save and view analysis history.");
      return;
    }

    try {
      const response = await fetch("/api/history", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = (await response.json()) as HistoryResponse;

      if (!response.ok) {
        throw new Error(data.error || "Failed to load history.");
      }

      setHistory(data.history || []);
      setHistoryStatus(data.message || "");
    } catch {
      setHistory([]);
      setHistoryStatus("History could not be loaded right now.");
    }
  }, []);

  useEffect(() => {
    const configError = getSupabaseConfigError();
    const supabase = getSupabaseClient();

    if (!supabase || configError) {
      const timeoutId = window.setTimeout(() => {
        setIsSupabaseConfigured(false);
        setAuthMessage(
          configError ||
            "Supabase is not configured. Check your environment variables.",
        );
        setHistoryStatus(
          configError ||
            "Supabase is not configured. Check your environment variables.",
        );
        if (configError) {
          console.warn(configError);
        }
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      void supabase.auth
        .getUser()
        .then(({ data }) => {
          setUser(data.user);
          if (data.user) {
            void fetchHistory();
          } else {
            setHistory([]);
            setHistoryStatus("Sign in to save and view analysis history.");
          }
        })
        .catch((error) => {
          console.warn("Supabase user session could not be loaded.", error);
          setUser(null);
          setHistory([]);
          setAuthMessage(
            "Supabase Auth session could not be refreshed. Please sign in again.",
          );
          setHistoryStatus("Sign in to save and view analysis history.");
        });
    }, 0);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setAuthMessage(
        session?.user
          ? `Signed in as: ${session.user.email}`
          : "Sign in to save and view your analysis history.",
      );
      if (session?.user) {
        void fetchHistory();
      } else {
        setHistory([]);
        setHistoryStatus("Sign in to save and view analysis history.");
      }
    });

    return () => {
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [fetchHistory]);

  async function handleSignUp() {
    const configError = getSupabaseConfigError();
    const supabase = getSupabaseClient();

    if (!supabase || configError) {
      setAuthMessage(
        configError ||
          "Supabase is not configured. Check your environment variables.",
      );
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        throw signUpError;
      }

      setAuthMessage("Sign up successful. Check your email if confirmation is enabled.");
    } catch (authError) {
      setAuthMessage(getAuthErrorMessage(authError));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignIn() {
    const configError = getSupabaseConfigError();
    const supabase = getSupabaseClient();

    if (!supabase || configError) {
      setAuthMessage(
        configError ||
          "Supabase is not configured. Check your environment variables.",
      );
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      setAuthMessage("Signed in successfully.");
      await fetchHistory();
    } catch (authError) {
      setAuthMessage(getAuthErrorMessage(authError));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    setAuthLoading(true);

    try {
      await supabase.auth.signOut();
      setUser(null);
      setHistory([]);
      setAuthMessage("Signed out.");
      setHistoryStatus("Sign in to save and view analysis history.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAnalysis(null);
    setTranslation(null);
    setTranslationError("");
    setCopyStatus("");
    setSaveStatus("");
    setAnalysisStatus("");

    if (isAnalyzeDisabled) {
      return;
    }

    setIsLoading(true);

    try {
      const accessToken = await getAccessToken();
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify({
          resumeText,
          jobDescription,
        }),
      });

      const data = (await response.json()) as AnalyzeResponse;

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to analyze resume. Please try again.",
        );
      }

      if (!data.analysis) {
        throw new Error("Failed to analyze resume. Please try again.");
      }

      setAnalysis(data.analysis);
      setAnalysisStatus(
        data.cacheHit
          ? "Loaded from cache."
          : data.ragUsed
            ? "Relevant resume sections retrieved."
            : "Full resume analysis used.",
      );
      setSaveStatus(
        data.cacheHit
          ? "Loaded from saved history cache."
          : data.saved
          ? "Saved to history."
          : "Analysis complete. Sign in to save history.",
      );

      if (data.saved) {
        await fetchHistory();
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to analyze resume. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleClear() {
    setResumeText("");
    setJobDescription("");
    setAnalysis(null);
    setTranslation(null);
    setTranslationError("");
    setError("");
    setCopyStatus("");
    setSaveStatus("");
    setAnalysisStatus("");
    setPdfStatus("");
    setPdfWarning("");
  }

  async function handleCopyResult() {
    if (!analysis) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        formatAnalysisForClipboard(analysis, translation),
      );
      setCopyStatus(t.copied);
      window.setTimeout(() => setCopyStatus(""), 1800);
    } catch {
      setCopyStatus("Copy failed. Please try again.");
    }
  }

  async function handlePdfUpload(file: File | null) {
    if (!file) {
      return;
    }

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    const isDocx =
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.toLowerCase().endsWith(".docx");

    if (!isPdf && !isDocx) {
      setPdfWarning("Please upload a PDF or DOCX resume file.");
      return;
    }

    setPdfStatus(isPdf ? "Extracting PDF..." : "Extracting DOCX...");
    setPdfWarning("");
    setError("");
    setIsExtractingPdf(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/resume/extract", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        resumeText?: string;
        fileType?: "pdf" | "docx";
        error?: string;
      };

      if (!response.ok || !data.resumeText) {
        throw new Error(data.error || "Could not extract text from this file.");
      }

      setResumeText(data.resumeText);
      setPdfStatus(
        data.fileType === "docx"
          ? "DOCX text extracted successfully."
          : "PDF text extracted successfully.",
      );

      const supabase = getSupabaseClient();

      if (!user || !supabase) {
        setPdfWarning("Sign in to save uploaded resume files.");
        return;
      }

      setPdfStatus(
        data.fileType === "docx" ? "Uploading DOCX..." : "Uploading PDF...",
      );
      setIsUploadingPdf(true);

      const storagePath = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(storagePath, file, {
          contentType:
            file.type ||
            (data.fileType === "docx"
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : "application/pdf"),
          upsert: false,
        });

      if (uploadError) {
        setPdfStatus(
          data.fileType === "docx"
            ? "DOCX text extracted successfully."
            : "PDF text extracted successfully.",
        );
        setPdfWarning("Resume text extracted, but file upload failed.");
        return;
      }

      setPdfStatus("Resume text extracted and file uploaded.");
    } catch (uploadError) {
      setPdfStatus("");
      setPdfWarning("");
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not extract text from this file.",
      );
    } finally {
      setIsExtractingPdf(false);
      setIsUploadingPdf(false);
    }
  }

  async function handleTranslate() {
    if (!analysis) {
      return;
    }

    setIsTranslating(true);
    setTranslationError("");

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ analysis }),
      });
      const data = (await response.json()) as {
        translation?: TranslatedAnalysis;
        error?: string;
      };

      if (!response.ok || !data.translation) {
        throw new Error(data.error || "Failed to translate analysis.");
      }

      setTranslation(data.translation);
    } catch (translateError) {
      setTranslationError(
        translateError instanceof Error
          ? translateError.message
          : "Failed to translate analysis.",
      );
    } finally {
      setIsTranslating(false);
    }
  }

  function handleLoadHistoryItem(item: HistoryItem) {
    setResumeText(item.resume_text);
    setJobDescription(item.job_description);
    setAnalysis(historyItemToAnalysis(item));
    setTranslation(null);
    setTranslationError("");
    setError("");
    setCopyStatus("");
    setSaveStatus("Loaded from history.");
    setAnalysisStatus("Loaded from history.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteHistoryItem(id: string) {
    setHistoryStatus("");

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setHistoryStatus("Sign in to delete history.");
        return;
      }

      const response = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete history item.");
      }

      setHistoryStatus("History item deleted.");
      await fetchHistory();
    } catch (deleteError) {
      setHistoryStatus(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete history item.",
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#eef5f2] px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-5">
        <header className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[minmax(0,1fr)_430px]">
          <div className="relative overflow-hidden p-6 lg:p-8">
            <div className="absolute inset-y-0 right-0 hidden w-[52%] opacity-25 lg:block">
              <Image
                src="/images/resume-ai-hero.png"
                alt=""
                fill
                priority
                className="object-cover"
                sizes="640px"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-white/10" />
            </div>

            <div className="relative max-w-2xl">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                  {t.appEyebrow}
                </p>
                <div className="rounded-md border border-slate-200 bg-white p-1 text-xs font-semibold text-slate-600 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setLanguage("en")}
                    className={`rounded px-2 py-1 transition ${
                      language === "en"
                        ? "bg-slate-900 text-white"
                        : "hover:bg-slate-100"
                    }`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage("zh")}
                    className={`rounded px-2 py-1 transition ${
                      language === "zh"
                        ? "bg-slate-900 text-white"
                        : "hover:bg-slate-100"
                    }`}
                  >
                    中文
                  </button>
                </div>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
                {t.appTitle}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                {t.appIntro}
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                <span className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">
                  PDF / DOCX upload
                </span>
                <span className="rounded-md bg-sky-50 px-3 py-2 text-sky-800">
                  Chinese translation
                </span>
                <span className="rounded-md bg-slate-100 px-3 py-2 text-slate-700">
                  Private history
                </span>
              </div>
            </div>
          </div>

          <section className="border-t border-slate-200 bg-slate-50 p-5 lg:border-l lg:border-t-0">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <SectionTitle eyebrow={t.account} title={t.historyAccess} />
                <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
                  {user ? t.signedIn : t.guest}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                {user
                  ? `Signed in as ${user.email}`
                  : t.signInPrompt}
              </p>

              {isSupabaseConfigured ? (
                <div className="grid gap-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      placeholder="Email"
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-500"
                    />
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      placeholder="Password"
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-500"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={handleSignIn}
                      disabled={authLoading}
                      className="h-10 whitespace-nowrap rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      {t.signIn}
                    </button>
                    <button
                      type="button"
                      onClick={handleSignUp}
                      disabled={authLoading}
                      className="h-10 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      {t.signUp}
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={authLoading || !user}
                      className="h-10 whitespace-nowrap rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {t.signOut}
                    </button>
                  </div>
                </div>
              ) : null}

              {authMessage ? (
                <p className="text-sm text-slate-600">{authMessage}</p>
              ) : null}
            </div>
          </section>
        </header>

        <form
          onSubmit={handleAnalyze}
          className="grid gap-5"
        >
          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <SectionTitle eyebrow="Input" title={t.resume} />
                <CharacterCounter
                  count={resumeText.length}
                  max={MAX_RESUME_CHARS}
                  label="Resume text"
                />
              </div>

              <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-700">
                  {t.uploadResume}
                </p>
                <input
                  type="file"
                  accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
                  disabled={isExtractingPdf || isUploadingPdf}
                  onChange={(event) => {
                    void handlePdfUpload(event.target.files?.[0] || null);
                    event.target.value = "";
                  }}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-md file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-500 disabled:cursor-not-allowed"
                />
                {pdfStatus ? (
                  <p className="mt-2 text-sm font-medium text-emerald-700">
                    {pdfStatus}
                  </p>
                ) : null}
                {pdfWarning ? (
                  <p className="mt-2 text-sm font-medium text-amber-700">
                    {pdfWarning}
                  </p>
                ) : null}
              </div>

              <textarea
                value={resumeText}
                onChange={(event) => setResumeText(event.target.value)}
                placeholder="Paste your resume text or upload a PDF/DOCX..."
                className="h-[360px] w-full resize-none rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <SectionTitle eyebrow="Target" title={t.jobDescription} />
                <CharacterCounter
                  count={jobDescription.length}
                  max={MAX_JD_CHARS}
                  label="Job description"
                />
              </div>
              <textarea
                value={jobDescription}
                onChange={(event) => setJobDescription(event.target.value)}
                placeholder="Paste the job description here..."
                className="h-[432px] w-full resize-none rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
              />
            </div>
          </section>

          <section className="grid gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    disabled={isAnalyzeDisabled}
                    className="inline-flex h-12 items-center justify-center rounded-md bg-emerald-600 px-6 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {isLoading ? t.analyzing : t.analyze}
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="inline-flex h-12 items-center justify-center rounded-md border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    {t.clear}
                  </button>
                </div>
                {isResumeEmpty || isJobDescriptionEmpty ? (
                  <p className="text-sm text-slate-500">
                    {t.addInputs}
                  </p>
                ) : null}
              </div>
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
                {error}
              </div>
            ) : null}
            {saveStatus ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                {saveStatus}
              </div>
            ) : null}
            {analysisStatus ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                {analysisStatus}
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            {analysis ? (
              <div className="grid gap-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <SectionTitle eyebrow="Output" title={t.analysisResult} />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {copyStatus ? (
                      <span className="text-sm font-medium text-emerald-700">
                        {copyStatus}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleCopyResult}
                      className="inline-flex h-10 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
                    >
                      {copyStatus === t.copied ? t.copied : t.copyResult}
                    </button>
                    <button
                      type="button"
                      onClick={handleTranslate}
                      disabled={isTranslating}
                      className="inline-flex h-10 items-center justify-center rounded-md border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {isTranslating
                        ? t.translating
                        : t.translate}
                    </button>
                  </div>
                </div>

                {translationError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
                    {translationError}
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      {t.matchScore}
                    </p>
                    <div className="mt-4 flex items-end gap-2">
                      <span className="text-6xl font-semibold text-slate-950">
                        {analysis.matchScore}
                      </span>
                      <span className="pb-2 text-xl font-medium text-emerald-700">
                        /100
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                    <h3 className="text-lg font-semibold text-slate-950">
                      {t.overallMatch}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-700">
                      {analysis.overallMatch}
                    </p>
                    {translation ? (
                      <TranslationBox>
                        <p>
                          {translation.overallMatchZh}
                        </p>
                      </TranslationBox>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-5">
                    <h3 className="text-lg font-semibold text-slate-950">
                      {t.strengths}
                    </h3>
                    <div className="mt-4 divide-y divide-emerald-100 overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50">
                      {analysis.strengths.map((strength, index) => (
                        <div
                          key={strength}
                          className="p-4 text-sm leading-relaxed text-emerald-950"
                        >
                          {strength}
                          {translation?.strengthsZh[index] ? (
                            <TranslationBox>
                              <p>{translation.strengthsZh[index]}</p>
                            </TranslationBox>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-5">
                    <h3 className="text-lg font-semibold text-slate-950">
                      {t.missingKeywords}
                    </h3>
                    <div className="mt-4 divide-y divide-amber-100 overflow-hidden rounded-xl border border-amber-200 bg-amber-50">
                      {analysis.missingKeywords.map((keyword, index) => (
                        <div
                          key={keyword}
                          className="p-4"
                        >
                          <span className="inline-flex rounded-md border border-amber-200 bg-white px-2 py-1 text-sm font-medium text-amber-900">
                            {keyword}
                          </span>
                          {translation?.missingKeywordsZh[index] ? (
                            <TranslationBox>
                              <p>{translation.missingKeywordsZh[index]}</p>
                            </TranslationBox>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                    <h3 className="text-lg font-semibold text-slate-950">
                      {t.suggestions}
                    </h3>
                    <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                      {analysis.suggestions.map((suggestion, index) => (
                        <li
                          key={suggestion}
                          className="border-t border-slate-200 pt-3 first:border-t-0 first:pt-0"
                        >
                          {suggestion}
                          {translation?.suggestionsZh[index] ? (
                            <TranslationBox>
                              <p>{translation.suggestionsZh[index]}</p>
                            </TranslationBox>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                    <h3 className="text-lg font-semibold text-slate-950">
                      {t.rewrites}
                    </h3>
                    <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                      {analysis.exampleBulletRewrites.map((rewrite, index) => (
                        <li
                          key={rewrite}
                          className="border-t border-slate-200 pt-3 first:border-t-0 first:pt-0"
                        >
                          {rewrite}
                          {translation?.exampleBulletRewritesZh[index] ? (
                            <TranslationBox>
                              <p>{translation.exampleBulletRewritesZh[index]}</p>
                            </TranslationBox>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <div className="relative mb-6 h-44 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <Image
                    src="/images/resume-ai-hero.png"
                    alt="AI resume analysis preview"
                    fill
                    className="object-cover"
                    sizes="256px"
                  />
                </div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {t.waiting}
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-950">
                  {t.resultsAppear}
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
                  Add a resume and job description, then run Analyze Resume to
                  see score, gaps, suggestions, rewrites, and optional Chinese
                  translation.
                </p>
              </div>
            )}
          </section>
        </form>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <SectionTitle eyebrow="Private" title={t.analysisHistory} />
            {historyStatus ? (
              <p className="text-sm font-medium text-slate-600">
                {historyStatus}
              </p>
            ) : null}
          </div>

          <div className="mt-4">
            {!isSupabaseConfigured ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
                Supabase is not configured. History and auth are disabled.
              </div>
            ) : !user ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
                Sign in to save and view analysis history.
              </div>
            ) : history.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
                No analysis history yet.
              </div>
            ) : (
              <div className="grid gap-3">
                {history.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
                            {item.match_score}/100
                          </span>
                          <span className="text-sm font-medium text-slate-600">
                            {formatDate(item.created_at)}
                          </span>
                        </div>
                        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-800">
                          {item.overall_match}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.missing_keywords.slice(0, 4).map((keyword) => (
                            <span
                              key={keyword}
                              className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleLoadHistoryItem(item)}
                          className="inline-flex h-10 items-center justify-center rounded-md border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                        >
                          {t.load}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteHistoryItem(item.id)}
                          className="inline-flex h-10 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                        >
                          {t.delete}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
