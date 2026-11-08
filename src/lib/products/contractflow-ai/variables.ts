import 'server-only';
import type { LpmsViewer } from '@/lib/products/contractflow-ai/types';
import { discoverEntities, resolveEntityField } from './entity-discovery';

export const VARIABLE_PATTERN = /\{\{([a-zA-Z0-9_.]+)\}\}/g;

export interface VariableEntry {
  key: string;
  label: string;
  dataType: string;
}

export function detectVariables(content: string): string[] {
  if (!content) return [];
  const matches = [...content.matchAll(VARIABLE_PATTERN)];
  return [...new Set(matches.map(m => m[1]))];
}

export function detectBlockVariables(blocks: any[]): string[] {
  const vars = new Set<string>();
  
  const scan = (block: any) => {
    if (block.content) {
      detectVariables(block.content).forEach(v => vars.add(v));
    }
    if (block.children && Array.isArray(block.children)) {
      block.children.forEach(scan);
    }
  };

  blocks.forEach(scan);
  return Array.from(vars);
}

export async function buildVariableRegistry(viewer: LpmsViewer): Promise<VariableEntry[]> {
  const entities = await discoverEntities(viewer);
  const registry: VariableEntry[] = [];
  
  for (const entity of entities) {
    for (const field of entity.fields) {
      registry.push({
        key: field.variableKey,
        label: field.label,
        dataType: field.dataType
      });
    }
  }
  return registry;
}

export async function resolveVariables(
  variables: string[], 
  selectedEntities: Record<string, string[]>, 
  viewer: LpmsViewer
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  
  for (const v of variables) {
    const parts = v.split('.');
    if (parts.length >= 3) {
      const entityKey = `${parts[0]}.${parts[1]}`;
      const fieldKey = parts.slice(2).join('.');
      
      const recordIds = selectedEntities[entityKey];
      if (recordIds && recordIds.length > 0) {
        const val = await resolveEntityField(entityKey, recordIds[0], fieldKey, viewer);
        resolved[v] = val !== null ? val : `{{UNRESOLVED: ${v}}}`;
      } else {
        resolved[v] = `{{UNRESOLVED: ${v}}}`;
      }
    } else {
      resolved[v] = `{{UNRESOLVED: ${v}}}`;
    }
  }
  
  return resolved;
}

export function renderBlock(block: any, resolved: Record<string, string>): any {
  let newContent = block.content;
  if (newContent) {
    newContent = newContent.replace(VARIABLE_PATTERN, (match: string, p1: string) => {
      return resolved[p1] !== undefined ? resolved[p1] : match;
    });
  }
  
  let newChildren = block.children;
  if (newChildren && Array.isArray(newChildren)) {
    newChildren = newChildren.map((c: any) => renderBlock(c, resolved));
  }
  
  return { ...block, content: newContent, children: newChildren };
}

export function renderBlocks(blocks: any[], resolved: Record<string, string>): any[] {
  return blocks.map(b => renderBlock(b, resolved));
}
