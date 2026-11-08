import type { ProjectDoc } from "@/lib/products/viralpulse-ai/images/store";
import type { ProjectView } from "@/lib/products/viralpulse-ai/images/types";

export const toProjectView = (p: ProjectDoc): ProjectView => ({
  id: p._id,
  brief: p.brief,
  status: p.status,
  variants: p.variants,
  chosenIds: p.chosenIds,
  exports: p.exports,
  pendingApproval: p.pendingApproval ? { by: p.pendingApproval.by, email: p.pendingApproval.email, at: p.pendingApproval.at.toISOString(), estimateUsd: p.pendingApproval.estimateUsd, kind: p.pendingApproval.kind } : null,
  totalCostUsd: p.totalCostUsd,
  error: p.error,
  updatedAt: p.updatedAt.toISOString(),
  createdAt: p.createdAt.toISOString(),
  progress: p.progress ?? { total: p.variants.length, done: p.variants.length },
});

export const variantUrl = (projectId: string, variantId: string) => `/api/viralpulse-ai/image-studio/variant/${projectId}/${variantId}`;
