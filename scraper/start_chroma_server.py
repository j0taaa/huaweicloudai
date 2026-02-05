#!/usr/bin/env python3
"""Start ChromaDB server with persistent storage"""
import sys
sys.path.insert(0, '/usr/local/lib/python3.10/dist-packages')

from chromadb.config import Settings
from chromadb.server.fastapi import FastAPI

# Create settings with persistent storage path
settings = Settings(
    persist_directory='/home/rag_cache/chroma_db',
    is_persistent=True,
    anonymized_telemetry=False
)

# Create the server
server = FastAPI(settings)

if __name__ == "__main__":
    import uvicorn
    print("Starting ChromaDB server on 0.0.0.0:8000...")
    print(f"Data directory: /home/rag_cache/chroma_db")
    uvicorn.run(server.app(), host="0.0.0.0", port=8000, log_level="info")
