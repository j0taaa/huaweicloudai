#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#include <zlib.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <nlohmann/json.hpp>
#include <set>
#include <sstream>
#include <string>
#include <vector>

using json = nlohmann::json;

static const std::vector<std::string> SERVICE_NAMES = {
  "EVS", "OBS", "ECS", "VPC", "RDS", "CCE", "ELB", "IAM", "APM", "CSS", "DWS", "DLI", "DDS",
  "DMS", "KAFKA", "SMN", "SMS", "CSE", "DCS", "DDM", "DRS", "GES", "GAUSSDB", "MRS", "SFS",
  "SWR", "FUNCTIONGRAPH", "MODELARTS", "DIS", "CLOUDTABLE", "CODEARTS", "AOM", "CES", "LTS", "BMS",
  "AS", "CAE", "CCI", "CSBS", "VBS", "SDRS", "CBR", "DES", "FLINK", "CLICKHOUSE", "CDN", "DNS",
  "VOD", "RTC", "APIG", "ROMA", "WAF", "HSS", "DBSS", "STS", "IEF", "IMS", "EIP", "NAT", "VPN"
};

struct Doc {
  std::string id;
  std::string content;
  std::string source;
  std::string title;
  std::string product;
  std::string category;
};

struct AppState {
  bool ready = false;
  std::string cacheDir;
  std::vector<Doc> docs;
  std::vector<std::vector<float>> embeddings;
  std::set<std::string> knownProducts;
};

static std::string getEnv(const char* name, const std::string& fallback) {
  const char* value = std::getenv(name);
  return value ? std::string(value) : fallback;
}

static bool fileExists(const std::string& p) {
  std::ifstream f(p, std::ios::binary);
  return f.good();
}

static std::string readFile(const std::string& path) {
  std::ifstream f(path, std::ios::binary);
  if (!f) throw std::runtime_error("Cannot open file: " + path);
  std::ostringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

static std::string readGzip(const std::string& path) {
  gzFile gz = gzopen(path.c_str(), "rb");
  if (!gz) throw std::runtime_error("Cannot open gzip file: " + path);

  std::string out;
  char buffer[8192];
  int bytes = 0;
  while ((bytes = gzread(gz, buffer, sizeof(buffer))) > 0) out.append(buffer, bytes);
  gzclose(gz);
  return out;
}

static std::vector<unsigned char> readBinary(const std::string& path) {
  std::ifstream f(path, std::ios::binary);
  if (!f) throw std::runtime_error("Cannot open binary file: " + path);
  return std::vector<unsigned char>(std::istreambuf_iterator<char>(f), std::istreambuf_iterator<char>());
}

static std::vector<unsigned char> readBinaryGzip(const std::string& path) {
  const std::string payload = readGzip(path);
  return std::vector<unsigned char>(payload.begin(), payload.end());
}

static uint32_t readU32LE(const std::vector<unsigned char>& b, std::size_t& off) {
  if (off + 4 > b.size()) throw std::runtime_error("Invalid embeddings buffer (u32)");
  uint32_t v = static_cast<uint32_t>(b[off])
    | (static_cast<uint32_t>(b[off + 1]) << 8)
    | (static_cast<uint32_t>(b[off + 2]) << 16)
    | (static_cast<uint32_t>(b[off + 3]) << 24);
  off += 4;
  return v;
}

static float readF32LE(const std::vector<unsigned char>& b, std::size_t& off) {
  uint32_t u = readU32LE(b, off);
  float f;
  std::memcpy(&f, &u, sizeof(float));
  return f;
}

static std::string toLower(std::string s) {
  std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return std::tolower(c); });
  return s;
}

static std::vector<std::string> extractServiceNames(const std::string& query) {
  std::string upper = query;
  std::transform(upper.begin(), upper.end(), upper.begin(), [](unsigned char c) { return std::toupper(c); });
  std::vector<std::string> found;
  for (const auto& service : SERVICE_NAMES) {
    if (upper.find(service) != std::string::npos) found.push_back(service);
  }
  return found;
}

static double cosineSimilarity(const std::vector<float>& a, const std::vector<float>& b) {
  if (a.empty() || a.size() != b.size()) return 0.0;
  double dot = 0.0, normA = 0.0, normB = 0.0;
  for (std::size_t i = 0; i < a.size(); ++i) {
    dot += static_cast<double>(a[i]) * b[i];
    normA += static_cast<double>(a[i]) * a[i];
    normB += static_cast<double>(b[i]) * b[i];
  }
  if (normA == 0.0 || normB == 0.0) return 0.0;
  return dot / (std::sqrt(normA) * std::sqrt(normB));
}

static double calculateRelevanceScore(
  double semanticScore,
  const Doc& doc,
  const std::vector<std::string>& extractedServices,
  const std::string& query
) {
  double score = semanticScore;

  if (!extractedServices.empty()) {
    std::string docProduct = doc.product;
    std::transform(docProduct.begin(), docProduct.end(), docProduct.begin(), [](unsigned char c) { return std::toupper(c); });
    for (const auto& svc : extractedServices) {
      if (docProduct == svc) {
        score *= 1.5;
        break;
      }
    }

    std::string titleUpper = doc.title;
    std::transform(titleUpper.begin(), titleUpper.end(), titleUpper.begin(), [](unsigned char c) { return std::toupper(c); });
    for (const auto& svc : extractedServices) {
      if (titleUpper.find(svc) != std::string::npos) {
        score *= 1.2;
        break;
      }
    }
  }

  std::vector<std::string> queryWords;
  {
    std::istringstream iss(toLower(query));
    std::string w;
    while (iss >> w) if (w.size() > 3) queryWords.push_back(w);
  }

  const std::string contentLower = toLower(doc.content);
  int keywordMatches = 0;
  for (const auto& w : queryWords) if (contentLower.find(w) != std::string::npos) keywordMatches++;
  if (!queryWords.empty() && keywordMatches > 0) {
    const double ratio = static_cast<double>(keywordMatches) / static_cast<double>(queryWords.size());
    score *= (1.0 + ratio * 0.2);
  }

  return std::min(score, 1.0);
}

static void loadDocsAndEmbeddings(AppState& state) {
  const std::string docsPath = state.cacheDir + "/documents.json";
  const std::string docsGzPath = docsPath + ".gz";
  const std::string embPath = state.cacheDir + "/embeddings.bin";
  const std::string embGzPath = embPath + ".gz";

  if (!(fileExists(docsPath) || fileExists(docsGzPath))) {
    throw std::runtime_error("No documents.json(.gz) found in " + state.cacheDir);
  }
  if (!(fileExists(embPath) || fileExists(embGzPath))) {
    throw std::runtime_error("No embeddings.bin(.gz) found in " + state.cacheDir);
  }

  const std::string docsPayload = fileExists(docsGzPath) ? readGzip(docsGzPath) : readFile(docsPath);
  auto docsJson = json::parse(docsPayload);
  if (!docsJson.is_array()) throw std::runtime_error("documents payload is not array");

  state.docs.clear();
  state.docs.reserve(docsJson.size());
  state.knownProducts.clear();

  for (const auto& item : docsJson) {
    Doc d;
    d.id = item.value("id", "");
    d.content = item.value("content", "");
    d.source = item.value("source", "");
    d.title = item.value("title", "");
    d.product = item.value("product", "");
    d.category = item.value("category", "");
    if (!d.product.empty()) state.knownProducts.insert(toLower(d.product));
    state.docs.push_back(std::move(d));
  }

  std::vector<unsigned char> embBuffer = fileExists(embGzPath) ? readBinaryGzip(embGzPath) : readBinary(embPath);
  std::size_t off = 0;
  const uint32_t count = readU32LE(embBuffer, off);
  state.embeddings.clear();
  state.embeddings.reserve(count);

  for (uint32_t i = 0; i < count; ++i) {
    const uint32_t len = readU32LE(embBuffer, off);
    std::vector<float> emb;
    emb.reserve(len);
    for (uint32_t j = 0; j < len; ++j) emb.push_back(readF32LE(embBuffer, off));
    state.embeddings.push_back(std::move(emb));
  }

  if (state.docs.size() != state.embeddings.size()) {
    throw std::runtime_error("Documents/embeddings count mismatch");
  }

  state.ready = true;
}

static std::string makeHttpResponse(int status, const std::string& statusText, const std::string& body) {
  std::ostringstream out;
  out << "HTTP/1.1 " << status << " " << statusText << "\r\n";
  out << "Content-Type: application/json\r\n";
  out << "Content-Length: " << body.size() << "\r\n";
  out << "Connection: close\r\n\r\n";
  out << body;
  return out.str();
}

struct Request {
  std::string method;
  std::string path;
  std::string body;
};

static Request parseRequest(const std::string& raw) {
  Request req;
  const auto headerEnd = raw.find("\r\n\r\n");
  const std::string head = raw.substr(0, headerEnd);
  req.body = headerEnd == std::string::npos ? "" : raw.substr(headerEnd + 4);

  std::istringstream lines(head);
  std::string start;
  std::getline(lines, start);
  if (!start.empty() && start.back() == '\r') start.pop_back();
  std::istringstream startStream(start);
  startStream >> req.method >> req.path;
  return req;
}

static json routeRequest(const Request& req, AppState& state, int& status) {
  status = 200;

  if (req.method == "GET" && req.path == "/health") {
    return { {"ready", state.ready}, {"documents", state.docs.size()}, {"embeddings", state.embeddings.size()}, {"cacheDir", state.cacheDir} };
  }

  if (req.method == "GET" && req.path == "/schema") {
    return {
      {"name", "rag_search"},
      {"description", "Semantic search over Huawei docs using MiniLM embeddings"},
      {"parameters", {
        {"type", "object"},
        {"properties", {
          {"query", {{"type", "string"}}},
          {"top_k", {{"type", "number"}, {"default", 3}}},
          {"product", {{"type", "string"}}},
          {"embedding", {{"type", "array"}, {"items", {{"type", "number"}}}}}
        }},
        {"required", json::array({"query"})}
      }}
    };
  }

  if (req.method == "POST" && req.path == "/search") {
    if (!state.ready) {
      status = 503;
      return {{"error", "RAG backend is not ready"}};
    }

    json input;
    try {
      input = json::parse(req.body.empty() ? "{}" : req.body);
    } catch (...) {
      status = 400;
      return {{"error", "Invalid JSON payload"}};
    }

    const std::string query = input.value("query", "");
    const std::string productFilter = toLower(input.value("product", ""));
    const int topK = std::max(1, std::min(10, input.value("top_k", 3)));
    const double threshold = 0.2;
    if (query.empty()) {
      status = 400;
      return {{"error", "query is required"}};
    }

    std::vector<float> queryEmbedding;
    if (input.contains("embedding") && input["embedding"].is_array()) {
      for (const auto& v : input["embedding"]) queryEmbedding.push_back(v.get<float>());
    }

    const auto extractedServices = extractServiceNames(query);

    struct Scored {
      int idx;
      double score;
      double originalScore;
    };

    const auto start = std::chrono::steady_clock::now();
    std::vector<Scored> scored;
    scored.reserve(state.docs.size());

    for (std::size_t i = 0; i < state.docs.size(); ++i) {
      const auto& d = state.docs[i];
      if (!productFilter.empty() && toLower(d.product) != productFilter) continue;

      double semantic = 0.0;
      if (!queryEmbedding.empty()) {
        semantic = cosineSimilarity(queryEmbedding, state.embeddings[i]);
      } else {
        // fallback lexical mode (for direct backend tests)
        std::string ql = toLower(query);
        if (toLower(d.title).find(ql) != std::string::npos || toLower(d.content).find(ql) != std::string::npos) {
          semantic = 0.5;
        }
      }

      const double boosted = calculateRelevanceScore(semantic, d, extractedServices, query);
      if (boosted >= threshold) scored.push_back({static_cast<int>(i), boosted, semantic});
    }

    std::sort(scored.begin(), scored.end(), [](const Scored& a, const Scored& b) { return a.score > b.score; });

    if (!extractedServices.empty() && productFilter.empty()) {
      const int initK = std::max(topK, 5);
      if (static_cast<int>(scored.size()) > initK) scored.resize(initK);

      std::vector<Scored> svc, other;
      for (const auto& s : scored) {
        std::string p = state.docs[s.idx].product;
        std::transform(p.begin(), p.end(), p.begin(), [](unsigned char c) { return std::toupper(c); });
        bool hit = false;
        for (const auto& svcName : extractedServices) if (p == svcName) { hit = true; break; }
        (hit ? svc : other).push_back(s);
      }

      if (!svc.empty()) {
        const int svcCount = std::max(2, std::min(static_cast<int>(svc.size()), static_cast<int>(std::ceil(topK * 0.6))));
        std::vector<Scored> combined;
        for (int i = 0; i < svcCount; ++i) combined.push_back(svc[i]);
        for (const auto& o : other) {
          if (static_cast<int>(combined.size()) >= topK) break;
          combined.push_back(o);
        }
        scored = combined;
      } else if (static_cast<int>(scored.size()) > topK) {
        scored.resize(topK);
      }
    } else if (static_cast<int>(scored.size()) > topK) {
      scored.resize(topK);
    }

    json results = json::array();
    for (const auto& s : scored) {
      const auto& d = state.docs[s.idx];
      results.push_back({
        {"id", d.id}, {"title", d.title}, {"source", d.source}, {"product", d.product},
        {"category", d.category}, {"content", d.content}, {"score", s.score}, {"originalScore", s.originalScore}
      });
    }

    const auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count();
    return {{"results", results}, {"totalDocs", state.docs.size()}, {"queryTime", elapsedMs}, {"threshold", threshold}};
  }

  status = 404;
  return {{"error", "Not found"}};
}

int main() {
  AppState state;
  state.cacheDir = getEnv("RAG_CACHE_DIR", "rag_cache");

  try {
    loadDocsAndEmbeddings(state);
    std::cerr << "Loaded docs/embeddings: " << state.docs.size() << " from " << state.cacheDir << std::endl;
  } catch (const std::exception& e) {
    std::cerr << "Initial load failed: " << e.what() << std::endl;
    state.ready = false;
  }

  const int port = std::stoi(getEnv("RAG_SERVER_PORT", "8088"));
  int serverFd = socket(AF_INET, SOCK_STREAM, 0);
  if (serverFd < 0) return 1;

  int opt = 1;
  setsockopt(serverFd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = INADDR_ANY;
  addr.sin_port = htons(port);

  if (bind(serverFd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) return 1;
  if (listen(serverFd, 64) < 0) return 1;

  std::cerr << "RAG C++ server listening on 0.0.0.0:" << port << std::endl;

  while (true) {
    int client = accept(serverFd, nullptr, nullptr);
    if (client < 0) continue;

    std::string raw;
    char buf[8192];
    ssize_t n;
    while ((n = read(client, buf, sizeof(buf))) > 0) {
      raw.append(buf, n);
      const auto headerEnd = raw.find("\r\n\r\n");
      if (headerEnd == std::string::npos) continue;

      std::size_t contentLength = 0;
      std::istringstream hs(raw.substr(0, headerEnd));
      std::string line;
      while (std::getline(hs, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        std::string lower = toLower(line);
        if (lower.rfind("content-length:", 0) == 0) {
          contentLength = static_cast<std::size_t>(std::stoul(line.substr(15)));
          break;
        }
      }
      if (raw.size() >= headerEnd + 4 + contentLength) break;
    }

    int status = 200;
    std::string statusText = "OK";
    json payload;
    try {
      payload = routeRequest(parseRequest(raw), state, status);
    } catch (const std::exception& e) {
      status = 500;
      payload = {{"error", e.what()}};
    }

    if (status == 400) statusText = "Bad Request";
    else if (status == 404) statusText = "Not Found";
    else if (status == 500) statusText = "Internal Server Error";
    else if (status == 503) statusText = "Service Unavailable";

    const auto response = makeHttpResponse(status, statusText, payload.dump());
    send(client, response.data(), response.size(), 0);
    close(client);
  }
}
