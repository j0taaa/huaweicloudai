cmake_minimum_required(VERSION 3.16)
project(rag_cpp_server LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(ZLIB REQUIRED)

add_executable(rag-cpp-server src/main.cpp)
target_link_libraries(rag-cpp-server PRIVATE ZLIB::ZLIB)
