# tests/perf

Performance budgets, stress, and external-network probes. **Skipped unless `PERF=1` is set.**

Use this directory for:

- p50/p99 budgets that should fail CI if they regress.
- Stress tests of proxy/throttle/concurrency code paths.
- External-network probes that should not run in normal CI.

Do not put correctness assertions here unless they are inherently coupled to a performance dimension (e.g. "all 100 rotated requests still return 200"). Correctness without a perf axis belongs in `tests/integration/`.
