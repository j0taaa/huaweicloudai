#!/usr/bin/env python3
"""
Evaluate RAG relevance with hybrid search
Tests multiple queries and calculates precision
"""

import subprocess
import re
from typing import List, Dict


# Test queries with expected services
TEST_QUERIES = [
    {
        "query": "How do I create an ECS instance?",
        "expected_service": "ecs",
        "description": "Basic ECS creation query"
    },
    {
        "query": "What are pricing options for storage?",
        "expected_service": ["obs", "evs", "sfs"],
        "description": "Storage pricing query"
    },
    {
        "query": "API authentication methods",
        "expected_service": ["iam", "security", "identity"],
        "description": "Authentication query"
    },
    {
        "query": "How to configure VPC network?",
        "expected_service": "vpc",
        "description": "VPC configuration query"
    },
    {
        "query": "Database backup and restore",
        "expected_service": ["rds", "taurusdb", "gaussdb"],
        "description": "Database backup query"
    },
    {
        "query": "How do I set up API Gateway?",
        "expected_service": ["apig", "api-gateway"],
        "description": "API Gateway setup query"
    },
    {
        "query": "Load balancing configuration",
        "expected_service": ["elb", "loadbalancer"],
        "description": "Load balancer query"
    },
    {
        "query": "How to create a Kubernetes cluster?",
        "expected_service": ["cce", "cloud-container-engine"],
        "description": "Kubernetes cluster query"
    },
    {
        "query": "Redis cache setup",
        "expected_service": ["redis", "dcs"],
        "description": "Redis cache query"
    },
    {
        "query": "Object storage bucket creation",
        "expected_service": "obs",
        "description": "OBS bucket creation query"
    }
]


def run_query(query: str, top_k: int = 3) -> List[Dict]:
    """Run hybrid search and return results"""
    cmd = ["python3", "scripts/hybrid_query.py", query, "--top-k", str(top_k), "--quiet"]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd="/home/scraper")
    output = result.stdout
    
    # Parse results
    results = []
    pattern = r"Service: (\w+)\s+Section:.*?\nContent:\n(.*?)(?=\n\s*=|$)"
    matches = re.findall(pattern, output, re.DOTALL)
    
    for i, (service, content) in enumerate(matches):
        results.append({
            "rank": i + 1,
            "service": service.lower(),
            "content": content[:300]  # First 300 chars for review
        })
    
    return results


def is_relevant(result: Dict, expected_services) -> bool:
    """Check if result service matches expected"""
    if isinstance(expected_services, str):
        expected_services = [expected_services]
    
    expected_services = [s.lower() for s in expected_services]
    result_service = result["service"].lower()
    
    return result_service in expected_services


def evaluate():
    """Run evaluation on all test queries"""
    print("="*80)
    print("RAG Hybrid Search Relevance Evaluation")
    print("="*80)
    print()
    
    total_queries = len(TEST_QUERIES)
    passed_queries = 0
    detailed_results = []
    
    for i, test in enumerate(TEST_QUERIES, 1):
        query = test["query"]
        expected = test["expected_service"]
        description = test["description"]
        
        print(f"Query {i}: {description}")
        print(f"  Text: {query}")
        print(f"  Expected: {expected}")
        
        results = run_query(query, top_k=3)
        
        if not results:
            print(f"  Result: ❌ FAIL - No results")
            detailed_results.append({
                "query": query,
                "expected": expected,
                "status": "FAIL",
                "actual": "None",
                "score": 0.0
            })
            print()
            continue
        
        # Check if any result is relevant
        top_result = results[0]
        is_match = is_relevant(top_result, expected)
        
        if is_match:
            passed_queries += 1
            print(f"  Result: ✅ PASS - Service: {top_result['service']} (Rank {top_result['rank']})")
            score = 1.0
        else:
            print(f"  Result: ❌ FAIL - Got: {top_result['service']}, Expected: {expected}")
            score = 0.0
        
        # Show top 3 results for review
        print(f"  Top results:")
        for r in results[:3]:
            status = "✓" if is_relevant(r, expected) else "✗"
            print(f"    {status} {r['rank']}. {r['service']}")
        
        detailed_results.append({
            "query": query,
            "expected": expected,
            "status": "PASS" if is_match else "FAIL",
            "actual": top_result['service'],
            "score": score,
            "results": results
        })
        
        print()
    
    # Summary
    print("="*80)
    print("SUMMARY")
    print("="*80)
    precision = passed_queries / total_queries
    print(f"Total Queries: {total_queries}")
    print(f"Passed: {passed_queries}")
    print(f"Failed: {total_queries - passed_queries}")
    print(f"Precision@3: {precision*100:.1f}%")
    
    if precision >= 0.8:
        print(f"✅ GRADE: A (Excellent)")
    elif precision >= 0.7:
        print(f"✅ GRADE: B (Good)")
    elif precision >= 0.6:
        print(f"⚠️  GRADE: C (Fair)")
    else:
        print(f"❌ GRADE: D (Poor)")
    
    # Grade improvement
    print()
    print("Improvement from 60%:")
    improvement = (precision - 0.6) / 0.6 * 100
    if improvement > 0:
        print(f"  +{improvement:.1f}% improvement")
    elif improvement < 0:
        print(f"  {improvement:.1f}% decline")
    else:
        print(f"  No change")
    
    # Failing queries
    print()
    print("Failing Queries:")
    failing = [r for r in detailed_results if r["status"] == "FAIL"]
    if failing:
        for r in failing:
            print(f"  - {r['query']}")
            print(f"    Expected: {r['expected']}, Got: {r['actual']}")
    else:
        print("  None! 🎉")
    
    print()
    print("="*80)
    
    return precision


if __name__ == "__main__":
    precision = evaluate()
    
    # Exit with appropriate code
    if precision >= 0.8:
        exit(0)  # Success - 80%+ achieved
    elif precision >= 0.7:
        exit(1)  # Good but not enough
    else:
        exit(2)  # Failure