#include <array>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <sys/wait.h>
#include <unistd.h>
#include <vector>

namespace {
constexpr std::array<char, 8> MAGIC = {'H', 'C', 'A', 'I', 'M', 'O', 'N', 'O'};

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
} // namespace

int main() {
  try {
    const std::string selfPath = getSelfPath();
    std::ifstream in(selfPath, std::ios::binary);
    if (!in) throw std::runtime_error("Cannot open self binary");

    in.seekg(0, std::ios::end);
    const std::streamoff fileSize = in.tellg();
    if (fileSize < 16) throw std::runtime_error("Binary too small (missing footer)");

    in.seekg(fileSize - 16);
    std::array<unsigned char, 16> footer{};
    in.read(reinterpret_cast<char*>(footer.data()), 16);
    if (!in) throw std::runtime_error("Cannot read footer");

    const uint64_t payloadSize = readU64LE(footer.data());
    if (!std::equal(MAGIC.begin(), MAGIC.end(), reinterpret_cast<char*>(footer.data() + 8))) {
      throw std::runtime_error("Invalid monolith footer magic");
    }
    if (payloadSize == 0 || static_cast<std::streamoff>(payloadSize) > fileSize - 16) {
      throw std::runtime_error("Invalid payload size in footer");
    }

    const std::streamoff payloadStart = fileSize - 16 - static_cast<std::streamoff>(payloadSize);
    in.seekg(payloadStart);

    std::vector<char> payload(payloadSize);
    in.read(payload.data(), static_cast<std::streamsize>(payload.size()));
    if (!in) throw std::runtime_error("Cannot read embedded payload");

    char tempTemplate[] = "/tmp/huaweicloudai-monolith-XXXXXX";
    char* tempDir = mkdtemp(tempTemplate);
    if (!tempDir) throw std::runtime_error("mkdtemp failed");
    const std::filesystem::path baseDir(tempDir);

    const auto tarPath = baseDir / "payload.tar.gz";
    {
      std::ofstream out(tarPath, std::ios::binary);
      out.write(payload.data(), static_cast<std::streamsize>(payload.size()));
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
