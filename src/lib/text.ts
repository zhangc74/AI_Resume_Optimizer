import { createHash } from "crypto";

export function hashText(text: string) {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export function chunkText(text: string, maxChunkLength = 1200) {
  const normalized = text
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if (!currentChunk) {
      currentChunk = paragraph;
      continue;
    }

    if (`${currentChunk}\n\n${paragraph}`.length <= maxChunkLength) {
      currentChunk = `${currentChunk}\n\n${paragraph}`;
      continue;
    }

    chunks.push(currentChunk);
    currentChunk = paragraph;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  if (chunks.length > 0) {
    return chunks;
  }

  const fallbackChunks: string[] = [];
  for (let index = 0; index < normalized.length; index += maxChunkLength) {
    fallbackChunks.push(normalized.slice(index, index + maxChunkLength));
  }

  return fallbackChunks;
}

export function cleanExtractedResumeText(text: string) {
  return text
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[•●▪■]/g, "-")
    .replace(/[ \t]*-[ \t]*/g, "\n- ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
