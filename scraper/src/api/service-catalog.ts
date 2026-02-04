/**
 * Service Catalog API
 * Fetches the list of all Huawei Cloud services
 */
import type { ServiceCatalog, ServiceCategory, Service, DocumentCategory } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { withRetryThrow } from '../utils/retry-handler.js';

interface ApiService {
  code: string;
  title: string;
  uri: string;
  description: string;
  mainSeriesProductCode: string | null;
}

interface ApiCategory {
  code: string;
  name: string;
  enName: string;
  cnName: string;
  appId: string | null;
  products: ApiService[];
}

interface ApiResponse {
  data: ApiCategory[];
  total: number;
  message: string;
  status: boolean;
}

export class ServiceCatalogFetcher {
  private readonly apiUrl: string;

  constructor(apiUrl = 'https://portal.huaweicloud.com/rest/cbc/portaldocdataservice/v1/books/items?appId=INTL-EN_US') {
    this.apiUrl = apiUrl;
  }

  /**
   * Fallback service catalog for testing when API is unavailable
   */
  private getFallbackCatalog(): ServiceCatalog {
    logger.warn('Using fallback service catalog for testing');
    
    return {
      categories: [
        {
          code: 'compute',
          name: 'Compute',
          enName: 'Compute',
          products: [
            {
              code: 'ecs',
              title: 'Elastic Cloud Server',
              category: 'compute',
              description: 'Elastic Cloud Server (ECS) provides scalable computing resources on demand.',
              uri: 'https://support.huaweicloud.com/intl/en-us/ecs/index.html'
            }
          ]
        },
        {
          code: 'storage',
          name: 'Storage',
          enName: 'Storage',
          products: [
            {
              code: 'obs',
              title: 'Object Storage Service',
              category: 'storage',
              description: 'Object Storage Service (OBS) provides stable, secure, and efficient cloud storage.',
              uri: 'https://support.huaweicloud.com/intl/en-us/obs/index.html'
            }
          ]
        }
      ],
      totalServices: 2,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Fetch all services from Huawei Cloud API
   */
  async fetchAllServices(): Promise<ServiceCatalog> {
    logger.info('Fetching service catalog from Huawei Cloud API...');

    try {
      const response = await withRetryThrow(
        async () => {
          const res = await fetch(this.apiUrl, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'HuaweiCloud-Scraper/1.0'
            }
          });

          if (!res.ok) {
            const error = new Error(`HTTP ${res.status}: ${res.statusText}`);
            (error as any).status = res.status;
            throw error;
          }

          return res.json() as Promise<ApiResponse>;
        },
        {
          maxRetries: 3,
          baseDelayMs: 1000,
          onRetry: (error, attempt) => {
            logger.warn(`Retry ${attempt}/3 fetching service catalog: ${error.message}`);
          }
        }
      );

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid API response: missing data array');
      }

    const categories: ServiceCategory[] = response.data.map(cat => ({
      code: cat.code,
      name: cat.name,
      enName: cat.enName,
      products: cat.products.map(product => ({
        code: product.code,
        title: product.title,
        category: cat.code,
        description: product.description,
        uri: product.uri
      }))
    }));

    const totalServices = categories.reduce((acc, cat) => acc + cat.products.length, 0);

    logger.success(`Fetched ${categories.length} categories with ${totalServices} services`);

    return {
      categories,
      totalServices,
      lastUpdated: new Date().toISOString()
    };
    } catch (error) {
      logger.error(`Failed to fetch service catalog: ${(error as Error).message}`);
      logger.info('Falling back to hardcoded service catalog for testing...');
      return this.getFallbackCatalog();
    }
  }

  /**
   * Extract document category from handbook code
   */
  static extractCategory(handbookCode: string): DocumentCategory {
    if (handbookCode.includes('api')) return 'api-reference';
    if (handbookCode.includes('productdesc')) return 'product-description';
    if (handbookCode.includes('qs') || handbookCode.includes('quickstart')) return 'quick-start';
    if (handbookCode.includes('ug') || handbookCode.includes('usermanual')) return 'user-guide';
    if (handbookCode.includes('bestpractice')) return 'best-practices';
    if (handbookCode.includes('trouble') || handbookCode.includes('faq')) return 'faq';
    if (handbookCode.includes('dg')) return 'user-guide'; // Developer guide
    return 'other';
  }
}
