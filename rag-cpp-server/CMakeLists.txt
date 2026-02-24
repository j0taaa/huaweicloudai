cmake_minimum_required(VERSION 3.16)
project(rag_cpp_server LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

find_package(ZLIB REQUIRED)

FetchContent_Declare(
  nlohmann_json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
  DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_MakeAvailable(nlohmann_json)

add_executable(rag-cpp-server src/main.cpp)
target_link_libraries(rag-cpp-server PRIVATE ZLIB::ZLIB nlohmann_json::nlohmann_json)
