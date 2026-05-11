import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { cleanExtractedResumeText } from "@/lib/text";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function getFileType(file: File) {
  const fileName = file.name.toLowerCase();

  if (file.type === "application/pdf" || fileName.endsWith(".pdf")) {
    return "pdf";
  }

  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".docx")
  ) {
    return "docx";
  }

  return null;
}

async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });

  try {
    const parsedPdf = await parser.getText();
    return parsedPdf.text || "";
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json(
        { error: "No resume file uploaded." },
        { status: 400 },
      );
    }

    const fileType = getFileType(file);

    if (!fileType) {
      return Response.json(
        { error: "Please upload a PDF or DOCX resume file." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        {
          error: "Resume file is too large. Please upload a file under 5MB.",
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rawText =
      fileType === "pdf"
        ? await extractPdfText(buffer)
        : await extractDocxText(buffer);
    const resumeText = cleanExtractedResumeText(rawText);

    if (!resumeText) {
      return Response.json(
        {
          error:
            fileType === "pdf"
              ? "No selectable text was found in this PDF. If it is a scanned or image-based resume, please paste the resume text manually or upload the original DOCX file."
              : "Could not extract text from this DOCX. Please paste resume text manually.",
        },
        { status: 400 },
      );
    }

    return Response.json({ resumeText, fileType });
  } catch (error) {
    console.error("Resume file extraction failed:", error);

    return Response.json(
      {
        error:
          "Could not extract text from this resume file. Please paste resume text manually.",
      },
      { status: 500 },
    );
  }
}
