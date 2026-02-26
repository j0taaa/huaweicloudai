import { NextResponse } from "next/server";
import { enforceLicenseForApi } from "@/lib/license-guard";

interface ApiListItem {
  name: string;
  description: string;
}

interface ApiListResponse {
  api_basic_infos: Array<{
    name: string;
    summary: string;
  }>;
  count: number;
}

const API_CACHE_TTL_MS = 10 * 60 * 1000;
const apiListCache = new Map<string, { value: ApiListItem[]; expiresAt: number }>();

function getCachedApiList(cacheKey: string): ApiListItem[] | null {
  const cached = apiListCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt < Date.now()) {
    apiListCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCachedApiList(cacheKey: string, value: ApiListItem[]) {
  apiListCache.set(cacheKey, { value, expiresAt: Date.now() + API_CACHE_TTL_MS });
}

async function getAllApis(productShort: string, regionId: string = 'sa-brazil-1'): Promise<ApiListItem[]> {
  const cacheKey = `${productShort}:${regionId}`;
  const cached = getCachedApiList(cacheKey);
  if (cached) {
    return cached;
  }

  const allApis: ApiListItem[] = [];
  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(`https://${regionId}-console.huaweicloud.com/apiexplorer/new/v3/apis?offset=${offset}&limit=${limit}&product_short=${productShort}`, {
      headers: {
        'X-Language': 'en-us'
      }
    });
    const data = await response.json() as ApiListResponse;

    if (data.api_basic_infos && data.api_basic_infos.length > 0) {
      allApis.push(...data.api_basic_infos.map(api => ({
        name: api.name,
        description: api.summary
      })));

      if (data.api_basic_infos.length < limit || allApis.length >= data.count) {
        hasMore = false;
      } else {
        offset += limit;
      }
    } else {
      hasMore = false;
    }
  }

  setCachedApiList(cacheKey, allApis);
  return allApis;
}

type GetAllApisRequest = {
  productShort: string;
  regionId?: string;
};

export async function POST(request: Request) {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  const { productShort, regionId } = (await request.json()) as GetAllApisRequest;

  if (!productShort) {
    return NextResponse.json(
      { error: "productShort is required." },
      { status: 400 },
    );
  }

  try {
    const result = await getAllApis(productShort, regionId);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Error fetching APIs: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
      },
      { status: 500 },
    );
  }
}
