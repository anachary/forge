# Complete System Flow Diagram

## 1. HIGH-LEVEL DATA FLOW

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER INTERACTION LAYER                           │
├─────────────────────────────────────────────────────────────────────────┤
│  VS Code Extension  │  CLI  │  Chat Interface  │  Web UI               │
└──────────────┬───────────────┬────────────────────┬─────────────────────┘
               │               │                    │
               └───────────────┼────────────────────┘
                               │
                    ┌──────────▼────────────┐
                    │  Query Input         │
                    │  "How do I fix the   │
                    │   auth bug?"         │
                    └──────────┬───────────┘
                               │
        ┌──────────────────────▼──────────────────────────┐
        │   Step 4: Query Complexity Router              │
        ├───────────────────────────────────────────────┤
        │  Intent: CODE_FIX (0.85 confidence)          │
        │  Complexity: FOCUSED                          │
        │  Strategy: SEMANTIC_PLUS_GRAPH                │
        │  Model Size: MEDIUM (13-14B)                 │
        │  Est. Time: 3 seconds                         │
        └──────────────┬───────────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────┐
        │   Step 1: Context Scope Selection           │
        ├───────────────────────────────────────────┤
        │  Scope: FOCUSED                            │
        │  Max Tokens: 30,000                        │
        │  Max Files: 5                              │
        │  Include: service_impl, tests              │
        │  Exclude: vendor, auto_generated           │
        └──────────────┬───────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────┐
        │   Step 2: Semantic Code Indexing           │
        ├───────────────────────────────────────────┤
        │  ┌──────────────────────────────────────┐ │
        │  │ 1. Query Embedding                  │ │
        │  │    Input: Natural language query    │ │
        │  │    Model: nomic-embed-text          │ │
        │  │    Output: Vector [768 dims]        │ │
        │  └──────────────────────────────────────┘ │
        │                   │                       │
        │  ┌────────────────▼────────────────────┐ │
        │  │ 2. Vector Search                   │ │
        │  │    Database: LanceDB                │ │
        │  │    Operation: Cosine similarity    │ │
        │  │    Limit: 10 results               │ │
        │  └────────────────┬────────────────────┘ │
        │                   │                       │
        │  ┌────────────────▼────────────────────┐ │
        │  │ 3. Call Graph Analysis             │ │
        │  │    Find callers/callees            │ │
        │  │    Depth: 2 levels                 │ │
        │  └────────────────┬────────────────────┘ │
        │                   │                       │
        │  ┌────────────────▼────────────────────┐ │
        │  │ 4. Git History Context             │ │
        │  │    Recent 7 days changes           │ │
        │  │    Commit messages                 │ │
        │  └────────────────┬────────────────────┘ │
        │                   │                       │
        │               Output: Raw context        │
        └──────────────┬───────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────┐
        │   Step 3: Information Filtering             │
        ├───────────────────────────────────────────┤
        │  ┌──────────────────────────────────────┐ │
        │  │ Scope-Based Filtering                │ │
        │  │ • Remove excluded patterns           │ │
        │  │ • Keep included patterns             │ │
        │  │ • Enforce max_files limit            │ │
        │  └──────────────────────────────────────┘ │
        │                   │                       │
        │  ┌────────────────▼────────────────────┐ │
        │  │ Security Filtering                  │ │
        │  │ • Check for .env, .key files        │ │
        │  │ • Scan for credentials              │ │
        │  │ • Removed: 2 sensitive items        │ │
        │  └────────────────┬────────────────────┘ │
        │                   │                       │
        │               Output: Safe context       │
        └──────────────┬───────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────┐
        │   Step 5: Context Window Optimization       │
        ├───────────────────────────────────────────┤
        │  ┌──────────────────────────────────────┐ │
        │  │ Token Counting                       │ │
        │  │ • System prompt: 150 tokens          │ │
        │  │ • User query: 15 tokens              │ │
        │  │ • Reasoning space (10%): 410 tokens  │ │
        │  │ • Response space (15%): 615 tokens   │ │
        │  │ • Safety margin (5%): 205 tokens     │ │
        │  │ • Available: 2,605 tokens            │ │
        │  └──────────────┬───────────────────────┘ │
        │                │                         │
        │  ┌─────────────▼──────────────────────┐ │
        │  │ Context Fitting Algorithm          │ │
        │  │ • Greedy selection by relevance    │ │
        │  │ • Sort by (score*0.7 + priority*0.3)│
        │  │ • Select items that fit            │ │
        │  │ • Truncate partial items           │ │
        │  │ • Tokens used: 2,450               │ │
        │  │ • Items selected: 5/7              │ │
        │  └─────────────┬──────────────────────┘ │
        │               │                         │
        │  ┌─────────────▼──────────────────────┐ │
        │  │ Quality Metrics Calculation        │ │
        │  │ • Precision: 0.80                  │ │
        │  │ • Utilization: 0.71                │ │
        │  │ • Efficiency: 0.85                 │ │
        │  │ • Relevance: 0.82                  │ │
        │  │ • Coverage: 0.80                   │ │
        │  │ • Overall: 0.80                    │ │
        │  └─────────────┬──────────────────────┘ │
        │               │                         │
        │        Output: Fitted context           │
        └──────────────┬───────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────┐
        │   Context Formatting                   │
        ├───────────────────────────────────────┤
        │ • Add markdown headers                │
        │ • Include file paths + line numbers   │
        │ • Show relevance scores               │
        │ • Code syntax highlighting           │
        │ • Build final prompt                 │
        └──────────────┬───────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────┐
        │   FINAL PROMPT ASSEMBLY                    │
        ├───────────────────────────────────────────┤
        │                                            │
        │  System Prompt (150 tokens)               │
        │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔            │
        │  You are Forge, powered by advanced      │
        │  context engineering...                  │
        │                                            │
        │  Retrieved Context (2,450 tokens)        │
        │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔             │
        │  [1] src/auth/auth.py (lines 45-67)     │
        │       def verify_token():...             │
        │  [2] tests/test_auth.py (lines 12-34)   │
        │       def test_token_expiry():...        │
        │  [Git] Recent: auth.py modified 2h ago  │
        │  [Call] verify_token called by: handler │
        │                                            │
        │  User Query (15 tokens)                  │
        │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔             │
        │  How do I fix the authentication bug?    │
        │                                            │
        │  [Empty space for response: 615 tokens]  │
        │                                            │
        └──────────────┬───────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────┐
        │   Send to Local LLM (via Ollama)       │
        ├───────────────────────────────────────┤
        │ Model: qwen2.5-coder:7b                │
        │ API: POST /api/generate                │
        │ Temperature: 0.7                       │
        │ Max tokens: 615                        │
        │ Streaming: True                        │
        └──────────────┬───────────────────────┘
                       │
        ┌──────────────▼──────────────────────────┐
        │   LLM Processing                       │
        ├───────────────────────────────────────┤
        │ • Analyze context                     │
        │ • Reason about the problem            │
        │ • Generate response tokens            │
        │ • Stream to client                    │
        │ • Time: ~3-5 seconds                  │
        └──────────────┬───────────────────────┘
                       │
        ┌──────────────▼──────────────────────────┐
        │   Response Streaming & Formatting     │
        ├───────────────────────────────────────┤
        │ • Stream tokens in real-time          │
        │ • Format chunks                       │
        │ • Show progress                       │
        │ • Handle cancellation                 │
        └──────────────┬───────────────────────┘
                       │
        ┌──────────────▼──────────────────────────┐
        │   Response Delivery                    │
        ├───────────────────────────────────────┤
        │ VS Code: Rendered in chat view        │
        │ CLI: Printed to terminal              │
        │ Web: Displayed in browser             │
        │                                        │
        │ + Metadata:                           │
        │ • Complexity: FOCUSED                │
        │ • Strategy: SEMANTIC_PLUS_GRAPH       │
        │ • Quality: 0.80                      │
        │ • Time: 3.2 seconds                  │
        │ • Tokens used: 2,450                 │
        │                                        │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │   USER GETS ANSWER                   │
        └──────────────────────────────────────┘
```

---

## 2. COMPONENT INTERACTIONS

```
┌─────────────────────────────────────────────────────────────────────┐
│                   COMPONENT INTERACTION MAP                          │
└─────────────────────────────────────────────────────────────────────┘

ForgeAgent
    │
    ├─ QueryIntent Classification
    │  └─ PromptEnhancer.classify_intent()
    │
    ├─ Context Retrieval
    │  └─ EnhancedContextRetriever.retrieve()
    │     │
    │     ├─ QueryComplexityRouter.analyze_query()
    │     │  └─ Determines complexity & strategy
    │     │
    │     ├─ ContextScope Selection
    │     │  └─ get_scope_for_complexity()
    │     │
    │     ├─ Semantic Indexing
    │     │  ├─ Embedder.embed() [query embedding]
    │     │  ├─ VectorStore.search() [semantic search]
    │     │  ├─ CallGraph.get_callers/callees()
    │     │  └─ GitContext.get_recent_context()
    │     │
    │     ├─ Information Filtering
    │     │  ├─ _apply_scope_filtering()
    │     │  ├─ _apply_security_filtering()
    │     │  └─ SecurityContextFilter checks
    │     │
    │     └─ Context Window Optimization
    │        ├─ TokenCounter.estimate_tokens()
    │        ├─ ContextWindowOptimizer.allocate_budget()
    │        ├─ ContextWindowOptimizer.fit_context_to_budget()
    │        └─ ContextQualityMetrics calculation
    │
    ├─ LLM Generation
    │  └─ LLM.generate() [Ollama API]
    │     └─ Local model (qwen2.5-coder:7b)
    │
    └─ Response Formatting
       └─ Stream & display to user


LOCAL LLM SUPPORT (NEW)
    │
    ├─ LocalLLMManager
    │  ├─ detect_models()
    │  ├─ get_model_context_window()
    │  └─ switch_model()
    │
    ├─ LocalLLMOptimizer
    │  ├─ measure_model_speed()
    │  └─ estimate_response_time()
    │
    ├─ LocalLLMErrorHandler
    │  ├─ handle_connection_error()
    │  ├─ handle_timeout()
    │  └─ handle_oom()
    │
    ├─ OfflineManager
    │  ├─ is_ollama_available()
    │  └─ queue_query_if_offline()
    │
    ├─ PerformanceMonitor
    │  ├─ record_latency()
    │  └─ get_bottleneck()
    │
    ├─ LocalLLMBenchmark
    │  ├─ benchmark_model()
    │  └─ compare_models()
    │
    ├─ StreamingResponseManager
    │  ├─ stream_response()
    │  └─ emit_token()
    │
    ├─ ContextTruncationStrategy
    │  ├─ truncate_file()
    │  └─ extract_functions()
    │
    └─ LocalLLMContextEngine
       ├─ get_system_prompt()
       └─ adjust_context_for_model()
```

---

## 3. DATA FLOW THROUGH PIPELINE

```
                    USER QUERY
                        │
                        ▼
                ┌───────────────────┐
                │  Intent Analysis  │
                │    CODE_FIX       │
                └───────────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
    ┌────────┐      ┌──────────┐        ┌──────────┐
    │Complexity │  │Embedding │      │ Scope    │
    │ FOCUSED   │  │ Generated │      │ Selected │
    └────────┘      └──────────┘        └──────────┘
        │               │                   │
        ├───────────────┼───────────────────┤
        │               │                   │
        ▼               ▼                   ▼
   ┌─────────────────────────────────────────────┐
   │      Vector Search + Call Graph Analysis    │
   │  10 Results (semantic + relationships)      │
   └──────────┬──────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────────────┐
   │      Scope-Based Filtering                  │
   │  5 Results (excluded patterns removed)      │
   └──────────┬──────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────────────┐
   │      Security Filtering                     │
   │  5 Results (2 sensitive items removed)      │
   └──────────┬──────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────────────┐
   │      Relevance Scoring                      │
   │  5 Results (score >= 0.7)                   │
   └──────────┬──────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────────────┐
   │      Token Counting & Budget Allocation     │
   │  Available: 2,605 tokens                    │
   └──────────┬──────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────────────┐
   │      Context Fitting Algorithm              │
   │  Selected: 5 items, 2,450 tokens            │
   └──────────┬──────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────────────┐
   │      Quality Metrics Calculation            │
   │  Overall Quality: 0.80                      │
   └──────────┬──────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────────────┐
   │      Final Prompt Assembly                  │
   │  System (150) + Context (2450) + Query (15) │
   │  + Space for response (615)                 │
   │  = 4,230 / 4,096 tokens (fits!)             │
   └──────────┬──────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────────────┐
   │      Send to Ollama                         │
   │  qwen2.5-coder:7b                           │
   └──────────┬──────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────────────┐
   │      LLM Processing (3-5 seconds)           │
   │  Generating response tokens...              │
   └──────────┬──────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────────────┐
   │      Stream Response                        │
   │  Token: "The"                               │
   │  Token: "bug"                               │
   │  Token: "is"                                │
   │  ...                                        │
   └──────────┬──────────────────────────────────┘
              │
              ▼
              USER GETS ANSWER
```

---

## 4. LOCAL LLM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────┐
│                   LOCAL LLM ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────┘

                        ForgeAgent
                            │
                            ▼
                  ┌──────────────────────┐
                  │ LocalLLMManager      │
                  ├──────────────────────┤
                  │• Detect models       │
                  │• Switch models       │
                  │• Manage lifecycle    │
                  └──────┬───────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   ┌─────────┐  ┌──────────────┐  ┌──────────────┐
   │Model 1  │  │Model 2       │  │Model 3       │
   │qwen:7b  │  │llama2:7b     │  │mistral:7b    │
   │4K ctx   │  │4K ctx        │  │32K ctx       │
   │15 t/s   │  │12 t/s        │  │25 t/s        │
   └─────────┘  └──────────────┘  └──────────────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
                         ▼
                    ┌─────────────┐
                    │ Ollama      │
                    │ API Server  │
                    │ :11434      │
                    └─────────────┘
                         │
        ┌────────────────┬────────────────┐
        │                │                │
        ▼                ▼                ▼
   ┌─────────┐  ┌──────────────┐  ┌──────────────┐
   │CPU/GPU  │  │RAM           │  │VRAM          │
   │8 cores  │  │16GB          │  │8GB GPU       │
   └─────────┘  └──────────────┘  └──────────────┘


MONITORING & OPTIMIZATION LAYER:

    ┌─────────────────────────────────────────┐
    │  Performance Monitor                    │
    │  • Track latency per component          │
    │  • Monitor memory usage                 │
    │  • Cache hit rates                      │
    └──────────┬────────────────┬─────────────┘
               │                │
        ┌──────▼────────┐  ┌───▼──────────┐
        │Error Handler  │  │Offline Mgr   │
        │• Retries      │  │• Queue       │
        │• Timeouts     │  │• Sync        │
        │• Fallbacks    │  │• Graceful    │
        └────────────────┘  └──────────────┘


ERROR HANDLING FLOW:

    Ollama Connection
           │
           ▼
    Is available? ──NO──> Offline Mode
           │               │
          YES              ▼
           │          Queue Queries
           ▼               │
    Send Request           │
           │               │
           ├─TIMEOUT──> Reduce Context
           │                │
           ├─OOM────────> Smaller Model
           │                │
           ├─ERROR──────> Retry with Backoff
           │                │
           └─SUCCESS──────> Process Result


STREAMING & REAL-TIME UPDATES:

    Request with stream=True
              │
              ▼
    ┌─────────────────┐
    │ Token Arrives   │
    │  "The"          │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Buffer Token    │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Emit to UI      │
    │ (WebSocket)     │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Update Display  │
    │ Real-time       │
    └────────┬────────┘
             │
         Continue Until
         stream ends
```

---

## 5. REQUEST/RESPONSE CYCLE

```
┌─────────────────────────────────────────────────────────────────────┐
│             COMPLETE REQUEST/RESPONSE CYCLE                          │
└─────────────────────────────────────────────────────────────────────┘

TIME: 0ms
├─ User types query in VS Code
│  "How do I fix the authentication bug?"

TIME: 10ms
├─ Query sent to ForgeAgent
├─ Intent classification starts
├─ Pattern matching: CODE_FIX (0.85 confidence)

TIME: 50ms
├─ Complexity analysis completes
├─ Result: QueryComplexity.FOCUSED
├─ Strategy selected: SEMANTIC_PLUS_GRAPH

TIME: 100ms
├─ Scope loaded: FOCUSED (30K tokens, 5 files)
├─ Semantic indexing starts

TIME: 150ms
├─ Query embedding generated (768 dims)
├─ Vector search initiated

TIME: 500ms
├─ Vector search completes
├─ 10 results found (scores: 0.85-0.70)
├─ Call graph analysis starts

TIME: 800ms
├─ Call graph completes
├─ Git history retrieved (7 days)
├─ Information filtering starts

TIME: 900ms
├─ Scope filtering completes
├─ Security filtering starts
├─ 2 sensitive items blocked

TIME: 1000ms
├─ Filtering complete (5 items remain)
├─ Token counting starts

TIME: 1050ms
├─ Tokens counted: 2,450 available
├─ Budget allocation: 2,605 tokens
├─ Context fitting algorithm runs

TIME: 1100ms
├─ Context fitting complete
├─ 5 items selected: 2,450 tokens
├─ Quality metrics calculated

TIME: 1150ms
├─ Metrics: Precision 0.80, Quality 0.80
├─ Final prompt assembled
├─ Ready for LLM

TIME: 1160ms
├─ Request sent to Ollama
│  POST /api/generate
│  stream: true
│  temperature: 0.7
│  max_tokens: 615

TIME: 1180ms
├─ Ollama receives request
├─ Model loading (if needed)
├─ LLM processing starts

TIME: 1500ms
├─ First token generated: "The"
├─ Streaming response starts
├─ UI updates with first token

TIME: 2000ms
├─ 10 tokens generated
├─ UI shows partial response
│  "The bug appears to..."

TIME: 3000ms
├─ 30 tokens generated (150ms per token)
├─ Full analysis visible in UI

TIME: 4000ms
├─ LLM completes response
├─ 50 tokens total generated
├─ Streaming stops
├─ Final response displayed

TIME: 4100ms
├─ Analytics recorded
├─ Metrics: 3.2 seconds total
│  - Retrieval: 1.1 seconds
│  - LLM: 2.5 seconds
│  - Formatting: 0.4 seconds
├─ Result cached for similar queries

TOTAL TIME: ~3.2 seconds end-to-end
```

This complete explanation should give you a clear understanding of how the system works!
