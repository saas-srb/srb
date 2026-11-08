import "server-only";
import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { ensureVectorStore } from "@/lib/chatbot-config";
import { uploadBinaryToVectorStore, removeFromVectorStore } from "@/lib/kb-openai";
import { saveKbFile, deleteKbFile, readKbFileBuffer, type StoredKbFile } from "@/lib/kb-storage";
import { KbRunLogger } from "@/lib/kb-runs";
import type { KbPageStatus } from "@/lib/kb-website";

export const KB_PDF_DOCUMENTS_COLLECTION = "kb_pdf_documents";

export const KB_FILE_MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const KB_FILE_ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "txt", "md"];
export const KB_FILE_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

export function validateKbFile(file: File): string | null {
  if (file.size === 0) return "The file is empty.";
  if (file.size > KB_FILE_MAX_SIZE_BYTES) return "File must be 25MB or smaller.";
  const ext = file.name.split(".").pop()?.toLowerCase();
  const validExt = !!ext && KB_FILE_ALLOWED_EXTENSIONS.includes(ext);
  const validType = KB_FILE_ALLOWED_MIME_TYPES.includes(file.type);
  if (!validExt && !validType) {
    return "Upload a PDF, Word, text, or Markdown document (.pdf, .doc, .docx, .txt, .md).";
  }
  return null;
}

export interface KbPdfDocument {
  _id: ObjectId;
  title: string;
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
  status: KbPageStatus;
  openaiFileId: string | null;
  vectorStoreFileId: string | null;
  chunkCount: number | null;
  usageBytes: number | null;
  lastIndexedAt: Date | null;
  lastError: string | null;
  uploadedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedKbPdfDocument {
  _id: string;
  title: string;
  filename: string;
  size: number;
  status: KbPageStatus;
  chunkCount: number | null;
  usageBytes: number | null;
  lastIndexedAt: string | null;
  lastError: string | null;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

let indexesEnsured = false;

async function getPdfCollection(): Promise<Collection<KbPdfDocument>> {
  const db = await getDb();
  const collection = db.collection<KbPdfDocument>(KB_PDF_DOCUMENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await collection.createIndex({ createdAt: -1 }).catch(() => {});
    await collection.createIndex({ openaiFileId: 1 }).catch(() => {});
  }
  return collection;
}

function serialize(doc: KbPdfDocument): SerializedKbPdfDocument {
  return {
    _id: String(doc._id),
    title: doc.title,
    filename: doc.filename,
    size: doc.size,
    status: doc.status,
    chunkCount: doc.chunkCount ?? null,
    usageBytes: doc.usageBytes ?? null,
    lastIndexedAt: doc.lastIndexedAt ? new Date(doc.lastIndexedAt).toISOString() : null,
    lastError: doc.lastError ?? null,
    uploadedBy: doc.uploadedBy ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

async function runIndex(doc: KbPdfDocument, stored: StoredKbFile, logger: KbRunLogger): Promise<void> {
  const collection = await getPdfCollection();
  const vectorStoreId = await ensureVectorStore();
  logger.setTotal(1);

  if (doc.vectorStoreFileId || doc.openaiFileId) {
    await removeFromVectorStore({
      vectorStoreId,
      vectorStoreFileId: doc.vectorStoreFileId,
      fileId: doc.openaiFileId,
    });
  }

  try {
    const buffer = await readKbFileBuffer(stored.storageKey);
    const result = await uploadBinaryToVectorStore({
      vectorStoreId,
      filename: stored.filename,
      buffer,
      contentType: stored.contentType,
      attributes: { source_type: "pdf", doc_id: String(doc._id), title: doc.title.slice(0, 200) },
    });
    const now = new Date();
    const status: KbPageStatus =
      result.status === "completed" ? "indexed" : result.status === "failed" ? "failed" : "pending";
    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          status,
          openaiFileId: result.fileId,
          vectorStoreFileId: result.vectorStoreFileId,
          chunkCount: result.chunkCount,
          usageBytes: result.usageBytes,
          lastIndexedAt: now,
          lastError: result.lastError,
          updatedAt: now,
        },
      }
    );
    if (status === "indexed") {
      logger.recordIndexed();
      logger.log("info", `Indexed "${doc.title}" (${result.chunkCount ?? "?"} chunks)`);
    } else {
      logger.recordFailed();
      logger.log("warn", `"${doc.title}" finished with status ${result.status}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Indexing failed";
    await collection.updateOne(
      { _id: doc._id },
      { $set: { status: "failed", lastError: message, updatedAt: new Date() } }
    );
    logger.recordFailed();
    logger.log("error", `"${doc.title}" — ${message}`);
  }
}

export async function addPdf(file: File, title: string, uploadedBy: string | null): Promise<string> {
  const stored = await saveKbFile(file);
  const collection = await getPdfCollection();
  const now = new Date();
  const doc: KbPdfDocument = {
    _id: new ObjectId(),
    title: title.trim() || stored.filename,
    storageKey: stored.storageKey,
    filename: stored.filename,
    contentType: stored.contentType,
    size: stored.size,
    status: "pending",
    openaiFileId: null,
    vectorStoreFileId: null,
    chunkCount: null,
    usageBytes: null,
    lastIndexedAt: null,
    lastError: null,
    uploadedBy,
    createdAt: now,
    updatedAt: now,
  };
  await collection.insertOne(doc);

  const logger = await KbRunLogger.start("pdf", uploadedBy ?? "admin");
  try {
    await runIndex(doc, stored, logger);
    await logger.finish("completed");
  } catch (err) {
    await logger.finish("failed", err instanceof Error ? err.message : "Indexing failed");
  }
  return String(doc._id);
}

export async function replacePdf(id: string, file: File, uploadedBy: string | null): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const collection = await getPdfCollection();
  const doc = await collection.findOne({ _id: new ObjectId(id) });
  if (!doc) return false;

  const oldStorageKey = doc.storageKey;
  const stored = await saveKbFile(file);
  await collection.updateOne(
    { _id: doc._id },
    {
      $set: {
        storageKey: stored.storageKey,
        filename: stored.filename,
        contentType: stored.contentType,
        size: stored.size,
        status: "pending",
        updatedAt: new Date(),
      },
    }
  );
  await deleteKbFile(oldStorageKey);

  const fresh = await collection.findOne({ _id: doc._id });
  const logger = await KbRunLogger.start("pdf_reindex", uploadedBy ?? "admin");
  try {
    if (fresh) await runIndex(fresh, stored, logger);
    await logger.finish("completed");
  } catch (err) {
    await logger.finish("failed", err instanceof Error ? err.message : "Indexing failed");
  }
  return true;
}

export async function reindexPdf(id: string, triggeredBy: string | null): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const collection = await getPdfCollection();
  const doc = await collection.findOne({ _id: new ObjectId(id) });
  if (!doc) return false;

  const logger = await KbRunLogger.start("pdf_reindex", triggeredBy ?? "admin");
  try {
    await runIndex(
      doc,
      { storageKey: doc.storageKey, filename: doc.filename, contentType: doc.contentType, size: doc.size },
      logger
    );
    await logger.finish("completed");
  } catch (err) {
    await logger.finish("failed", err instanceof Error ? err.message : "Indexing failed");
  }
  return true;
}

export async function deletePdf(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const collection = await getPdfCollection();
  const doc = await collection.findOne({ _id: new ObjectId(id) });
  if (!doc) return false;

  if (doc.vectorStoreFileId || doc.openaiFileId) {
    try {
      const vectorStoreId = await ensureVectorStore();
      await removeFromVectorStore({
        vectorStoreId,
        vectorStoreFileId: doc.vectorStoreFileId,
        fileId: doc.openaiFileId,
      });
    } catch (err) {
      console.error("Failed to detach PDF from vector store", err);
    }
  }
  await deleteKbFile(doc.storageKey);
  await collection.deleteOne({ _id: doc._id });
  return true;
}

export async function listPdfDocuments(): Promise<SerializedKbPdfDocument[]> {
  const collection = await getPdfCollection();
  const docs = await collection.find({}).sort({ createdAt: -1 }).toArray();
  return docs.map(serialize);
}

export async function getPdfDocument(id: string): Promise<KbPdfDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = await getPdfCollection();
  return collection.findOne({ _id: new ObjectId(id) });
}

export async function findPdfByFileId(fileId: string): Promise<KbPdfDocument | null> {
  const collection = await getPdfCollection();
  return collection.findOne({ openaiFileId: fileId });
}

export interface PdfKbSummary {
  totalDocs: number;
  indexedDocs: number;
  failedDocs: number;
  totalChunks: number;
}

export async function getPdfKbSummary(): Promise<PdfKbSummary> {
  const collection = await getPdfCollection();
  const docs = await collection.find({}).toArray();
  const indexed = docs.filter((d) => d.status === "indexed");
  return {
    totalDocs: docs.length,
    indexedDocs: indexed.length,
    failedDocs: docs.filter((d) => d.status === "failed").length,
    totalChunks: indexed.reduce((sum, d) => sum + (d.chunkCount ?? 0), 0),
  };
}
