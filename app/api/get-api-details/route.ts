import { NextResponse } from "next/server";

interface ApiParam {
  name: string;
  description: string;
  type: string;
  required: boolean;
  in: string;
  example?: unknown;
}

interface RequestInfo {
  method: string;
  url: string;
  headers: ApiParam[];
  pathParams: ApiParam[];
  queryParams: ApiParam[];
  bodyParams?: ApiParam[];
  bodySchema?: unknown;
}

interface ResponseInfo {
  statusCode: string;
  description: string;
  example?: unknown;
  schema?: unknown;
}

interface Region {
  region_id: string;
  region_name: string;
}

interface ApiResponse {
  name: string;
  summary: string;
  description: string;
  tags: string[];
  request: RequestInfo;
  response: ResponseInfo[];
  definitions?: Record<string, unknown>;
  availableRegions?: Region[];
}

interface ApiDetailResponse {
  id?: string;
  name: string;
  summary?: string;
  description?: string;
  tags?: string[];
  product_short?: string;
  region_id?: string;
  parameters?: Record<string, unknown>;
  paths?: Record<string, Record<string, unknown>>;
  definitions?: Record<string, unknown>;
}

interface RegionsResponse {
  regions: Array<{
    region_id: string;
    name: string;
  }>;
}

const API_CACHE_TTL_MS = 10 * 60 * 1000;
const apiDetailsCache = new Map<string, { value: ApiResponse; expiresAt: number }>();

function getCachedApiDetails(cacheKey: string): ApiResponse | null {
  const cached = apiDetailsCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt < Date.now()) {
    apiDetailsCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCachedApiDetails(cacheKey: string, value: ApiResponse) {
  apiDetailsCache.set(cacheKey, { value, expiresAt: Date.now() + API_CACHE_TTL_MS });
}

async function fetchRegions(productShort: string, apiName: string, regionId: string = 'sa-brazil-1'): Promise<Region[]> {
  const response = await fetch(`https://${regionId}-console.huaweicloud.com/apiexplorer/new/v6/regions?product_short=${productShort}&api_name=${apiName}`, {
    headers: {
      'X-Language': 'en-us'
    }
  });

  if (!response.ok) {
    throw new Error(`Regions request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as RegionsResponse;
  
  if (data.regions && Array.isArray(data.regions)) {
    return data.regions.map(region => ({
      region_id: region.region_id,
      region_name: region.name
    }));
  }

  return [];
}

async function getApiDetails(productShort: string, action: string, regionId: string = 'sa-brazil-1'): Promise<ApiResponse> {
  const cacheKey = `${productShort}:${action}:${regionId}`;
  const cached = getCachedApiDetails(cacheKey);
  if (cached) {
    return cached;
  }

  // BSSINTL is only available in ap-southeast-1 (Hong Kong) but needs a working region for the host
  const isBssIntl = productShort.toUpperCase() === 'BSSINTL';
  const hostRegion = isBssIntl ? 'sa-brazil-1' : regionId;
  const targetRegion = isBssIntl ? 'ap-southeast-1' : regionId;
  
  const response = await fetch(`https://${hostRegion}-console.huaweicloud.com/apiexplorer/new/v4/apis/detail?product_short=${productShort}&name=${action}&region_id=${targetRegion}`, {
    headers: {
      'X-Language': 'en-us'
    }
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json() as ApiDetailResponse;

  const headers: ApiParam[] = [];
  const pathParams: ApiParam[] = [];
  const queryParams: ApiParam[] = [];
  const bodyParams: ApiParam[] = [];

  if (data.parameters) {
    Object.values(data.parameters).forEach((param: unknown) => {
      const p = param as ApiParam & { 'in'?: string; 'x-example'?: string };
      const apiParam: ApiParam = {
        name: p.name,
        description: p.description || '',
        type: p.type || 'string',
        required: p.required || false,
        in: p.in || 'header',
        example: p['x-example']
      };

      if (apiParam.in === 'header') {
        headers.push(apiParam);
      } else if (apiParam.in === 'path') {
        pathParams.push(apiParam);
      } else if (apiParam.in === 'query') {
        queryParams.push(apiParam);
      }
    });
  }

  const requestInfo: RequestInfo = {
    method: 'GET',
    url: '',
    headers,
    pathParams,
    queryParams,
    bodyParams: []
  };

  const responseInfo: ResponseInfo[] = [];

  if (data.paths) {
    for (const [path, methods] of Object.entries(data.paths)) {
      for (const [method, details] of Object.entries(methods)) {
        const methodDetails = details as Record<string, unknown>;
        
        requestInfo.method = method.toUpperCase();
        
        const pathObj = methodDetails.parameters as Array<unknown>;
        if (pathObj) {
          for (const param of pathObj) {
            const p = param as ApiParam & { 'in'?: string; 'x-example'?: string };
            const apiParam: ApiParam = {
              name: p.name,
              description: p.description || '',
              type: p.type || 'string',
              required: p.required || false,
              in: p.in || 'header',
              example: p['x-example']
            };

            if (apiParam.in === 'header') {
              if (!headers.find(h => h.name === apiParam.name)) {
                headers.push(apiParam);
              }
            } else if (apiParam.in === 'path') {
              if (!pathParams.find(p => p.name === apiParam.name)) {
                pathParams.push(apiParam);
              }
            } else if (apiParam.in === 'query') {
              if (!queryParams.find(q => q.name === apiParam.name)) {
                queryParams.push(apiParam);
              }
            } else if (apiParam.in === 'body') {
              const schema = (p as { schema?: { '$ref'?: string } }).schema;
              if (schema && typeof schema['$ref'] === 'string' && schema['$ref']) {
                const refName = schema['$ref'].replace('#/definitions/', '');
                if (data.definitions && data.definitions[refName]) {
                  const def = data.definitions[refName] as { properties?: Record<string, unknown>; required?: string[] };
                  if (def.properties) {
                    for (const [propName, propValue] of Object.entries(def.properties)) {
                      const pv = propValue as { description?: string; type?: string; example?: unknown; required?: boolean };
                      bodyParams.push({
                        name: propName,
                        description: pv.description || '',
                        type: (pv.type as string) || typeof pv.example,
                        required: def.required?.includes(propName) || false,
                        in: 'body',
                        example: pv.example
                      });
                    }
                  }
                }
              }
            }
          }
        }

        const urlExample = methodDetails['x-request-examples-url-1'] as string;
        requestInfo.url = urlExample || path;

        const responses = methodDetails.responses as Record<string, unknown>;
        if (responses) {
          for (const [statusCode, resp] of Object.entries(responses)) {
            const response = resp as { description?: string; examples?: unknown; schema?: unknown };
            const r: ResponseInfo = {
              statusCode,
              description: response.description || '',
              schema: response.schema
            };
            
            if (response.examples && typeof response.examples === 'object') {
              const exampleValues = Object.values(response.examples);
              if (exampleValues.length > 0) {
                r.example = exampleValues[0];
              }
            }
            
            responseInfo.push(r);
          }
        }
      }
    }
  }

  requestInfo.headers = headers;
  requestInfo.pathParams = pathParams;
  requestInfo.queryParams = queryParams;
  requestInfo.bodyParams = bodyParams.length > 0 ? bodyParams : undefined;

  const regions = await fetchRegions(productShort, action, hostRegion);

  const apiDetails = {
    name: data.name,
    summary: data.summary || '',
    description: data.description || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    request: requestInfo,
    response: responseInfo,
    definitions: data.definitions,
    availableRegions: regions
  };

  setCachedApiDetails(cacheKey, apiDetails);
  return apiDetails;
}

type GetApiDetailsRequest = {
  productShort: string;
  action: string;
  regionId?: string;
};

export async function POST(request: Request) {
  const { productShort, action, regionId } = (await request.json()) as GetApiDetailsRequest;

  if (!productShort || !action) {
    return NextResponse.json(
      { error: "productShort and action are required." },
      { status: 400 },
    );
  }

  try {
    const result = await getApiDetails(productShort, action, regionId);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Error fetching API details: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
      },
      { status: 500 },
    );
  }
}
