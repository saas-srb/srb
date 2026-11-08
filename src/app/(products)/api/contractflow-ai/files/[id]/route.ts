import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentLpmsUser } from '@/lib/lpms-auth';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { lpmsCan } from '@/lib/lpms-roles';

async function handleGET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentLpmsUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = { roles: user.roles, permissionOverrides: user.permissionOverrides };
  if (!lpmsCan(ctx, 'DOWNLOAD')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Lookup file in gridfs or file collection
  const db = await getDb();
  const file = await db.collection('lpms_files').findOne({ _id: new ObjectId(id) });
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // For now return file metadata; actual streaming would use GridFS
  return NextResponse.json({ url: file.url, name: file.name });
}

export const GET = withTransport(handleGET);
