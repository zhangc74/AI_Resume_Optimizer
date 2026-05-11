# AI Resume Optimizer

AI Resume Optimizer is a full-stack AI SaaS demo built with Next.js App Router. Users can paste or upload a resume, compare it with a job description, receive structured AI feedback, translate the result into Chinese, and save private analysis history when signed in.

## Project Highlights For Recruiters

This project demonstrates a production-like AI SaaS workflow rather than a simple API demo. It includes user authentication, private history, document upload, structured OpenAI output, bilingual UX, caching, and a RAG-ready architecture.

Key product flow:

1. Sign in with email and password.
2. Upload a PDF/DOCX resume or paste resume text manually.
3. Paste a target job description.
4. Run AI analysis to receive a structured match report.
5. Review match score, strengths, missing keywords, improvement suggestions, and rewritten resume bullets.
6. Translate the analysis into Chinese when needed.
7. Save, load, and delete private analysis history.

Engineering highlights:

- Built a full-stack AI SaaS app with Next.js App Router and TypeScript.
- Designed structured JSON output instead of unstable plain-text AI responses.
- Protected user history with Supabase Auth and Row Level Security.
- Added PDF/DOCX parsing and optional Supabase Storage upload.
- Improved token efficiency with input limits, JD cleanup, exact cache, and RAG fallback design.
- Added an English / Chinese UI toggle and user-triggered Chinese translation.

## Screenshots

The screenshots below show the main product workflow from login and input to structured AI analysis, translation, and private history.

### Dashboard And Auth

![Dashboard and Auth](docs/assets/screenshots/dashboard-auth-inputs.png)

The main dashboard shows the AI Resume Optimizer header, English/Chinese toggle, Supabase Auth panel, resume upload, and job description input. It presents the app as a complete SaaS-style workflow rather than a single API form.

### Empty State And History

![Empty State and History](docs/assets/screenshots/empty-state-history.png)

The empty result state explains what the user should do next, while the private Analysis History section shows saved analyses with score, summary, missing keywords, Load, and Delete actions.

### Analysis Result With Translation

![Analysis Result with Translation](docs/assets/screenshots/analysis-overview-translation.png)

The analysis result is rendered as structured cards instead of raw text. The UI separates match score, overall match, strengths, and missing keywords. Chinese translation appears under each corresponding English section.

### Suggestions And Bullet Rewrites

![Suggestions and Bullet Rewrites](docs/assets/screenshots/suggestions-rewrites-translation.png)

The lower result section shows actionable resume improvement suggestions and example bullet rewrites. This makes the product useful beyond scoring because users can directly reuse the generated improvements.

### Chinese UI Mode

![Chinese UI Mode](docs/assets/screenshots/chinese-ui-analysis.png)

The lightweight UI language toggle switches core interface labels between English and Chinese while keeping the AI analysis and manual Translate to Chinese feature separate.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- OpenAI SDK
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage
- Supabase pgvector

## Current Version

V7 Final Enhancement Version

## V7 Features

- Structured resume/JD analysis with OpenAI.
- Supabase Auth sign up, sign in, and sign out.
- RLS-protected analysis history.
- Save, load, and delete your own history records.
- PDF and DOCX resume upload.
- Resume text extraction through `POST /api/resume/extract`.
- Optional Supabase Storage upload for signed-in users.
- Manual Translate to Chinese button through `POST /api/translate`.
- Inline Chinese translation below the corresponding English result.
- Exact cache with `resume_hash + jd_hash`.
- RAG fallback flow with resume chunking, embeddings, and pgvector retrieval.
- Simple English / Chinese UI toggle.
- Graceful fallback to full resume analysis when cache/RAG is unavailable.

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local`.

3. Add environment variables:

   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

## Supabase Setup

### 1. Create Project

1. Open Supabase.
2. Create a new project.
3. Copy the project URL.
4. Copy the anon public key.
5. Add both values to `.env.local`.

Use the project URL only, for example:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
```

Do not use the REST URL ending in `/rest/v1`.

### 2. Enable Email Auth

1. Go to Supabase Dashboard.
2. Open Authentication.
3. Open Providers.
4. Enable Email.
5. For local testing, you can disable email confirmation so users can sign in immediately after sign up.

### 3. Create Analyses Table

Run this SQL in Supabase SQL Editor:

```sql
create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  resume_text text not null,
  job_description text not null,
  match_score int not null,
  overall_match text not null,
  strengths jsonb not null,
  missing_keywords jsonb not null,
  suggestions jsonb not null,
  example_bullet_rewrites jsonb not null
);

alter table analyses enable row level security;

create policy "Users can read their own analyses"
on analyses
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own analyses"
on analyses
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own analyses"
on analyses
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists analyses_user_id_idx on analyses(user_id);
create index if not exists analyses_created_at_idx on analyses(created_at desc);
```

### 4. Add V7 Cache Columns

Run this migration after the `analyses` table exists:

```sql
alter table analyses add column if not exists resume_hash text;
alter table analyses add column if not exists jd_hash text;
alter table analyses add column if not exists source text default 'openai';

create index if not exists analyses_user_hash_idx
on analyses(user_id, resume_hash, jd_hash);
```

Exact cache uses `resume_hash + jd_hash`. If the same signed-in user analyzes the same resume and JD again, the app can return the saved result instead of calling OpenAI again.

### 5. Add pgvector Resume Chunks

Run this SQL for RAG support:

```sql
create extension if not exists vector;

create table if not exists resume_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  resume_hash text not null,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

alter table resume_chunks enable row level security;

create policy "Users can read their own resume chunks"
on resume_chunks
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own resume chunks"
on resume_chunks
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own resume chunks"
on resume_chunks
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists resume_chunks_user_hash_idx
on resume_chunks(user_id, resume_hash);
```

Then create the match function:

```sql
create or replace function match_resume_chunks (
  query_embedding vector(1536),
  match_user_id uuid,
  match_resume_hash text,
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    resume_chunks.id,
    resume_chunks.content,
    1 - (resume_chunks.embedding <=> query_embedding) as similarity
  from resume_chunks
  where resume_chunks.user_id = match_user_id
    and resume_chunks.resume_hash = match_resume_hash
  order by resume_chunks.embedding <=> query_embedding
  limit match_count;
$$;
```

If this SQL is not configured, the app still works. It falls back to full resume analysis.

## Supabase Storage Setup

1. Open Supabase Dashboard.
2. Go to Storage.
3. Create a bucket named `resumes`.
4. Keep the bucket private.
5. Uploaded files use this path format:

   ```text
   user_id/timestamp-file-name.pdf
   user_id/timestamp-file-name.docx
   ```

For learning, the anon key plus Supabase Auth is enough to test uploads if your Storage policies allow authenticated inserts. For production, add Storage policies so users can only access files under their own `user_id` path.

Example policy idea:

```sql
-- In production, create policies on storage.objects for bucket_id = 'resumes'
-- and restrict object names to the signed-in user's auth.uid() prefix.
```

## How The RAG Flow Works

1. The user signs in.
2. The user submits resume text and a job description.
3. The backend hashes the resume.
4. If resume chunks do not exist, the backend chunks the resume.
5. Each chunk gets an embedding from OpenAI.
6. The job description also gets an embedding.
7. Supabase pgvector retrieves the most relevant resume chunks.
8. The AI prompt receives the job description plus only the relevant resume sections.
9. If anything fails, the backend falls back to the full resume text.

## How The Cache Flow Works

1. The backend computes `resume_hash` and `jd_hash`.
2. If the signed-in user already has a matching analysis, the backend returns it directly.
3. The frontend shows `Loaded from cache`.
4. If no cache exists, the backend calls OpenAI and saves the result.

This V7 implementation uses exact cache. Semantic cache for highly similar JD matching is documented as a future improvement because automatic reuse of similar-but-not-identical job descriptions can produce misleading results.

## API Routes

- `POST /api/analyze`
  - Runs analysis.
  - Uses exact cache for signed-in users.
  - Attempts RAG retrieval when pgvector is configured.
  - Falls back to full resume analysis when needed.
- `GET /api/history`
  - Returns the signed-in user's latest 10 analysis records.
- `DELETE /api/history?id=...`
  - Deletes one signed-in user's history record.
- `POST /api/resume/extract`
  - Extracts text from PDF or DOCX.
- `POST /api/translate`
  - Translates structured English analysis into Chinese.

## Replication Guide

1. Clone or copy the project.
2. Run `npm install`.
3. Create `.env.local`.
4. Add `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Create the `analyses` table in Supabase.
6. Add RLS policies.
7. Add V7 cache columns.
8. Enable pgvector and create `resume_chunks`.
9. Create `match_resume_chunks`.
10. Create the private `resumes` Storage bucket.
11. Enable Email Auth.
12. Run `npm run dev`.
13. Sign up in the app.
14. Upload a PDF or DOCX resume.
15. Paste a job description.
16. Run Analyze Resume.
17. Run the same input again to test cache hit.
18. Toggle English / Chinese UI.
19. Click Translate to Chinese to test translation.

## Remaining Limitations

- Semantic cache is exact-hash based, not true similarity reuse.
- PDF formatting is not preserved.
- DOCX formatting is not preserved.
- Advanced document parsing is still limited.
- No full i18n framework.
- No production monitoring.
- No rate limiting.
- Storage policies should be hardened before production use.

## Useful Commands

```bash
npm run lint
npm run build
npm run dev
```
