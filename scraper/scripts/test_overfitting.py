#!/usr/bin/env python3
"""
Test RAG with NEW queries to check for overfitting
These queries were NOT used in the thesaurus tuning process
"""

import subprocess
import re
from typing import List, Dict

# NEW test queries - completely different from tuning set
NEW_TEST_QUERIES = [
    {
        "query": "How to create a NAT gateway?",
        "expected_service": "natgateway",
        "description": "NAT gateway (network service, not in original set)"
    },
    {
        "query": "S3 compatible API endpoints",
        "expected_service": "obs",
        "description": "OBS API compatibility (not tested before)"
    },
    {
        "query": "MySQL read replica setup",
        "expected_service": "rds",
        "description": "Database feature (read replicas)"
    },
    {
        "query": "Error: connection timeout",
        "expected_service": "ecs",  # or vpc/networking
        "description": "Troubleshooting error (not how-to)"
    },
    {
        "query": "Free tier limits and quotas",
        "expected_service": ["billing", "cost"],
        "description": "Pricing/quota question (not service-specific)"
    },
    {
        "query": "MySQL read replica setup",
        "expected_service": "rds",
        "description": "Database feature (read replicas)"
    },
    {
        "query": "Error: connection timeout",
        "expected_service": "ecs",  # or vpc/networking
        "description": "Troubleshooting error (not how-to)"
    },
    {
        "query": "Free tier limits and quotas",
        "expected_service": ["billing", "bss", "quotas"],
        "description": "Pricing/quota question (not service-specific)"
    },
    {
        "query": "Docker image registry login",
        "expected_service": "swr",
        "description": "Container registry (SWR, not tested before)"
    },
    {
        "query": "How to delete a snapshot?",
        "expected_service": ["evs", "obs"],
        "description": "Delete operation (not create)"
    },
    {
        "query": "SSL certificate installation",
        "expected_service": ["elb", "cdn"],
        "description": "Security/certificate question"
    },
    {
        "query": "Kubernetes pod autoscaling",
        "expected_service": "cce",
        "description": "CCE specific feature (autoscaling)"
    },
    {
        "query": "How to backup function code?",
        "expected_service": "functiongraph",
        "description": "Serverless backup (not tested before)"
    },
    {
        "query": "EBS volume encryption setup",
        "expected_service": "evs",
        "description": "Storage encryption (EBS terminology)"
    },
    {
        "query": "API rate limiting configuration",
        "expected_service": "apig",
        "description": "API Gateway feature (rate limiting)"
    },
    {
        "query": "Load balancer health check failed",
        "expected_service": "elb",
        "description": "ELB troubleshooting (health checks)"
    },
    {
        "query": "How to enable CDN acceleration?",
        "expected_service": "cdn",
        "description": "CDN setup (not tested before)"
    },
    {
        "query": "Message queue message durability",
        "expected_service": ["kafka", "rabbitmq"],
        "description": "Message queue reliability (not tested before)"
    },
    {
        "query": "Disaster recovery for databases",
        "expected_service": "drs",
        "description": "DR feature (backup/restoration context)"
    },
    {
        "query": "How to configure security group?",
        "expected_service": "vpc",
        "description": "VPC security (security groups)"
    },
    {
        "query": "Object storage lifecycle policy",
        "expected_service": "obs",
        "description": "OBS advanced feature (lifecycle)"
    },
    {
        "query": "Virtual machine CPU sizing",
        "expected_service": "ecs",
        "description": "ECS sizing (performance question)"
    },
    {
        "query": "Kubernetes node pool management",
        "expected_service": "cce",
        "description": "CCE node pools (advanced feature)"
    }
]


def run_query(query: str, top_k: int = 3) -> List[Dict]:
    """Run hybrid search and return results"""
    cmd = ["python3", "scripts/hybrid_query.py", query, "--top-k", str(top_k), "--quiet"]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd="/home/scraper")
    output = result.stdout
    
    # Parse results
    results = []
    pattern = r"Service: (\w+)\s+Section:"
    matches = re.findall(pattern, output)
    
    for i, service in enumerate(matches):
        results.append({
            "rank": i + 1,
            "service": service.lower()
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
    """Run evaluation on NEW test queries"""
    print("="*80)
    print("RAG OVERFITTING TEST - NEW QUERIES ONLY")
    print("="*80)
    print("These queries were NOT used in thesaurus tuning")
    print()
    
    total_queries = len(NEW_TEST_QUERIES)
    passed_queries = 0
    partial_queries = 0
    failed_queries = 0
    
    results_by_type = {
        "how-to": {"total": 0, "pass": 0},
        "troubleshooting": {"total": 0, "pass": 0},
        "api": {"total": 0, "pass": 0},
        "feature": {"total": 0, "pass": 0},
        "pricing": {"total": 0, "pass": 0},
        "other": {"total": 0, "pass": 0}
    }
    
    for i, test in enumerate(NEW_TEST_QUERIES, 1):
        query = test["query"]
        expected = test["expected_service"]
        description = test["description"]
        
        print(f"Query {i}: {description}")
        print(f"  Text: {query}")
        print(f"  Expected: {expected}")
        
        results = run_query(query, top_k=3)
        
        if not results:
            print(f"  Result: ❌ FAIL - No results")
            failed_queries += 1
            classify_and_track(query, results_by_type, pass_flag=False)
            print()
            continue
        
        # Check if top result is relevant
        top_result = results[0]
        is_match = is_relevant(top_result, expected)
        
        # Check if ANY result in top-3 is relevant
        any_match = any(is_relevant(r, expected) for r in results)
        
        if is_match:
            passed_queries += 1
            print(f"  Result: ✅ PASS - Service: {top_result['service']} (Rank {top_result['rank']})")
            classify_and_track(query, results_by_type, pass_flag=True)
        elif any_match:
            partial_queries += 1
            # Find relevant result
            relevant = next((r for r in results if is_relevant(r, expected)), None)
            print(f"  Result: ⚠️  PARTIAL - Top: {top_result['service']}, Expected: {expected}")
            print(f"           Relevant result at rank {relevant['rank']}: {relevant['service']}")
            classify_and_track(query, results_by_type, pass_flag=False)
        else:
            failed_queries += 1
            print(f"  Result: ❌ FAIL - Got: {top_result['service']}, Expected: {expected}")
            print(f"           All top 3: {[r['service'] for r in results]}")
            classify_and_track(query, results_by_type, pass_flag=False)
        
        # Show top 3 results for review
        print(f"  Top results:")
        for r in results[:3]:
            status = "✓" if is_relevant(r, expected) else "✗"
            print(f"    {status} {r['rank']}. {r['service']}")
        
        print()
    
    # Summary
    print("="*80)
    print("SUMMARY")
    print("="*80)
    precision_top1 = passed_queries / total_queries
    precision_top3 = (passed_queries + partial_queries) / total_queries
    
    print(f"Total Queries: {total_queries}")
    print(f"✅ PASS (top-1): {passed_queries}")
    print(f"⚠️  PARTIAL (relevant in top-3): {partial_queries}")
    print(f"❌ FAIL: {failed_queries}")
    print()
    print(f"Precision@1: {precision_top1*100:.1f}%")
    print(f"Precision@3: {precision_top3*100:.1f}%")
    
    if precision_top1 >= 0.8:
        print(f"✅ GRADE: A (Excellent - No overfitting)")
    elif precision_top1 >= 0.6:
        print(f"⚠️  GRADE: B (Good - Minor overfitting)")
    elif precision_top1 >= 0.4:
        print(f"⚠️  GRADE: C (Fair - Moderate overfitting)")
    else:
        print(f"❌ GRADE: D (Poor - Significant overfitting)")
    
    # Breakdown by query type
    print()
    print("="*80)
    print("PERFORMANCE BY QUERY TYPE")
    print("="*80)
    for qtype, stats in results_by_type.items():
        if stats["total"] > 0:
            rate = stats["pass"] / stats["total"] * 100
            print(f"{qtype:20s}: {stats['pass']:2}/{stats['total']:2} ({rate:5.1f}%)")
    
    # Failing queries
    print()
    print("="*80)
    print(f"FAILING QUERIES ({failed_queries})")
    print("="*80)
    for test in NEW_TEST_QUERIES:
        query = test["query"]
        expected = test["expected_service"]
        results = run_query(query, top_k=3)
        
        if results:
            top_result = results[0]
            if not is_relevant(top_result, expected):
                print(f"- {query}")
                print(f"  Expected: {expected}, Got: {top_result['service']}")
                print(f"  Top 3: {[r['service'] for r in results]}")
    
    print()
    print("="*80)
    
    # Verdict
    print()
    if precision_top1 >= 0.8:
        print("🎉 NO OVERFITTING - System generalizes well to new queries!")
    elif precision_top1 >= 0.6:
        print("⚠️  MINOR OVERFITTING - Some tuning for specific queries, but good generalization")
    else:
        print("❌ OVERFITTING DETECTED - System tuned too narrowly for test set")
    
    return precision_top1, precision_top3


def classify_and_track(query: str, results_by_type: dict, pass_flag: bool):
    """Classify query type and track results"""
    query_lower = query.lower()
    
    if any(w in query_lower for w in ["how", "create", "set up", "configure", "delete", "enable", "install"]):
        qtype = "how-to"
    elif any(w in query_lower for w in ["error", "fail", "timeout", "check", "problem"]):
        qtype = "troubleshooting"
    elif any(w in query_lower for w in ["api", "endpoint", "rate limiting", "s3", "sdk"]):
        qtype = "api"
    elif any(w in query_lower for w in ["feature", "pool", "lifecycle", "durability", "replica", "autoscaling"]):
        qtype = "feature"
    elif any(w in query_lower for w in ["price", "cost", "quota", "limit", "tier", "billing"]):
        qtype = "pricing"
    else:
        qtype = "other"
    
    results_by_type[qtype]["total"] += 1
    if pass_flag:
        results_by_type[qtype]["pass"] += 1


if __name__ == "__main__":
    p1, p3 = evaluate()
    
    # Exit with appropriate code
    if p1 >= 0.8:
        exit(0)  # No overfitting
    elif p1 >= 0.6:
        exit(1)  # Minor overfitting
    else:
        exit(2)  # Significant overfitting