import { getSupabaseClient } from "@/lib/supabase";

type AnalysisRow = {
  id: string;
  created_at: string;
  resume_text: string;
  job_description: string;
  match_score: number;
  overall_match: string;
  strengths: unknown;
  missing_keywords: unknown;
  suggestions: unknown;
  example_bullet_rewrites: unknown;
};

function getBearerToken(request: Request) {
  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function mapHistoryItem(row: AnalysisRow) {
  return {
    id: row.id,
    created_at: row.created_at,
    resume_text: row.resume_text,
    job_description: row.job_description,
    match_score: row.match_score,
    overall_match: row.overall_match,
    strengths: toStringArray(row.strengths),
    missing_keywords: toStringArray(row.missing_keywords),
    suggestions: toStringArray(row.suggestions),
    example_bullet_rewrites: toStringArray(row.example_bullet_rewrites),
  };
}

async function getAuthenticatedUser(request: Request) {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return { accessToken: null, userId: null, error: null };
  }

  const supabase = getSupabaseClient(accessToken);

  if (!supabase) {
    return {
      accessToken,
      userId: null,
      error: Response.json(
        { error: "Supabase is not configured." },
        { status: 500 },
      ),
    };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return {
      accessToken,
      userId: null,
      error: Response.json({ error: "Invalid session." }, { status: 401 }),
    };
  }

  return { accessToken, userId: user.id, error: null };
}

export async function GET(request: Request) {
  const { accessToken, userId, error } = await getAuthenticatedUser(request);

  if (error) {
    return error;
  }

  if (!accessToken || !userId) {
    return Response.json({
      history: [],
      message: "Sign in to view history.",
    });
  }

  const supabase = getSupabaseClient(accessToken);

  if (!supabase) {
    return Response.json({ history: [], configured: false });
  }

  const { data, error: queryError } = await supabase
    .from("analyses")
    .select(
      "id, created_at, resume_text, job_description, match_score, overall_match, strengths, missing_keywords, suggestions, example_bullet_rewrites",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (queryError) {
    return Response.json(
      { error: "Failed to load analysis history." },
      { status: 500 },
    );
  }

  return Response.json({
    history: ((data || []) as AnalysisRow[]).map(mapHistoryItem),
  });
}

export async function DELETE(request: Request) {
  const { accessToken, userId, error } = await getAuthenticatedUser(request);

  if (error) {
    return error;
  }

  if (!accessToken || !userId) {
    return Response.json({ error: "Sign in to delete history." }, { status: 401 });
  }

  const supabase = getSupabaseClient(accessToken);

  if (!supabase) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return Response.json(
      { error: "History record id is required." },
      { status: 400 },
    );
  }

  const { error: deleteError } = await supabase
    .from("analyses")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (deleteError) {
    return Response.json(
      { error: "Failed to delete analysis history item." },
      { status: 500 },
    );
  }

  return Response.json({ success: true });
}
