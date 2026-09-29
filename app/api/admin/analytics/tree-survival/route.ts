import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { isAdminRequest } from '@/lib/auth/admin';
import { getTreeAnalytics, parseTreeAnalyticsFilters } from '@/lib/analytics/tree-survival';
import { getCarbonOffsetEstimate, parseCarbonOffsetInput } from '@/lib/analytics/carbon-offset';
import { searchOffsetProjects, parseOffsetProjectFilters } from '@/lib/analytics/offset-projects';

export const runtime = 'nodejs';

const OFFSET_PROJECT_CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
} as const;

/**
 * GET /api/admin/analytics/tree-survival
 *
 * Returns survival rate, lifecycle counts, cost per tree, and sponsor retention
 * grouped independently by species, region, and planter team.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get('resource') === 'offset-projects') {
    try {
      const filters = parseOffsetProjectFilters(url.searchParams);
      const projects = await searchOffsetProjects(getPool(), filters);
      return NextResponse.json({ projects }, { headers: OFFSET_PROJECT_CACHE_HEADERS });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to search offset projects';
      const status = /must be|valid|range|non-negative/.test(message) ? 400 : 500;
      console.error('[offset-project-search]', error);
      return NextResponse.json({ error: message }, { status });
    }
  }
  try {
    const filters = parseTreeAnalyticsFilters(new URL(request.url).searchParams);
    const report = await getTreeAnalytics(getPool(), filters);
    return NextResponse.json(report, {
      headers: OFFSET_PROJECT_CACHE_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate tree analytics';
    const status = /must be|valid ISO|before or equal/.test(message) ? 400 : 500;
    console.error('[tree-survival-analytics]', error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/admin/analytics/tree-survival
 *
 * Estimates the number of carbon credits an individual needs to offset their
 * annual emissions based on household size, car usage, and energy consumption.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const input = parseCarbonOffsetInput(await request.json());
    const estimate = getCarbonOffsetEstimate(input);
    return NextResponse.json(estimate, {
      headers: OFFSET_PROJECT_CACHE_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to estimate carbon offset';
    const status = /must be|required|invalid|non-negative/.test(message) ? 400 : 500;
    console.error('[carbon-offset-estimate]', error);
    return NextResponse.json({ error: message }, { status });
  }
}
