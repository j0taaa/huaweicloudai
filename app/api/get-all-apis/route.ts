import { NextResponse } from "next/server";

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

async function getAllApis(productShort: string, regionId: string = 'sa-brazil-1'): Promise<ApiListItem[]> {
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

  return allApis;
}

type GetAllApisRequest = {
  productShort: string;
  regionId?: string;
};

export async function POST(request: Request) {
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
