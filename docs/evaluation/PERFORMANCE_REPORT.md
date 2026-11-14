# Recall AI - Performance & Latency Benchmark Report

**Generated at:** 2026-11-14T01:23:22.897Z  
**Target Environment:** Local Engine Runner & Deployed Vercel Edge Runtime  
**Total Iterations Measured:** 50 turns

## 1. Engine Latency by Workload Profile (ms)

| Profile | Workload Description | Iterations | p50 (Median) | p95 | p99 | Min | Max | Avg |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| **A** | Basic Question (No Search, No Memory) | 10 | 0.1 | 0.22 | 0.24 | 0.08 | 0.25 | 0.12 |
| **B** | Memory Retrieval Query | 10 | 0.09 | 0.14 | 0.16 | 0.08 | 0.16 | 0.1 |
| **C** | Live Web Search Query | 10 | 0.1 | 0.14 | 0.14 | 0.09 | 0.14 | 0.11 |
| **D** | Combined Memory + Search Query | 10 | 0.11 | 0.16 | 0.18 | 0.1 | 0.18 | 0.12 |
| **E** | Long Conversation Context Query | 10 | 0.1 | 0.12 | 0.12 | 0.08 | 0.12 | 0.1 |

---

## 2. Event Dispatch Latency Breakdown (Profile A - Basic Turn)

- **Time-to-First-Event (TTFE):**
  - p50: `0.09 ms`
  - p95: `0.19 ms`
- **Time-to-First-Token (TTFT):**
  - p50: `0.09 ms`
  - p95: `0.19 ms`

---

## 3. Live External Provider Round-Trip Latency (Groq + Tavily)

Recorded live in `docs/benchmarks.md` over 10 consecutive live turns:

| Phase | Metric | p50 (Median) | p95 | Unit |
|---|---|---:|---:|---|
| External LLM Streaming | Time-to-First-Token (TTFT) | 21,148.93 | 40,327.28 | ms |
| Web Search Tool | Tavily Round-Trip | 0.00 | 4,722.04 | ms |
| Full Live Turn | Total Turn Duration | 21,520.15 | 42,094.17 | ms |

*(Note: Live round trips on free tier endpoints include provider rate-limit queuing and token generation; local engine overhead isolates framework processing to sub-millisecond ranges).*
