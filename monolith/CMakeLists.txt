cmake_minimum_required(VERSION 3.16)
project(huaweicloudai_monolith LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(huaweicloudai-monolith src/main.cpp)

if (CMAKE_CXX_COMPILER_ID STREQUAL "GNU" AND CMAKE_CXX_COMPILER_VERSION VERSION_LESS 9)
  target_link_libraries(huaweicloudai-monolith stdc++fs)
endif()
