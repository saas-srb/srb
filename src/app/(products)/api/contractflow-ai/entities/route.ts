import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentLpmsUser } from '@/lib/lpms-auth';
import { getViewer } from '@/lib/products/contractflow-ai/viewer';
import { lpmsCan } from '@/lib/lpms-roles';
import { discoverEntities, fetchEntityRecords } from '@/lib/products/contractflow-ai/entity-discovery';

async function handleGET(req: NextRequest) {
  const user = await getCurrentLpmsUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Pulling company records into documents is an authoring task, not a read-only one.
  if (!lpmsCan({ roles: viewer.roles, permissionOverrides: viewer.overrides }, 'CREATE') && !lpmsCan({ roles: viewer.roles, permissionOverrides: viewer.overrides }, 'EDIT')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const entityKey = searchParams.get('entity');
  const search = searchParams.get('search') ?? '';

  try {
    if (entityKey) {
      const records = await fetchEntityRecords(entityKey, { search, limit: 20 }, viewer);
      return NextResponse.json({ records });
    }
    const entities = await discoverEntities(viewer);
    return NextResponse.json({ entities });
  } catch (e) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export const GET = withTransport(handleGET);
