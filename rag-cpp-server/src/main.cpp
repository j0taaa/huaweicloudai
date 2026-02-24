#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#include <zlib.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <map>
#include <set>
#include <nlohmann/json.hpp>
#include <sstream>
#include <string>
#include <vector>

using json = nlohmann::json;


static const std::vector<std::string> SERVICE_NAMES = {
  "EVS","OBS","ECS","VPC","RDS","CCE","ELB","IAM","APM","CSS","DWS","DLI","DDS",
  "DMS","KAFKA","SMN","SMS","CSE","DCS","DDM","DRS","GES","GAUSSDB","MRS","SFS",
  "SWR","FUNCTIONGRAPH","MODELARTS","DIS","CLOUDTABLE","CODEARTS","AOM","CES","LTS","BMS",
  "AS","CAE","CCI","CSBS","VBS","SDRS","CBR","DES","HIVEL","FLINK","CLICKHOUSE","CDN",
  "DNS","VOD","RTC","APIG","ROMA","WAF","HSS","DBSS","SEMASTER","IDENTITYCENTER","STS",
  "PROJECTMAN","CLOUDPHONE","IEF","IMS","EIP","NAT","VPN","DEH","FPGA","GPU","OMS"
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
  std::vector<Doc> docs;
  bool ready = false;
  std::string cacheDir;
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
  while ((bytes = gzread(gz, buffer, sizeof(buffer))) > 0) {
    out.append(buffer, bytes);
  }
  gzclose(gz);
  return out;
}

static std::string toLower(std::string s) {
  std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return std::tolower(c); });
  return s;
}

static std::vector<std::string> splitWords(const std::string& q) {
  std::istringstream iss(toLower(q));
  std::vector<std::string> words;
  std::string w;
  static const std::set<std::string> stopWords = {
    "a", "an", "the", "to", "of", "for", "in", "on", "and", "or", "with", "by",
    "is", "are", "be", "how", "what", "when", "where", "which", "can", "could", "should"
  };
  while (iss >> w) {
    w.erase(std::remove_if(w.begin(), w.end(), [](unsigned char c) {
      return !std::isalnum(c) && c != '-' && c != '_';
    }), w.end());
    if (w.size() >= 2 && stopWords.find(w) == stopWords.end()) words.push_back(w);
  }
  return words;
}

static std::vector<std::string> extractServiceNames(const std::string& query) {
  std::vector<std::string> found;
  const std::string upper = [&]() {
    std::string t = query;
    std::transform(t.begin(), t.end(), t.begin(), [](unsigned char c){ return std::toupper(c); });
    return t;
  }();

  for (const auto& service : SERVICE_NAMES) {
    if (upper.find(service) != std::string::npos) {
      found.push_back(service);
    }
  }
  return found;
}

static std::set<std::string> findMentionedProducts(const AppState& state, const std::string& queryLower) {
  std::set<std::string> mentioned;
  for (const auto& productLower : state.knownProducts) {
    if (!productLower.empty() && queryLower.find(productLower) != std::string::npos) {
      mentioned.insert(productLower);
    }
  }
  return mentioned;
}

static double scoreDoc(
  const Doc& d,
  const std::vector<std::string>& terms,
  const std::set<std::string>& mentionedProducts,
  const std::vector<std::string>& extractedServices,
  const std::string& query
) {
  if (terms.empty()) return 0.0;
  const std::string title = toLower(d.title);
  const std::string product = toLower(d.product);
  const std::string category = toLower(d.category);
  const std::string body = toLower(d.content);

  double semanticScore = 0.0;
  for (const auto& t : terms) {
    if (title.find(t) != std::string::npos) semanticScore += 2.2;
    else if (product.find(t) != std::string::npos) semanticScore += 2.0;
    else if (category.find(t) != std::string::npos) semanticScore += 1.6;
    else if (body.find(t) != std::string::npos) semanticScore += 1.0;
  }

  semanticScore /= static_cast<double>(terms.size());
  // normalize to [0,1] approximate semantic score
  semanticScore = std::min(1.0, semanticScore / 2.2);

  double score = semanticScore;

  if (!mentionedProducts.empty() && mentionedProducts.find(product) != mentionedProducts.end()) {
    score *= 1.5;
  }

  if (!extractedServices.empty()) {
    std::string docProductUpper = d.product;
    std::transform(docProductUpper.begin(), docProductUpper.end(), docProductUpper.begin(), [](unsigned char c){ return std::toupper(c); });

    for (const auto& svc : extractedServices) {
      if (docProductUpper == svc) { score *= 1.5; break; }
    }

    std::string titleUpper = d.title;
    std::transform(titleUpper.begin(), titleUpper.end(), titleUpper.begin(), [](unsigned char c){ return std::toupper(c); });
    for (const auto& svc : extractedServices) {
      if (titleUpper.find(svc) != std::string::npos) { score *= 1.2; break; }
    }
  }

  std::vector<std::string> qwords;
  {
    std::istringstream iss(toLower(query));
    std::string w;
    while (iss >> w) if (w.size() > 3) qwords.push_back(w);
  }
  int matches = 0;
  for (const auto& w : qwords) if (body.find(w) != std::string::npos) matches++;
  if (!qwords.empty() && matches > 0) {
    double ratio = static_cast<double>(matches) / static_cast<double>(qwords.size());
    score *= (1.0 + ratio * 0.2);
  }

  return std::min(score, 1.0);
}

static void loadDocs(AppState& state) {
  const std::string docs = state.cacheDir + "/documents.json";
  const std::string docsGz = docs + ".gz";

  std::string payload;
  if (fileExists(docsGz)) {
    payload = readGzip(docsGz);
  } else if (fileExists(docs)) {
    payload = readFile(docs);
  } else {
    throw std::runtime_error("No documents.json(.gz) found in " + state.cacheDir);
  }

  const auto arr = json::parse(payload);
  if (!arr.is_array()) throw std::runtime_error("documents payload is not an array");

  state.docs.clear();
  state.docs.reserve(arr.size());
  for (const auto& item : arr) {
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
    return {
      {"ready", state.ready},
      {"documents", state.docs.size()},
      {"cacheDir", state.cacheDir}
    };
  }

  if (req.method == "GET" && req.path == "/schema") {
    return {
      {"name", "rag_search"},
      {"description", "Simple C++ RAG search over local Huawei docs cache"},
      {"parameters", {
        {"type", "object"},
        {"properties", {
          {"query", {{"type", "string"}}},
          {"top_k", {{"type", "number"}, {"default", 3}}},
          {"product", {{"type", "string"}}}
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
    const std::string product = toLower(input.value("product", ""));
    const int topK = std::max(1, std::min(10, input.value("top_k", 3)));
    const double threshold = 0.2;

    if (query.empty()) {
      status = 400;
      return {{"error", "query is required"}};
    }

    const auto start = std::chrono::steady_clock::now();
    const auto terms = splitWords(query);
    const auto queryLower = toLower(query);
    const auto mentionedProducts = findMentionedProducts(state, queryLower);
    const auto extractedServices = extractServiceNames(query);

    struct Scored {
      const Doc* doc;
      double score;
      double originalScore;
    };

    std::vector<Scored> scored;
    scored.reserve(state.docs.size());

    for (const auto& d : state.docs) {
      if (!product.empty() && toLower(d.product) != product) continue;
      const double s = scoreDoc(d, terms, mentionedProducts, extractedServices, query);
      const double original = s;
      if (s >= threshold) {
        scored.push_back({&d, s, original});
      }
    }

    std::sort(scored.begin(), scored.end(), [](const Scored& a, const Scored& b) {
      return a.score > b.score;
    });

    if (!extractedServices.empty() && product.empty()) {
      std::vector<Scored> topResults = scored;
      const int initialTopK = std::max(topK, 5);
      if (static_cast<int>(topResults.size()) > initialTopK) topResults.resize(initialTopK);

      auto isServiceMatch = [&](const Scored& s) {
        std::string p = s.doc->product;
        std::transform(p.begin(), p.end(), p.begin(), [](unsigned char c){ return std::toupper(c); });
        for (const auto& svc : extractedServices) if (p == svc) return true;
        return false;
      };

      std::vector<Scored> serviceMatches;
      std::vector<Scored> otherMatches;
      for (const auto& item : topResults) {
        if (isServiceMatch(item)) serviceMatches.push_back(item);
        else otherMatches.push_back(item);
      }

      if (!serviceMatches.empty()) {
        int serviceCount = std::max(2, std::min(static_cast<int>(serviceMatches.size()), static_cast<int>(std::ceil(topK * 0.6))));
        std::vector<Scored> combined;
        for (int i = 0; i < serviceCount && i < static_cast<int>(serviceMatches.size()); ++i) combined.push_back(serviceMatches[i]);
        for (const auto& item : otherMatches) {
          if (static_cast<int>(combined.size()) >= topK) break;
          combined.push_back(item);
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
      results.push_back({
        {"id", s.doc->id},
        {"title", s.doc->title},
        {"source", s.doc->source},
        {"product", s.doc->product},
        {"category", s.doc->category},
        {"content", s.doc->content},
        {"score", s.score},
        {"originalScore", s.originalScore}
      });
    }

    const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now() - start
    ).count();

    return {
      {"results", results},
      {"totalDocs", state.docs.size()},
      {"queryTime", elapsed},
      {"threshold", threshold}
    };
  }

  status = 404;
  return {{"error", "Not found"}};
}

int main() {
  AppState state;
  state.cacheDir = getEnv("RAG_CACHE_DIR", "rag_cache");

  try {
    loadDocs(state);
    std::cerr << "Loaded docs: " << state.docs.size() << " from " << state.cacheDir << std::endl;
  } catch (const std::exception& e) {
    std::cerr << "Initial load failed: " << e.what() << std::endl;
    state.ready = false;
  }

  const int port = std::stoi(getEnv("RAG_SERVER_PORT", "8088"));

  int serverFd = socket(AF_INET, SOCK_STREAM, 0);
  if (serverFd < 0) {
    std::cerr << "socket() failed\n";
    return 1;
  }

  int opt = 1;
  setsockopt(serverFd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = INADDR_ANY;
  addr.sin_port = htons(port);

  if (bind(serverFd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
    std::cerr << "bind() failed\n";
    close(serverFd);
    return 1;
  }

  if (listen(serverFd, 64) < 0) {
    std::cerr << "listen() failed\n";
    close(serverFd);
    return 1;
  }

  std::cerr << "RAG C++ server listening on 0.0.0.0:" << port << std::endl;

  while (true) {
    int client = accept(serverFd, nullptr, nullptr);
    if (client < 0) continue;

    std::string raw;
    char buf[8192];
    ssize_t n;
    while ((n = read(client, buf, sizeof(buf))) > 0) {
      raw.append(buf, n);
      if (raw.find("\r\n\r\n") != std::string::npos) {
        const auto headerEnd = raw.find("\r\n\r\n");
        std::string head = raw.substr(0, headerEnd);
        std::size_t contentLength = 0;
        std::istringstream hs(head);
        std::string line;
        while (std::getline(hs, line)) {
          if (!line.empty() && line.back() == '\r') line.pop_back();
          std::string lower = toLower(line);
          if (lower.rfind("content-length:", 0) == 0) {
            contentLength = static_cast<std::size_t>(std::stoul(line.substr(15)));
          }
        }
        if (raw.size() >= headerEnd + 4 + contentLength) break;
      }
    }

    int status = 200;
    std::string statusText = "OK";
    json payload;

    try {
      Request req = parseRequest(raw);
      payload = routeRequest(req, state, status);
    } catch (const std::exception& e) {
      status = 500;
      payload = {{"error", e.what()}};
    }

    if (status == 404) statusText = "Not Found";
    if (status == 400) statusText = "Bad Request";
    if (status == 500) statusText = "Internal Server Error";
    if (status == 503) statusText = "Service Unavailable";

    const std::string response = makeHttpResponse(status, statusText, payload.dump());
    send(client, response.data(), response.size(), 0);
    close(client);
  }

  close(serverFd);
  return 0;
}
