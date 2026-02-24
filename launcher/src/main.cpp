#include <csignal>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <string>
#include <thread>
#include <chrono>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#include <limits.h>

static pid_t ragPid = -1;
static pid_t tsPid = -1;

static void terminateChild(pid_t pid) {
  if (pid > 0) {
    kill(pid, SIGTERM);
    waitpid(pid, nullptr, 0);
  }
}

static void onSignal(int) {
  terminateChild(tsPid);
  terminateChild(ragPid);
  std::_Exit(0);
}

static std::string executableDir() {
  char buf[PATH_MAX] = {0};
  ssize_t len = readlink("/proc/self/exe", buf, sizeof(buf) - 1);
  if (len <= 0) return std::filesystem::current_path().string();
  buf[len] = '\0';
  return std::filesystem::path(buf).parent_path().string();
}

int main() {
  std::signal(SIGINT, onSignal);
  std::signal(SIGTERM, onSignal);

  const std::string baseDir = executableDir();
  chdir(baseDir.c_str());

  const std::string ragDefault = (std::filesystem::path(baseDir) / "rag-cpp-server").string();
  const std::string tsDefault = (std::filesystem::path(baseDir) / "ts-server").string();

  const std::string ragBin = std::getenv("RAG_SERVER_BIN") ? std::getenv("RAG_SERVER_BIN") : ragDefault;
  const std::string tsBin = std::getenv("TS_SERVER_BIN") ? std::getenv("TS_SERVER_BIN") : tsDefault;
  const std::string ragPort = std::getenv("RAG_SERVER_PORT") ? std::getenv("RAG_SERVER_PORT") : "8088";

  setenv("APP_ROOT", baseDir.c_str(), 1);
  setenv("RAG_CACHE_DIR", (std::filesystem::path(baseDir) / "rag_cache").string().c_str(), 1);
  setenv("RAG_SERVER_URL", ("http://127.0.0.1:" + ragPort).c_str(), 1);

  ragPid = fork();
  if (ragPid == 0) {
    execl(ragBin.c_str(), ragBin.c_str(), nullptr);
    std::perror("failed to start rag-cpp-server");
    std::_Exit(1);
  }

  std::this_thread::sleep_for(std::chrono::seconds(1));

  tsPid = fork();
  if (tsPid == 0) {
    execl(tsBin.c_str(), tsBin.c_str(), nullptr);
    std::perror("failed to start ts-server");
    std::_Exit(1);
  }

  int status = 0;
  pid_t finished = wait(&status);
  if (finished == tsPid) {
    terminateChild(ragPid);
  } else if (finished == ragPid) {
    terminateChild(tsPid);
  }

  return WIFEXITED(status) ? WEXITSTATUS(status) : 1;
}
