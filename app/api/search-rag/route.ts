import { NextResponse } from "next/server";
import { pipeline } from "@xenova/transformers";

const RAG_SERVER_URL = process.env.RAG_SERVER_URL || "http://127.0.0.1:8088";
const RAG_TIMEOUT_MS = Number(process.env.RAG_TIMEOUT_MS || 15000);

let embeddingPipeline: any | null = null;

async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    embeddingPipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true,
    });
  }
  return embeddingPipeline;
}

async function getQueryEmbedding(query: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe([query.slice(0, 2000)], {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(output[0].data as Float32Array);
}

async function callRag(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RAG_TIMEOUT_MS);

  try {
    const response = await fetch(`${RAG_SERVER_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : { error: await response.text() };

    return { ok: response.ok, status: response.status, payload };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, product, top_k = 3 } = body || {};

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required and must be a string" },
        { status: 400 },
      );
    }

    const topK = Math.min(Math.max(Number(top_k) || 3, 1), 10);
    const embedding = await getQueryEmbedding(query);

    const ragResult = await callRag("/search", {
      method: "POST",
      body: JSON.stringify({ query, product, top_k: topK, embedding }),
    });

    if (!ragResult.ok) {
      return NextResponse.json(
        {
          error: ragResult.payload?.error || "RAG backend request failed",
          backendStatus: ragResult.status,
        },
        { status: ragResult.status >= 400 ? ragResult.status : 502 },
      );
    }

    const backendResults = Array.isArray(ragResult.payload?.results)
      ? ragResult.payload.results
      : [];

    return NextResponse.json({
      results: backendResults.map((r: any) => ({
        similarity: r.score,
        originalSimilarity: r.originalScore ?? r.score,
        snippet: typeof r.content === "string" ? r.content.slice(0, 2000) : "",
        fullContent: r.content || "",
        source: r.source || "",
        title: r.title || "",
        product: r.product || "",
        category: r.category || "",
        id: r.id || "",
      })),
      totalDocs: ragResult.payload?.totalDocs || 0,
      queryTime: ragResult.payload?.queryTime || 0,
      threshold: ragResult.payload?.threshold || 0,
      boosted: true,
      backend: "cpp-rag",
      embeddingModel: "Xenova/all-MiniLM-L6-v2",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? `RAG backend timeout after ${RAG_TIMEOUT_MS}ms`
          : error.message
        : "Unknown error occurred";

    return NextResponse.json(
      { error: message, ragServer: RAG_SERVER_URL },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "schema") {
    const ragResult = await callRag("/schema");
    if (!ragResult.ok) {
      return NextResponse.json(
        {
          error: ragResult.payload?.error || "Failed to fetch schema",
          backendStatus: ragResult.status,
        },
        { status: ragResult.status >= 400 ? ragResult.status : 502 },
      );
    }
    return NextResponse.json(ragResult.payload);
  }

  const ragResult = await callRag("/health");
  if (!ragResult.ok) {
    return NextResponse.json(
      {
        status: "backend_unreachable",
        ragServer: RAG_SERVER_URL,
        backendStatus: ragResult.status,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: ragResult.payload?.ready ? "ready" : "not_ready",
    ragServer: RAG_SERVER_URL,
    backend: ragResult.payload,
    embeddingModel: "Xenova/all-MiniLM-L6-v2",
  });
}
