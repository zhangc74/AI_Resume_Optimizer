import OpenAI from "openai";

type AnalysisResult = {
  matchScore: number;
  overallMatch: string;
  strengths: string[];
  missingKeywords: string[];
  suggestions: string[];
  exampleBulletRewrites: string[];
};

type TranslatedAnalysis = {
  overallMatchZh: string;
  strengthsZh: string[];
  missingKeywordsZh: string[];
  suggestionsZh: string[];
  exampleBulletRewritesZh: string[];
};

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
    typeof analysis.overallMatch === "string" &&
    isStringArray(analysis.strengths) &&
    isStringArray(analysis.missingKeywords) &&
    isStringArray(analysis.suggestions) &&
    isStringArray(analysis.exampleBulletRewrites)
  );
}

function isTranslatedAnalysis(value: unknown): value is TranslatedAnalysis {
  if (!value || typeof value !== "object") {
    return false;
  }

  const translation = value as Record<string, unknown>;

  return (
    typeof translation.overallMatchZh === "string" &&
    isStringArray(translation.strengthsZh) &&
    isStringArray(translation.missingKeywordsZh) &&
    isStringArray(translation.suggestionsZh) &&
    isStringArray(translation.exampleBulletRewritesZh)
  );
}

export async function POST(request: Request) {
  try {
    const { analysis } = await request.json();

    if (!isAnalysisResult(analysis)) {
      return Response.json({ error: "Analysis is required." }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "Server configuration error: missing OPENAI_API_KEY." },
        { status: 500 },
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `
Translate this resume analysis into natural, accurate Chinese.

Rules:
- Keep technical terms in English when appropriate, including SQL, Python, React, AWS, Docker, API, ETL, Supabase, PostgreSQL, TypeScript, and JavaScript.
- Do not add information that is not in the source.
- Do not translate matchScore.
- Do not output markdown.
- Do not output code fences.
- Return only valid JSON.

JSON shape:
{
  "translation": {
    "overallMatchZh": string,
    "strengthsZh": string[],
    "missingKeywordsZh": string[],
    "suggestionsZh": string[],
    "exampleBulletRewritesZh": string[]
  }
}

Analysis:
${JSON.stringify(analysis)}
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
        { error: "Failed to parse translation response as JSON." },
        { status: 500 },
      );
    }

    let parsedResponse: unknown;

    try {
      parsedResponse = JSON.parse(content);
    } catch {
      return Response.json(
        { error: "Failed to parse translation response as JSON." },
        { status: 500 },
      );
    }

    const translation =
      parsedResponse &&
      typeof parsedResponse === "object" &&
      "translation" in parsedResponse
        ? (parsedResponse as { translation: unknown }).translation
        : null;

    if (!isTranslatedAnalysis(translation)) {
      return Response.json(
        { error: "Translation response format validation failed." },
        { status: 500 },
      );
    }

    return Response.json({ translation });
  } catch (error) {
    console.error("Translation failed:", error);

    return Response.json(
      { error: "Failed to translate analysis. Please try again." },
      { status: 500 },
    );
  }
}
