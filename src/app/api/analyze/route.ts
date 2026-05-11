import OpenAI from "openai";
import { getSupabaseClient } from "@/lib/supabase";
import { chunkText, hashText } from "@/lib/text";

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

type SavedAnalysisResult = {
  saved: boolean;
  recordId: string | null;
};

type AnalysisMode = "cache" | "rag" | "full";

type CachedAnalysisRecord = {
  id: string;
  match_score: number;
  overall_match: string;
  strengths: string[];
  missing_keywords: string[];
  suggestions: string[];
  example_bullet_rewrites: string[];
};

type RagResult = {
  ragUsed: boolean;
  resumeContext: string;
};

function cleanJobDescription(text: string): string {
  const cleanedText = text
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  const sectionPatterns = [
    /^equal opportunity\b/im,
    /^benefits\b/im,
    /^about us\b/im,
    /^company description\b/im,
    /^privacy\b/im,
    /^legal\b/im,
    /^pay transparency\b/im,
  ];

  const sectionIndexes = sectionPatterns
    .map((pattern) => cleanedText.search(pattern))
    .filter((index) => index > 0);

  if (sectionIndexes.length === 0) {
    return cleanedText;
  }

  return cleanedText.slice(0, Math.min(...sectionIndexes)).trim();
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const analysis = value as Record<string, unknown>;

  return (
    typeof analysis.matchScore === "number" &&
    analysis.matchScore >= 0 &&
    analysis.matchScore <= 100 &&
    typeof analysis.overallMatch === "string" &&
    isStringArray(analysis.strengths) &&
    isStringArray(analysis.missingKeywords) &&
    isStringArray(analysis.suggestions) &&
    isStringArray(analysis.exampleBulletRewrites)
  );
}

function recordToAnalysis(record: CachedAnalysisRecord): AnalysisResult {
  return {
    matchScore: record.match_score,
    overallMatch: record.overall_match,
    strengths: record.strengths,
    missingKeywords: record.missing_keywords,
    suggestions: record.suggestions,
    exampleBulletRewrites: record.example_bullet_rewrites,
  };
}

async function findCachedAnalysis({
  accessToken,
  userId,
  resumeHash,
  jdHash,
}: {
  accessToken: string;
  userId: string;
  resumeHash: string;
  jdHash: string;
}) {
  const supabase = getSupabaseClient(accessToken);

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("analyses")
    .select(
      "id, match_score, overall_match, strengths, missing_keywords, suggestions, example_bullet_rewrites",
    )
    .eq("user_id", userId)
    .eq("resume_hash", resumeHash)
    .eq("jd_hash", jdHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const analysis = recordToAnalysis(data as CachedAnalysisRecord);

  if (!isAnalysisResult(analysis)) {
    return null;
  }

  return {
    analysis,
    recordId: data.id as string,
  };
}

async function createEmbedding(openai: OpenAI, input: string) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input,
  });

  return response.data[0]?.embedding || null;
}

async function buildRagContext({
  accessToken,
  userId,
  resumeText,
  resumeHash,
  jobDescription,
  openai,
}: {
  accessToken: string;
  userId: string;
  resumeText: string;
  resumeHash: string;
  jobDescription: string;
  openai: OpenAI;
}): Promise<RagResult> {
  const supabase = getSupabaseClient(accessToken);

  if (!supabase) {
    return { ragUsed: false, resumeContext: resumeText };
  }

  try {
    const { count, error: countError } = await supabase
      .from("resume_chunks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("resume_hash", resumeHash);

    if (countError) {
      return { ragUsed: false, resumeContext: resumeText };
    }

    if (!count) {
      const chunks = chunkText(resumeText).slice(0, 20);
      const chunkRows = [];

      for (const [index, chunk] of chunks.entries()) {
        const embedding = await createEmbedding(openai, chunk);

        if (!embedding) {
          return { ragUsed: false, resumeContext: resumeText };
        }

        chunkRows.push({
          user_id: userId,
          resume_hash: resumeHash,
          chunk_index: index,
          content: chunk,
          embedding,
        });
      }

      const { error: insertError } = await supabase
        .from("resume_chunks")
        .insert(chunkRows);

      if (insertError) {
        return { ragUsed: false, resumeContext: resumeText };
      }
    }

    const jdEmbedding = await createEmbedding(openai, jobDescription);

    if (!jdEmbedding) {
      return { ragUsed: false, resumeContext: resumeText };
    }

    const { data, error: matchError } = await supabase.rpc(
      "match_resume_chunks",
      {
        query_embedding: jdEmbedding,
        match_user_id: userId,
        match_resume_hash: resumeHash,
        match_count: 5,
      },
    );

    if (matchError || !Array.isArray(data) || data.length === 0) {
      return { ragUsed: false, resumeContext: resumeText };
    }

    const relevantChunks = data
      .map((item) =>
        typeof item?.content === "string" ? item.content.trim() : "",
      )
      .filter(Boolean);

    if (relevantChunks.length === 0) {
      return { ragUsed: false, resumeContext: resumeText };
    }

    return {
      ragUsed: true,
      resumeContext: relevantChunks
        .map((chunk, index) => `Relevant Resume Section ${index + 1}:\n${chunk}`)
        .join("\n\n"),
    };
  } catch (error) {
    console.error("RAG retrieval failed, falling back to full resume.", error);
    return { ragUsed: false, resumeContext: resumeText };
  }
}

async function saveAnalysisRecord({
  resumeText,
  jobDescription,
  analysis,
  accessToken,
  userId,
  resumeHash,
  jdHash,
  source,
}: {
  resumeText: string;
  jobDescription: string;
  analysis: AnalysisResult;
  accessToken: string;
  userId: string;
  resumeHash: string;
  jdHash: string;
  source: string;
}): Promise<SavedAnalysisResult> {
  const supabase = getSupabaseClient(accessToken);

  if (!supabase) {
    return { saved: false, recordId: null };
  }

  const insertPayload = {
    user_id: userId,
    resume_text: resumeText,
    job_description: jobDescription,
    match_score: analysis.matchScore,
    overall_match: analysis.overallMatch,
    strengths: analysis.strengths,
    missing_keywords: analysis.missingKeywords,
    suggestions: analysis.suggestions,
    example_bullet_rewrites: analysis.exampleBulletRewrites,
    resume_hash: resumeHash,
    jd_hash: jdHash,
    source,
  };

  const { data, error } = await supabase
    .from("analyses")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !data?.id) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("analyses")
      .insert({
        user_id: userId,
        resume_text: resumeText,
        job_description: jobDescription,
        match_score: analysis.matchScore,
        overall_match: analysis.overallMatch,
        strengths: analysis.strengths,
        missing_keywords: analysis.missingKeywords,
        suggestions: analysis.suggestions,
        example_bullet_rewrites: analysis.exampleBulletRewrites,
      })
      .select("id")
      .single();

    if (fallbackError || !fallbackData?.id) {
      console.error("Failed to save analysis history.");
      return { saved: false, recordId: null };
    }

    return { saved: true, recordId: fallbackData.id as string };
  }

  return { saved: true, recordId: data.id as string };
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}

export async function POST(request: Request) {
  try {
    const { resumeText, jobDescription } = await request.json();
    const trimmedResumeText =
      typeof resumeText === "string" ? resumeText.trim() : "";
    const trimmedJobDescription =
      typeof jobDescription === "string" ? jobDescription.trim() : "";

    if (!trimmedResumeText || !trimmedJobDescription) {
      return Response.json(
        { error: "Resume text and job description are required." },
        { status: 400 },
      );
    }

    if (trimmedResumeText.length > MAX_RESUME_CHARS) {
      return Response.json(
        {
          error:
            "Resume text is too long. Please keep it under 8000 characters.",
        },
        { status: 400 },
      );
    }

    if (trimmedJobDescription.length > MAX_JD_CHARS) {
      return Response.json(
        {
          error:
            "Job description is too long. Please keep it under 8000 characters.",
        },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "Server configuration error: missing OPENAI_API_KEY." },
        { status: 500 },
      );
    }

    const cleanedJobDescription = cleanJobDescription(trimmedJobDescription);
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const resumeHash = hashText(trimmedResumeText);
    const jdHash = hashText(cleanedJobDescription);
    const accessToken = getBearerToken(request);
    let userId: string | null = null;

    if (accessToken) {
      const supabase = getSupabaseClient(accessToken);

      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser(accessToken);

        userId = user?.id || null;
      }
    }

    if (accessToken && userId) {
      const cachedResult = await findCachedAnalysis({
        accessToken,
        userId,
        resumeHash,
        jdHash,
      });

      if (cachedResult) {
        return Response.json({
          analysis: cachedResult.analysis,
          saved: true,
          recordId: cachedResult.recordId,
          cacheHit: true,
          ragUsed: false,
          analysisMode: "cache" satisfies AnalysisMode,
        });
      }
    }

    const ragResult =
      accessToken && userId
        ? await buildRagContext({
            accessToken,
            userId,
            resumeText: trimmedResumeText,
            resumeHash,
            jobDescription: cleanedJobDescription,
            openai,
          })
        : { ragUsed: false, resumeContext: trimmedResumeText };
    const analysisMode: AnalysisMode = ragResult.ragUsed ? "rag" : "full";

    const prompt = `
Analyze this resume against this job description.

Focus only on job requirements, responsibilities, skills, and qualifications.
Ignore company marketing, benefits, legal, privacy, pay transparency, and equal opportunity text.
Use the provided resume context. If it contains only relevant resume sections, do not assume missing sections exist.
Return only valid JSON. Do not include markdown fences or extra explanation outside JSON.

JSON shape:
{
  "matchScore": number from 0 to 100,
  "overallMatch": string,
  "strengths": string[],
  "missingKeywords": string[],
  "suggestions": string[],
  "exampleBulletRewrites": string[]
}

Resume Context:
${ragResult.resumeContext}

Job Description:
${cleanedJobDescription}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return Response.json(
        { error: "Failed to parse AI response as JSON." },
        { status: 500 },
      );
    }

    let analysis: unknown;

    try {
      analysis = JSON.parse(content);
    } catch {
      return Response.json(
        { error: "Failed to parse AI response as JSON." },
        { status: 500 },
      );
    }

    if (!isAnalysisResult(analysis)) {
      return Response.json(
        { error: "AI response format validation failed." },
        { status: 500 },
      );
    }

    let savedResult: SavedAnalysisResult = { saved: false, recordId: null };

    if (accessToken && userId) {
      savedResult = await saveAnalysisRecord({
        resumeText: trimmedResumeText,
        jobDescription: cleanedJobDescription,
        analysis,
        accessToken,
        userId,
        resumeHash,
        jdHash,
        source: analysisMode === "rag" ? "rag" : "openai",
      });
    }

    return Response.json({
      analysis,
      saved: savedResult.saved,
      recordId: savedResult.recordId,
      cacheHit: false,
      ragUsed: ragResult.ragUsed,
      analysisMode,
    });
  } catch (error) {
    console.error("Resume analysis failed:", error);

    return Response.json(
      { error: "Failed to analyze resume. Please try again." },
      { status: 500 },
    );
  }
}
