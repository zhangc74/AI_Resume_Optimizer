# Development Notes
# 开发记录

This document summarizes the major project versions only. Small UI fixes and patch versions are merged into the nearest major version so the project story is easier to read and explain.

本文只总结主版本。小修复和小版本已经合并到对应的大版本里，方便阅读，也方便面试时讲项目演进。

---

## V1 - Bad AI Version
## V1 - 有问题的 AI 原型版本

### What Was Built
### 做了什么

- Created the first full-stack Next.js App Router version.
- Added a frontend page with Resume Text and Job Description textareas.
- Added `POST /api/analyze`.
- Connected the backend to OpenAI.
- Sent the full resume and full job description directly into the prompt.
- Returned one plain-text `analysisText` response.
- Built a simple dark UI for quick portfolio validation.
- 创建了第一个 Next.js App Router 全栈版本。
- 前端加入 Resume Text 和 Job Description 两个输入框。
- 后端加入 `POST /api/analyze`。
- 后端接入 OpenAI。
- 直接把完整简历和完整岗位 JD 拼进 prompt。
- 返回一整段纯文本 `analysisText`。
- 做了一个简单深色 UI，用来快速验证作品集 demo。

### Problems Found
### 发现的问题

- AI output was plain text, so the format was unstable.
- The frontend could only display one large text block.
- The result was hard to style, validate, store, or reuse.
- Every request sent the full resume and JD, so token cost could be high.
- There was no database, no auth, no history, no cache, and no upload support.
- AI 返回纯文本，格式不稳定。
- 前端只能展示一整块文本。
- 结果不好做样式、不好校验、不好保存，也不好复用。
- 每次请求都发送完整简历和 JD，token 成本可能较高。
- 没有数据库、登录、历史记录、缓存和上传功能。

---

## V2 - Structured JSON Version
## V2 - 结构化 JSON 版本

### What Was Built
### 做了什么

- Changed AI output from plain text to structured JSON.
- Defined a fixed analysis shape:
  - `matchScore`
  - `overallMatch`
  - `strengths`
  - `missingKeywords`
  - `suggestions`
  - `exampleBulletRewrites`
- Added backend JSON parsing.
- Added basic response validation.
- Changed the frontend from plain text rendering to card-based rendering.
- Displayed score, strengths, missing keywords, suggestions, and bullet rewrites in separate UI sections.
- 把 AI 输出从纯文本改成结构化 JSON。
- 固定分析结果字段：
  - `matchScore`
  - `overallMatch`
  - `strengths`
  - `missingKeywords`
  - `suggestions`
  - `exampleBulletRewrites`
- 后端加入 JSON parse。
- 后端加入基础格式校验。
- 前端从纯文本展示改成卡片展示。
- 分开展示匹配分数、优势、缺失关键词、优化建议和 bullet 改写。

### Problems Found
### 发现的问题

- Structured output solved display stability, but token usage was still high.
- Inputs could still be very long.
- There was still no database, no auth, no history, and no cache.
- Error messages were still basic.
- 结构化输出解决了展示稳定性，但 token 消耗仍然较高。
- 用户仍然可以输入很长文本。
- 仍然没有数据库、登录、历史记录和缓存。
- 错误提示仍然比较基础。

---

## V3 - Token Optimization + Better UX Version
## V3 - Token 优化 + 用户体验优化版本

### What Was Built
### 做了什么

- Added frontend character counters for resume and JD.
- Added 8000 character limits.
- Added backend input length validation.
- Trimmed inputs on the backend.
- Added lightweight job description cleanup.
- Shortened and focused the OpenAI prompt.
- Told the model to ignore company marketing, benefits, legal text, privacy text, and equal opportunity sections.
- Added Clear button.
- Added Copy Result button.
- Improved error display.
- Added better disabled states for Analyze.
- 前端加入简历和 JD 字符数显示。
- 加入 8000 字符限制。
- 后端加入输入长度校验。
- 后端对输入做 trim。
- 加入轻量 JD 清洗。
- 缩短并聚焦 OpenAI prompt。
- 告诉模型忽略公司宣传、福利、法律声明、隐私声明和平等机会声明。
- 加入 Clear 按钮。
- 加入 Copy Result 按钮。
- 优化错误展示。
- 优化 Analyze 按钮禁用逻辑。

### Problems Found
### 发现的问题

- V3 reduced uncontrolled input size, but it still sent the full resume and JD on every request.
- There was no persistent history.
- Users could not save previous analyses.
- Repeated analysis still called OpenAI again.
- Manual resume paste was inconvenient.
- V3 降低了输入不可控的问题，但每次仍然发送完整简历和 JD。
- 没有持久化历史记录。
- 用户不能保存以前的分析。
- 重复分析仍然会重复调用 OpenAI。
- 手动粘贴简历不够方便。

---

## V4 - Supabase Auth + RLS History Version
## V4 - Supabase 登录 + RLS 历史记录版本

### What Was Built
### 做了什么

- Added Supabase Auth.
- Added email/password Sign Up, Sign In, and Sign Out.
- Added a Supabase PostgreSQL `analyses` table.
- Added `user_id` to saved analysis records.
- Added Row Level Security policies.
- Users can only read, insert, and delete their own records.
- Added `GET /api/history`.
- Added `DELETE /api/history?id=...`.
- Saved analysis history only when the user is signed in.
- Added frontend Analysis History section.
- Users can load previous analysis records.
- Users can delete history records.
- 未登录用户仍然可以分析，但不会保存历史记录。
- 加入 Supabase Auth。
- 加入 email/password 注册、登录和退出。
- 加入 Supabase PostgreSQL `analyses` 表。
- 保存记录时写入 `user_id`。
- 加入 Row Level Security policies。
- 用户只能读取、插入和删除自己的记录。
- 加入 `GET /api/history`。
- 加入 `DELETE /api/history?id=...`。
- 用户登录后才保存分析历史。
- 前端加入 Analysis History 区域。
- 用户可以加载历史分析。
- 用户可以删除历史记录。
- Guests can still analyze, but their results are not saved.

### Problems Found
### 发现的问题

- Auth and history worked, but uploaded resumes were still manual text only.
- Sensitive PDF/DOCX files were not supported yet.
- History solved persistence, but repeated same-input analysis still wasted AI calls.
- Storage policies still needed production hardening.
- 登录和历史记录跑通了，但简历仍然主要靠手动粘贴。
- 还不支持 PDF/DOCX 简历文件。
- 历史记录解决了持久化，但相同输入重复分析仍然浪费 AI 调用。
- Storage policy 仍然需要生产环境强化。

---

## V5 - Document Upload + Storage + Chinese Translation Version
## V5 - 文档上传 + 存储 + 中文翻译版本

### What Was Built
### 做了什么

- Added resume file upload.
- Added PDF text extraction.
- Added DOCX text extraction.
- Used `pdf-parse` for PDF parsing.
- Used `mammoth` for DOCX parsing.
- Auto-filled extracted text into Resume Text.
- Kept manual editing after extraction.
- Added Supabase Storage upload for signed-in users.
- Stored uploaded files under user-specific paths in the `resumes` bucket.
- Added `POST /api/resume/extract`.
- Added `POST /api/translate`.
- Added optional Translate to Chinese button.
- Chinese translation is displayed below the corresponding English analysis item.
- Translation is user-triggered to avoid unnecessary token usage.
- 加入简历文件上传。
- 加入 PDF 文本提取。
- 加入 DOCX 文本提取。
- PDF 使用 `pdf-parse` 解析。
- DOCX 使用 `mammoth` 解析。
- 提取后的文本自动填入 Resume Text。
- 用户仍然可以手动编辑提取结果。
- 登录用户可以把原始文件上传到 Supabase Storage。
- 文件按用户路径保存到 `resumes` bucket。
- 加入 `POST /api/resume/extract`。
- 加入 `POST /api/translate`。
- 加入可选的 Translate to Chinese 按钮。
- 中文翻译显示在对应英文分析内容下面。
- 翻译由用户手动触发，避免每次分析都额外消耗 token。

### Problems Found
### 发现的问题

- Some PDFs, especially scanned or image-based PDFs, cannot be parsed reliably.
- DOCX extraction is more reliable than many Word-exported PDFs.
- PDF/DOCX formatting is not preserved.
- Translation adds extra token cost when used.
- Storage upload works for learning/demo, but production Storage policies still need careful setup.
- 一些 PDF，尤其是扫描版或图片型 PDF，无法稳定解析。
- DOCX 提取通常比 Word 导出的 PDF 更稳定。
- 当前不保留 PDF/DOCX 原始格式。
- 翻译功能使用时会额外消耗 token。
- Storage 上传适合学习和 demo，但生产环境仍需要认真配置 Storage policies。

---

## V6 - Dashboard UI/UX Version
## V6 - Dashboard UI/UX 版本

### What Was Built
### 做了什么

- Redesigned the page into a cleaner dashboard layout.
- Changed the visual style from very dark to a lighter portfolio-ready interface.
- Improved top header layout.
- Added a hero image as a subtle background asset.
- Improved Account/Auth panel layout.
- Improved Analysis History readability.
- Improved Load/Delete button styles.
- Improved status, warning, and error message contrast.
- Made Chinese translation display inline under each corresponding English item.
- Kept all core functionality:
  - Auth
  - Analyze
  - History
  - Upload
  - Storage
  - Translation
  - Copy
  - Clear
- 把页面重构成更干净的 dashboard 布局。
- 从很黑的视觉风格改成更适合作品集展示的浅色界面。
- 优化顶部 header 布局。
- 加入 hero image 作为轻量背景视觉。
- 优化 Account/Auth 面板布局。
- 优化 Analysis History 可读性。
- 优化 Load/Delete 按钮样式。
- 优化状态、警告和错误提示的对比度。
- 中文翻译改成显示在每条对应英文内容下面。
- 保留所有核心功能：
  - 登录
  - 分析
  - 历史记录
  - 上传
  - 存储
  - 翻译
  - 复制
  - 清空

### Problems Found
### 发现的问题

- UI became much more readable, but the system was still not optimized for repeated analysis.
- The app still did not have RAG.
- The app still did not have cache.
- Some dashboard polish was visual only, not architectural.
- UI 可读性明显提升，但系统仍然没有优化重复分析。
- 仍然没有 RAG。
- 仍然没有缓存。
- 一些 dashboard 优化主要是视觉层面的，不是架构层面的。

---

## V7 - Final Enhancement Version
## V7 - 最终增强版本

### What Was Built
### 做了什么

- Added exact cache with `resume_hash + jd_hash`.
- Signed-in users can reuse previous results for the same resume and JD.
- Added resume chunking helper.
- Added OpenAI embeddings for resume chunks.
- Added optional Supabase pgvector retrieval.
- Added `resume_chunks` database design in README.
- Added `match_resume_chunks` SQL function guide in README.
- Analyze API attempts RAG when the user is signed in and pgvector is configured.
- If RAG fails or is not configured, the app falls back to full resume analysis.
- Added analysis status messages:
  - `Loaded from cache`
  - `Relevant resume sections retrieved`
  - `Full resume analysis used`
- Improved shared extracted text cleanup for PDF/DOCX.
- Added simple English / Chinese UI toggle.
- Updated README with full setup and replication guide.
- 加入基于 `resume_hash + jd_hash` 的精确缓存。
- 登录用户对相同简历和 JD 重复分析时，可以复用历史结果。
- 加入简历 chunking helper。
- 加入 OpenAI embeddings 用于简历片段。
- 加入可选 Supabase pgvector 检索。
- README 中加入 `resume_chunks` 数据库设计。
- README 中加入 `match_resume_chunks` SQL function 指南。
- Analyze API 在用户登录且 pgvector 配好时尝试 RAG。
- 如果 RAG 失败或未配置，系统自动回退到完整简历分析。
- 加入分析状态提示：
  - `Loaded from cache`
  - `Relevant resume sections retrieved`
  - `Full resume analysis used`
- 优化 PDF/DOCX 提取文本清洗。
- 加入简单 English / 中文 UI 切换。
- README 补充完整配置和复刻指南。

### Problems Found
### 发现的问题

- Exact cache only handles identical resume + JD pairs.
- True semantic cache is not implemented yet.
- RAG depends on Supabase pgvector SQL being configured manually.
- If pgvector is not configured, the app correctly falls back, but token savings are limited.
- Embedding generation adds extra OpenAI calls when new resume chunks are created.
- This is production-like, but still not fully production-ready.
- 精确缓存只处理完全相同的简历和 JD。
- 还没有实现真正的 semantic cache。
- RAG 依赖手动配置 Supabase pgvector SQL。
- 如果 pgvector 没配好，系统会正确回退，但 token 节省有限。
- 新简历 chunks 生成 embeddings 时会增加额外 OpenAI 调用。
- 当前版本接近 production-like，但还不是完整生产级系统。

### Remaining Production Work
### 后续生产级优化

- Add rate limiting.
- Add monitoring and structured logging.
- Add stronger Storage policies.
- Add true semantic cache with safe similarity thresholds.
- Add OCR or advanced parsing for scanned PDFs.
- Add a full i18n framework if the app becomes larger.
- Add deployment documentation and environment-specific settings.
- 加入 rate limiting。
- 加入监控和结构化日志。
- 强化 Storage policies。
- 加入真正的 semantic cache，并设置安全的相似度阈值。
- 为扫描版 PDF 加入 OCR 或高级文档解析。
- 如果应用继续变大，接入完整 i18n 框架。
- 补充部署文档和不同环境配置。
