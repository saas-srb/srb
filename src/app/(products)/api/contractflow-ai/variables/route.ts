import { withTransport } from "@/lib/security/transport";
import { NextResponse } from 'next/server';
import { getCurrentLpmsUser } from '@/lib/lpms-auth';
import { getViewer } from '@/lib/products/contractflow-ai/viewer';
import { lpmsCan } from '@/lib/lpms-roles';
import { buildVariableRegistry } from '@/lib/products/contractflow-ai/variables';

async function handleGET() {
  const user = await getCurrentLpmsUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Pulling company records into documents is an authoring task, not a read-only one.
  if (!lpmsCan({ roles: viewer.roles, permissionOverrides: viewer.overrides }, 'CREATE') && !lpmsCan({ roles: viewer.roles, permissionOverrides: viewer.overrides }, 'EDIT')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const variables = await buildVariableRegistry(viewer);
    return NextResponse.json({ variables });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to build variable registry' }, { status: 500 });
  }
}

export const GET = withTransport(handleGET);
