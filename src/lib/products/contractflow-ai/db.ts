import "server-only";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { MakerTypeDoc, TemplateDoc, DocumentDoc, DocumentVersionDoc, WorkflowDef, ApprovalRecord, SignatureRequest, LpmsCategory } from "./types";
import { randomUUID } from "node:crypto";

export async function getCompanyFilter() {
  return { companyId: await currentCompanyId() };
}

let makerTypesIndexEnsured = false;
let templatesIndexEnsured = false;
let documentsIndexEnsured = false;
let documentVersionsIndexEnsured = false;
let workflowsIndexEnsured = false;
let approvalsIndexEnsured = false;
let signaturesIndexEnsured = false;
let categoriesIndexEnsured = false;
let variableCacheIndexEnsured = false;
let auditIndexEnsured = false;

export async function getLpmsMakerTypesCollection() {
  const db = await getDb();
  const collection = db.collection<MakerTypeDoc>("lpms_maker_types");
  if (!makerTypesIndexEnsured) {
    makerTypesIndexEnsured = true;
    await collection.createIndex({ companyId: 1, slug: 1 }, { unique: true }).catch(() => {});
  }
  return collection;
}

export async function getLpmsTemplatesCollection() {
  const db = await getDb();
  const collection = db.collection<TemplateDoc>("lpms_templates");
  if (!templatesIndexEnsured) {
    templatesIndexEnsured = true;
    await collection.createIndex({ companyId: 1, makerTypeId: 1 }).catch(() => {});
  }
  return collection;
}

export async function getLpmsDocumentsCollection() {
  const db = await getDb();
  const collection = db.collection<DocumentDoc>("lpms_documents");
  if (!documentsIndexEnsured) {
    documentsIndexEnsured = true;
    await collection.createIndex({ companyId: 1, documentNumber: 1 }).catch(() => {});
    await collection.createIndex({ companyId: 1, status: 1 }).catch(() => {});
    await collection.createIndex({ title: "text", documentNumber: "text" }).catch(() => {});
  }
  return collection;
}

export async function getLpmsDocumentVersionsCollection() {
  const db = await getDb();
  const collection = db.collection<DocumentVersionDoc>("lpms_document_versions");
  if (!documentVersionsIndexEnsured) {
    documentVersionsIndexEnsured = true;
    await collection.createIndex({ companyId: 1, documentId: 1, versionNumber: 1 }, { unique: true }).catch(() => {});
  }
  return collection;
}

export async function getLpmsWorkflowsCollection() {
  const db = await getDb();
  const collection = db.collection<WorkflowDef>("lpms_workflows");
  if (!workflowsIndexEnsured) {
    workflowsIndexEnsured = true;
    await collection.createIndex({ companyId: 1 }).catch(() => {});
  }
  return collection;
}

export async function getLpmsApprovalsCollection() {
  const db = await getDb();
  const collection = db.collection<ApprovalRecord>("lpms_approvals");
  if (!approvalsIndexEnsured) {
    approvalsIndexEnsured = true;
    await collection.createIndex({ companyId: 1, documentId: 1 }).catch(() => {});
  }
  return collection;
}

export async function getLpmsSignaturesCollection() {
  const db = await getDb();
  const collection = db.collection<SignatureRequest>("lpms_signatures");
  if (!signaturesIndexEnsured) {
    signaturesIndexEnsured = true;
    await collection.createIndex({ companyId: 1, documentId: 1 }).catch(() => {});
  }
  return collection;
}

export async function getLpmsCategoriesCollection() {
  const db = await getDb();
  const collection = db.collection<LpmsCategory>("lpms_categories");
  if (!categoriesIndexEnsured) {
    categoriesIndexEnsured = true;
    await collection.createIndex({ companyId: 1, slug: 1 }).catch(() => {});
  }
  return collection;
}

export async function getLpmsVariableCacheCollection() {
  const db = await getDb();
  const collection = db.collection<any>("lpms_variable_cache");
  if (!variableCacheIndexEnsured) {
    variableCacheIndexEnsured = true;
    await collection.createIndex({ companyId: 1, key: 1 }).catch(() => {});
    await collection.createIndex({ cachedAt: 1 }, { expireAfterSeconds: 3600 }).catch(() => {});
  }
  return collection;
}

export async function getLpmsAuditCollection() {
  const db = await getDb();
  const collection = db.collection<any>("lpms_audit");
  if (!auditIndexEnsured) {
    auditIndexEnsured = true;
    await collection.createIndex({ companyId: 1, documentId: 1 }).catch(() => {});
    await collection.createIndex({ timestamp: 1 }).catch(() => {});
  }
  return collection;
}
