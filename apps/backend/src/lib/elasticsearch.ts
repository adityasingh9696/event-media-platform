import { Client } from '@elastic/elasticsearch';

let esClient: Client | null = null;

export function getElasticsearchClient(): Client | null {
  return esClient;
}

const MEDIA_INDEX = 'media';

const mediaMappings = {
  properties: {
    id: { type: 'keyword' as const },
    title: { type: 'text' as const, analyzer: 'standard' },
    description: { type: 'text' as const, analyzer: 'standard' },
    tags: { type: 'keyword' as const },
    uploaderName: { type: 'keyword' as const },
    eventName: {
      type: 'text' as const,
      fields: { keyword: { type: 'keyword' as const } },
    },
    albumName: {
      type: 'text' as const,
      fields: { keyword: { type: 'keyword' as const } },
    },
    uploadDate: { type: 'date' as const },
    visibility: { type: 'keyword' as const },
    mediaType: { type: 'keyword' as const },
  },
};

export async function connectElasticsearch(): Promise<void> {
  const url = process.env.ELASTICSEARCH_URL;
  if (!url) {
    console.warn('⚠️  ELASTICSEARCH_URL not set — search will use PostgreSQL fallback');
    return;
  }

  try {
    esClient = new Client({ node: url });

    // Verify connection
    await esClient.ping();
    console.info('✅ Elasticsearch connected');

    // Create index if it doesn't exist
    const indexExists = await esClient.indices.exists({ index: MEDIA_INDEX });

    if (!indexExists) {
      await esClient.indices.create({
        index: MEDIA_INDEX,
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
        mappings: mediaMappings,
      });
      console.info(`✅ Elasticsearch index '${MEDIA_INDEX}' created`);
    } else {
      console.info(`✅ Elasticsearch index '${MEDIA_INDEX}' already exists`);
    }
  } catch (err) {
    const error = err as Error;
    console.warn(`⚠️  Elasticsearch unavailable (${error.message}) — using PostgreSQL fallback`);
    esClient = null;
  }
}

export async function indexMedia(doc: {
  id: string;
  title?: string;
  description?: string;
  tags: string[];
  uploaderName: string;
  eventName: string;
  albumName: string;
  uploadDate: Date;
  visibility: string;
  mediaType: string;
}): Promise<void> {
  if (!esClient) return;
  try {
    await esClient.index({
      index: MEDIA_INDEX,
      id: doc.id,
      document: doc,
    });
  } catch (err) {
    console.error('Elasticsearch index error:', err);
  }
}

export async function searchMedia(params: {
  q?: string;
  tags?: string[];
  from?: string;
  to?: string;
  visibility?: string;
  page?: number;
  limit?: number;
}): Promise<{ hits: any[]; total: number } | null> {
  if (!esClient) return null;

  const { q, tags, from, to, visibility, page = 1, limit = 20 } = params;
  const must: any[] = [];
  const filter: any[] = [];

  if (q) {
    must.push({
      multi_match: {
        query: q,
        fields: ['title^3', 'description^2', 'tags^2', 'eventName', 'albumName', 'uploaderName'],
        fuzziness: 'AUTO',
      },
    });
  }

  if (tags && tags.length > 0) {
    filter.push({ terms: { tags } });
  }

  if (visibility) {
    filter.push({ term: { visibility } });
  }

  if (from || to) {
    const range: any = { uploadDate: {} };
    if (from) range.uploadDate.gte = from;
    if (to) range.uploadDate.lte = to;
    filter.push({ range });
  }

  try {
    const result = await esClient.search({
      index: MEDIA_INDEX,
      from: (page - 1) * limit,
      size: limit,
      query: {
        bool: {
          must: must.length > 0 ? must : [{ match_all: {} }],
          filter,
        },
      },
    });

    const hits = result.hits.hits.map((h: any) => ({ id: h._id, ...h._source }));
    const total =
      typeof result.hits.total === 'number'
        ? result.hits.total
        : result.hits.total?.value ?? 0;

    return { hits, total };
  } catch (err) {
    console.error('Elasticsearch search error:', err);
    return null;
  }
}

export async function suggestMedia(q: string): Promise<string[]> {
  if (!esClient) return [];

  try {
    const result = await esClient.search({
      index: MEDIA_INDEX,
      size: 0,
      query: {
        multi_match: {
          query: q,
          fields: ['tags', 'eventName.keyword', 'albumName.keyword'],
          type: 'phrase_prefix',
        },
      },
      aggs: {
        tags: {
          terms: { field: 'tags', size: 5 },
        },
      },
    });

    const buckets: any[] = (result.aggregations?.tags as any)?.buckets ?? [];
    return buckets.map((b: any) => b.key);
  } catch (err) {
    console.error('Elasticsearch suggest error:', err);
    return [];
  }
}

export async function deleteMediaFromIndex(id: string): Promise<void> {
  if (!esClient) return;
  try {
    await esClient.delete({ index: MEDIA_INDEX, id });
  } catch (err) {
    // Ignore not-found errors
  }
}

export { esClient };
