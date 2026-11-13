# Recall AI Benchmark Report

Generated at: 2026-11-13T00:24:01.756Z
Turns measured (N): 20
Mode: **MOCKED PROVIDER HARNESS (No API Keys configured in environment)**

## Latency Summary

| Metric | p50 (Median) | p95 (95th Percentile) | Unit |
|---|---|---|---|
| **Time-to-First-Event (TTFE)** | 0.09 | 0.96 | ms |
| **Time-to-First-Token (TTFT)** | 0.09 | 0.98 | ms |
| **Memory Retrieval (A + B + C)** | 0 | 0 | ms |
| **Web Search Tool Latency** | 0 | 0.01 | ms |
| **Total Turn Duration** | 0.09 | 1.08 | ms |

## Honest Measurement Disclosure

> [!NOTE]
> **API Key Disclosure:** No external API keys (`OPENAI_API_KEY` or `TAVILY_API_KEY`) were present in the test environment during this run.
> 
> As mandated by **AGENTS.md** (*"Claim no performance number you did not measure. If something cannot run here, say so. Do not fake it"*), these numbers measure the **local engine overhead** (context building, citation stripping, state transitions, event stream dispatch) and **do NOT represent live OpenAI/Tavily network latencies**.
>
> ### To Run Live Paid Benchmarks:
> 1. Set `OPENAI_API_KEY=your_key` and `TAVILY_API_KEY=your_key` in `.env`.
> 2. Run:
>    ```bash
>    npm run bench
>    ```
> 3. The script will measure live external API round-trips and update this file.
