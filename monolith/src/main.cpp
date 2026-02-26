#include <array>
#include <cctype>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <sys/wait.h>
#include <unistd.h>
#include <vector>

namespace {
constexpr std::array<unsigned char, 8> MAGIC = {0x6a, 0xc1, 0x53, 0x8f, 0x2d, 0xb7, 0x44, 0xe9};
constexpr std::array<unsigned char, 16> DEFAULT_KEY = {
    0x91, 0x2f, 0xd7, 0x4a, 0x83, 0xbc, 0x55, 0x19,
    0xe0, 0x6d, 0x33, 0xfa, 0x08, 0xc4, 0x72, 0xae,
};
constexpr std::size_t FOOTER_SIZE = 48;
constexpr uint64_t FNV1A_OFFSET = 0xcbf29ce484222325ULL;
constexpr uint64_t FNV1A_PRIME = 0x100000001b3ULL;
constexpr uint64_t AUTH_SEED_A = 0x9f8b7c6d5e4f3021ULL;
constexpr uint64_t AUTH_SEED_B = 0x1023456789abcdefULL;

constexpr const char* AUTH_V1 = "auth-v1";
constexpr const char* AUTH_V2 = "auth-v2";
constexpr const char* STREAM_V1 = "v1";

std::string getSelfPath() {
  char buf[4096] = {0};
  ssize_t len = readlink("/proc/self/exe", buf, sizeof(buf) - 1);
  if (len <= 0) {
    throw std::runtime_error("Unable to resolve /proc/self/exe");
  }
  return std::string(buf, static_cast<std::size_t>(len));
}

uint64_t readU64LE(const unsigned char* data) {
  uint64_t value = 0;
  for (int i = 0; i < 8; ++i) {
    value |= static_cast<uint64_t>(data[i]) << (8 * i);
  }
  return value;
}

void writeU64LE(uint64_t value, unsigned char* out) {
  for (int i = 0; i < 8; ++i) {
    out[i] = static_cast<unsigned char>((value >> (8 * i)) & 0xff);
  }
}

uint64_t fnv1a64Update(uint64_t hash, const unsigned char* data, std::size_t len) {
  for (std::size_t i = 0; i < len; ++i) {
    hash ^= static_cast<uint64_t>(data[i]);
    hash *= FNV1A_PRIME;
  }
  return hash;
}

uint64_t fnv1a64(const std::vector<std::vector<unsigned char>>& chunks, uint64_t seed = FNV1A_OFFSET) {
  uint64_t hash = seed;
  for (const auto& chunk : chunks) {
    hash = fnv1a64Update(hash, chunk.data(), chunk.size());
  }
  return hash;
}

uint64_t splitmix64(uint64_t& state) {
  state += 0x9e3779b97f4a7c15ULL;
  uint64_t z = state;
  z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
  z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
  return z ^ (z >> 31);
}

std::array<unsigned char, 16> resolveKey() {
  std::array<unsigned char, 16> key = DEFAULT_KEY;
  const char* keyHex = std::getenv("HCAI_MONOLITH_KEY");
  if (!keyHex) return key;
  std::string hex(keyHex);
  if (hex.size() != 32) return key;
  for (char c : hex) {
    if (!std::isxdigit(static_cast<unsigned char>(c))) return key;
  }
  for (size_t i = 0; i < 16; ++i) {
    const char hi = hex[i * 2];
    const char lo = hex[i * 2 + 1];
    const auto hexToNibble = [](char ch) -> unsigned char {
      if (ch >= '0' && ch <= '9') return static_cast<unsigned char>(ch - '0');
      if (ch >= 'a' && ch <= 'f') return static_cast<unsigned char>(10 + (ch - 'a'));
      return static_cast<unsigned char>(10 + (ch - 'A'));
    };
    key[i] = static_cast<unsigned char>((hexToNibble(hi) << 4) | hexToNibble(lo));
  }
  return key;
}

std::array<unsigned char, 16> computeAuthTag(const std::vector<unsigned char>& payload,
                                              const std::array<unsigned char, 16>& nonce,
                                              const std::array<unsigned char, 16>& key) {
  std::vector<std::vector<unsigned char>> chunksA = {
      std::vector<unsigned char>(key.begin(), key.end()),
      std::vector<unsigned char>(nonce.begin(), nonce.end()),
      std::vector<unsigned char>(reinterpret_cast<const unsigned char*>(AUTH_V1),
                                 reinterpret_cast<const unsigned char*>(AUTH_V1) + std::strlen(AUTH_V1)),
      payload,
  };
  std::vector<std::vector<unsigned char>> chunksB = {
      std::vector<unsigned char>(key.begin(), key.end()),
      std::vector<unsigned char>(nonce.begin(), nonce.end()),
      std::vector<unsigned char>(reinterpret_cast<const unsigned char*>(AUTH_V2),
                                 reinterpret_cast<const unsigned char*>(AUTH_V2) + std::strlen(AUTH_V2)),
      payload,
  };
  uint64_t a = fnv1a64(chunksA, AUTH_SEED_A);
  uint64_t b = fnv1a64(chunksB, AUTH_SEED_B);
  std::array<unsigned char, 16> out{};
  writeU64LE(a, out.data());
  writeU64LE(b, out.data() + 8);
  return out;
}

void decryptPayload(std::vector<unsigned char>& payload,
                    const std::array<unsigned char, 16>& nonce,
                    const std::array<unsigned char, 16>& key) {
  std::vector<std::vector<unsigned char>> chunks = {
      std::vector<unsigned char>(key.begin(), key.end()),
      std::vector<unsigned char>(nonce.begin(), nonce.end()),
      std::vector<unsigned char>(reinterpret_cast<const unsigned char*>(STREAM_V1),
                                 reinterpret_cast<const unsigned char*>(STREAM_V1) + std::strlen(STREAM_V1)),
  };
  uint64_t state = fnv1a64(chunks, FNV1A_OFFSET);
  uint64_t keystream = 0;
  int streamIndex = 8;
  for (auto& byte : payload) {
    if (streamIndex == 8) {
      keystream = splitmix64(state);
      streamIndex = 0;
    }
    unsigned char mask = static_cast<unsigned char>((keystream >> (streamIndex * 8)) & 0xff);
    byte ^= mask;
    streamIndex += 1;
  }
}
} // namespace

int main() {
  try {
    const std::string selfPath = getSelfPath();
    std::ifstream in(selfPath, std::ios::binary);
    if (!in) throw std::runtime_error("Cannot open self binary");

    in.seekg(0, std::ios::end);
    const std::streamoff fileSize = in.tellg();
    if (fileSize < static_cast<std::streamoff>(FOOTER_SIZE)) {
      throw std::runtime_error("Binary too small (missing footer)");
    }

    in.seekg(fileSize - static_cast<std::streamoff>(FOOTER_SIZE));
    std::array<unsigned char, FOOTER_SIZE> footer{};
    in.read(reinterpret_cast<char*>(footer.data()), footer.size());
    if (!in) throw std::runtime_error("Cannot read footer");

    const uint64_t payloadSize = readU64LE(footer.data());
    if (!std::equal(MAGIC.begin(), MAGIC.end(), footer.data() + 40)) {
      throw std::runtime_error("Invalid monolith footer magic");
    }
    if (payloadSize == 0 || static_cast<std::streamoff>(payloadSize) > fileSize - static_cast<std::streamoff>(FOOTER_SIZE)) {
      throw std::runtime_error("Invalid payload size in footer");
    }

    std::array<unsigned char, 16> nonce{};
    std::array<unsigned char, 16> authTag{};
    std::copy(footer.data() + 8, footer.data() + 24, nonce.begin());
    std::copy(footer.data() + 24, footer.data() + 40, authTag.begin());

    const std::streamoff payloadStart =
        fileSize - static_cast<std::streamoff>(FOOTER_SIZE) - static_cast<std::streamoff>(payloadSize);
    in.seekg(payloadStart);

    std::vector<unsigned char> payload(payloadSize);
    in.read(reinterpret_cast<char*>(payload.data()), static_cast<std::streamsize>(payload.size()));
    if (!in) throw std::runtime_error("Cannot read embedded payload");

    const auto key = resolveKey();
    const auto computedTag = computeAuthTag(payload, nonce, key);
    if (!std::equal(computedTag.begin(), computedTag.end(), authTag.begin())) {
      throw std::runtime_error("Invalid monolith payload auth tag");
    }
    decryptPayload(payload, nonce, key);

    char tempTemplate[] = "/tmp/huaweicloudai-monolith-XXXXXX";
    char* tempDir = mkdtemp(tempTemplate);
    if (!tempDir) throw std::runtime_error("mkdtemp failed");
    const std::filesystem::path baseDir(tempDir);

    const auto tarPath = baseDir / "payload.tar.gz";
    {
      std::ofstream out(tarPath, std::ios::binary);
      out.write(reinterpret_cast<const char*>(payload.data()), static_cast<std::streamsize>(payload.size()));
      if (!out) throw std::runtime_error("Cannot write payload tar.gz");
    }

    const auto extractCmd = "tar -xzf '" + tarPath.string() + "' -C '" + baseDir.string() + "'";
    if (std::system(extractCmd.c_str()) != 0) {
      throw std::runtime_error("Failed to extract payload tar.gz");
    }

    const auto launcherPath = baseDir / "huaweicloudai";
    if (!std::filesystem::exists(launcherPath)) {
      throw std::runtime_error("Extracted launcher not found");
    }

    setenv("APP_ROOT", baseDir.c_str(), 1);

    execl(launcherPath.c_str(), launcherPath.c_str(), nullptr);
    throw std::runtime_error("execl failed to start extracted launcher");
  } catch (const std::exception& e) {
    std::cerr << "monolith startup error: " << e.what() << std::endl;
    return 1;
  }
}
