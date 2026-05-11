# Setup Guide

This guide contains the detailed Supabase, database, storage, cache, and RAG setup for AI Resume Optimizer.

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

Use the project URL only:

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

drop policy if exists "Users can read their own analyses" on analyses;
drop policy if exists "Users can insert their own analyses" on analyses;
drop policy if exists "Users can delete their own analyses" on analyses;

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

drop policy if exists "Users can read their own resume chunks" on resume_chunks;
drop policy if exists "Users can insert their own resume chunks" on resume_chunks;
drop policy if exists "Users can delete their own resume chunks" on resume_chunks;

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

## Replication Checklist

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
