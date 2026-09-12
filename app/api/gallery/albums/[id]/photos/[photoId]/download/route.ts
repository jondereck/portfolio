import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string; photoId: string }> };

/**
 * Per-item media downloads are intentionally disabled.
 * Album ZIP remains the only gallery download path: GET /api/gallery/albums/[id]/download
 */
export async function GET(_request: Request, _context: RouteContext) {
  return NextResponse.json(
    { error: 'Single-media download is disabled. Use album ZIP download instead.' },
    { status: 403 },
  );
}
