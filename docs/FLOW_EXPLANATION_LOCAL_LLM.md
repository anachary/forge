"""
Complete Flow Explanation: Context Engineering Pipeline

This document explains how the entire context engineering system works,
from user query to final response, with emphasis on local LLM compatibility.
"""

# ============================================================================
# PART 1: COMPLETE DATA FLOW
# ============================================================================

COMPLETE_FLOW = """
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CONTEXT ENGINEERING FLOW                           │
└─────────────────────────────────────────────────────────────────────────────┘

1. USER QUERY SUBMISSION
   ├─ Input: "How do I fix the authentication bug?"
   ├─ Source: VS Code extension / CLI / Chat interface
   └─ Destination: ForgeAgent

2. QUERY ANALYSIS & ROUTING (Step 4)
   ├─ Intent Classification
   │  ├─ Pattern matching against CODE_FIX patterns
   │  ├─ Confidence scoring (0.85 for "fix bug")
   │  └─ Result: QueryIntent.CODE_FIX
   │
   ├─ Complexity Detection
   │  ├─ Regex pattern matching
   │  ├─ Query length analysis
   │  ├─ Keyword frequency scoring
   │  └─ Result: QueryComplexity.FOCUSED
   │
   ├─ Strategy Selection
   │  ├─ Route to SEMANTIC_PLUS_GRAPH strategy
   │  ├─ Estimated time: ~3 seconds
   │  ├─ Recommended model: "medium" (13-14B)
   │  └─ Web search needed: False
   │
   └─ Output: QueryAnalysis object

3. CONTEXT SCOPE SELECTION (Step 1)
   ├─ Match complexity to predefined scope
   ├─ Apply FOCUSED scope settings:
   │  ├─ max_tokens: 30,000
   │  ├─ max_files: 5
   │  ├─ enable_call_graph: True
   │  ├─ enable_git_context: True
   │  ├─ search_depth: 2
   │  ├─ git_lookback_days: 7
   │  └─ min_relevance_score: 0.7
   │
   └─ Output: ContextScope object

4. SEMANTIC INDEXING & RETRIEVAL (Step 2)
   ├─ Query Embedding
   │  ├─ Input: "How do I fix the authentication bug?"
   │  ├─ Model: all-MiniLM-L6-v2 (sentence-transformers, default) or nomic-embed-text (Ollama)
   │  ├─ Output: Vector [0.2, -0.5, 0.8, ..., 0.1] (384 or 768 dimensions)
   │  └─ Storage: Cached for reuse
   │
   ├─ Vector Search
   │  ├─ Database: VectorStore (LanceDB)
   │  ├─ Operation: Cosine similarity search
   │  ├─ Limit: 10 results (more than scope limit for filtering)
   │  └─ Output: SearchResult objects with scores
   │
   ├─ Call Graph Analysis
   │  ├─ For each result, find callers/callees
   │  ├─ Depth: 2 levels
   │  ├─ Track function dependencies
   │  └─ Output: Relationship strings
   │
   ├─ Git History Context
   │  ├─ Last 7 days of changes
   │  ├─ Commit messages related to auth
   │  └─ Output: Recent modifications context
   │
   └─ Output: Search results + relationships + git history

5. INFORMATION FILTERING (Step 3)
   ├─ Scope-Based Filtering
   │  ├─ Remove excluded patterns (auto_generated, vendor_dependencies)
   │  ├─ Keep only included patterns (service_implementation, tests)
   │  └─ Enforce max_files: 5 limit
   │
   ├─ Security Filtering
   │  ├─ Check file paths for sensitive patterns
   │  ├─ Scan content for credentials
   │  ├─ Remove .env files
   │  ├─ Block .key, .pem files
   │  ├─ Scan for AWS keys, JWT secrets
   │  └─ Count filtered items: 2 (sensitive config files removed)
   │
   ├─ Relevance Scoring
   │  ├─ Filter results with score >= 0.7
   │  ├─ Keep top 5 most relevant results
   │  └─ Output: Filtered and ranked results
   │
   └─ Output: Clean, safe, relevant context

6. CONTEXT WINDOW OPTIMIZATION (Step 5)
   ├─ Token Counting
   │  ├─ System prompt: ~150 tokens
   │  ├─ User query: ~15 tokens
   │  ├─ Reasoning space (10%): ~410 tokens
   │  ├─ Response space (15%): ~615 tokens
   │  ├─ Safety margin (5%): ~205 tokens
   │  └─ Available for context: ~2,605 tokens (out of 4,096)
   │
   ├─ Context Item Preparation
   │  ├─ Semantic results: Priority 1.0, score 0.85
   │  ├─ Call graph context: Priority 0.7, score 0.80
   │  ├─ Git history: Priority 0.5, score 0.60
   │  └─ Total items before fitting: 7
   │
   ├─ Budget Fitting Algorithm
   │  ├─ Sort by (relevance_score * 0.7 + priority * 0.3)
   │  ├─ Greedily select items that fit
   │  ├─ Truncate items that partially fit
   │  ├─ Tokens used: 2,450
   │  └─ Items selected: 5 (from 7)
   │
   ├─ Quality Metrics Calculation
   │  ├─ Search precision: 4/5 relevant = 0.80
   │  ├─ Context utilization: 5/7 items = 0.71
   │  ├─ Token efficiency: 0.85 (high value per token)
   │  ├─ Relevance score: 0.82 (average)
   │  ├─ Coverage: 0.80 (80% of relevant code covered)
   │  └─ Overall quality: 0.80 (weighted average)
   │
   └─ Output: Fitted context + TokenBudget + Quality metrics

7. CONTEXT FORMATTING
   ├─ Format context for model presentation:
   │  ├─ Add markdown headers
   │  ├─ Include file paths with line numbers
   │  ├─ Show relevance scores
   │  ├─ Add code blocks with syntax
   │  └─ Indicate truncations with markers
   │
   ├─ Build final prompt:
   │  ├─ System prompt (150 tokens)
   │  ├─ Formatted context (2,450 tokens)
   │  ├─ User query (15 tokens)
   │  └─ Empty space for response (~615 tokens)
   │
   └─ Output: Final prompt ready for LLM

8. LLM PROCESSING
   ├─ Input to Local LLM
   │  ├─ Model: qwen2.5-coder:7b (or other local model)
   │  ├─ Temperature: 0.7
   │  ├─ Max tokens: 615
   │  └─ Via: Ollama HTTP API (or Claude/OpenAI API)
   │
   ├─ Generation Process
   │  ├─ Reasoning: Model analyzes context (internal)
   │  ├─ Generation: Model writes response (streaming)
   │  └─ Time: ~3-5 seconds for 7B model
   │
   └─ Output: Streamed response text

9. RESPONSE STREAMING & FORMATTING
   ├─ Stream chunks from LLM
   ├─ Buffer and format chunks
   ├─ Send to client in real-time
   ├─ Track response metrics
   └─ Cache result for future similar queries

10. RESPONSE DELIVERY
    ├─ VS Code Extension: Rendered in chat view
    ├─ CLI: Printed to terminal
    ├─ Chat Interface: Displayed in web UI
    ├─ Plus: Metadata (complexity, strategy, quality)
    └─ User sees: Relevant, accurate, timely answer

11. ANALYTICS & METRICS
    ├─ Query complexity distribution
    ├─ Retrieval strategy usage
    ├─ Quality score trends
    ├─ Security filter triggers
    ├─ Cache hit rates
    └─ Model performance tracking

"""

# ============================================================================
# PART 2: LOCAL LLM COMPATIBILITY
# ============================================================================

LOCAL_LLM_ANALYSIS = """
✅ CURRENT COMPATIBILITY: YES, WORKS WITH LOCAL LLMS

The system is DESIGNED for local operation:

1. EMBEDDING MODEL (Already configured)
   ├─ Default: all-MiniLM-L6-v2 (sentence-transformers, 384 dims)
   ├─ Alternative: nomic-embed-text (Ollama, 768 dims)
   ├─ Provider: sentence-transformers (local, no server needed)
   ├─ Advantages: Fast, offline, no API keys, no Ollama dependency
   └─ Status: ✓ Ready

2. LLM MODEL (Already configured)
   ├─ Model: qwen2.5-coder:7b (default, can change)
   ├─ Provider: Ollama (local)
   ├─ API: /api/generate endpoint
   ├─ Supports: Streaming responses
   └─ Status: ✓ Ready

3. VECTOR DATABASE (Already configured)
   ├─ Type: LanceDB (embedded)
   ├─ Storage: Local disk (.forge/vectors)
   ├─ Persistence: Survives restarts
   ├─ No external service required
   └─ Status: ✓ Ready

KEY ADVANTAGES FOR LOCAL LLMS:
✓ No internet required
✓ No API keys/credentials needed
✓ Privacy: Data never leaves your machine
✓ Cost: Free (run on GPU/CPU)
✓ Latency: Depends on hardware, not network
✓ Control: Full control over models

TESTED MODELS:
✓ qwen2.5-coder:7b (recommended, fast)
✓ llama2:7b (stable)
✓ mistral:7b (good quality)
✓ neural-chat:7b (conversational)
✓ codellama:7b (code-focused)
✓ deepseek-coder:6.7b (excellent for code)
"""

# ============================================================================
# PART 3: EXTRA FEATURES NEEDED FOR LOCAL LLMS
# ============================================================================

EXTRA_FEATURES_NEEDED = """

╔════════════════════════════════════════════════════════════════════════════╗
║              EXTRA FEATURES FOR OPTIMAL LOCAL LLM SUPPORT                  ║
╚════════════════════════════════════════════════════════════════════════════╝

1. LOCAL MODEL MANAGEMENT
   ━━━━━━━━━━━━━━━━━━━━━━━━━

   NEEDED FEATURES:
   
   a) Model Auto-Detection
      ├─ Detect available local models from Ollama
      ├─ List installed models on startup
      ├─ Fallback to default if preferred model not found
      └─ Warn user if model is not available
   
   b) Model Switching
      ├─ Switch between different local models mid-session
      ├─ Store model preferences
      ├─ Recalculate context window for different models
      ├─ Warn about context window size changes
      └─ Auto-adjust token budgets accordingly
   
   c) Model Information Caching
      ├─ Cache model specs (context window, quantization)
      ├─ Store model names and parameters
      ├─ Avoid re-querying Ollama repeatedly
      └─ Update cache when model changes
   
   IMPLEMENTATION EXAMPLE:
   
   class LocalLLMManager:
       def __init__(self):
           self.available_models = []
           self.current_model = None
           self.model_cache = {}
       
       def detect_models(self):
           '''Detect models from Ollama API'''
           response = requests.get("http://localhost:11434/api/tags")
           models = response.json()['models']
           self.available_models = [m['name'] for m in models]
           return self.available_models
       
       def get_model_context_window(self, model_name):
           '''Get context window for specific model'''
           # Query model specs or use presets
           presets = {
               'qwen2.5-coder:7b': 4096,
               'llama2:7b': 4096,
               'mistral:7b': 32768,
               'deepseek-coder:6.7b': 4096,
           }
           return presets.get(model_name, 4096)


2. MEMORY & PERFORMANCE OPTIMIZATION
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   NEEDED FEATURES:

   a) Memory Monitoring
      ├─ Track GPU/CPU memory usage
      ├─ Monitor Ollama process memory
      ├─ Alert if approaching limits
      ├─ Suggest model size changes
      └─ Auto-unload models if needed
   
   b) Response Time Estimation
      ├─ Measure actual response times per model
      ├─ Account for hardware differences
      ├─ Adjust timeout based on complexity
      ├─ Predict response time before generating
      └─ Show user estimated time
   
   c) Batch Processing Queue
      ├─ Queue multiple queries
      ├─ Process sequentially to avoid OOM
      ├─ Manage GPU resources efficiently
      ├─ Prioritize high-priority queries
      └─ Show progress to user
   
   IMPLEMENTATION EXAMPLE:
   
   class LocalLLMOptimizer:
       def __init__(self):
           self.response_times = {}
           self.memory_usage = {}
       
       def measure_model_speed(self, model_name):
           '''Benchmark model response time'''
           test_query = "def hello(): pass"
           start = time.time()
           response = self.generate(model_name, test_query)
           elapsed = time.time() - start
           self.response_times[model_name] = elapsed
           return elapsed
       
       def estimate_response_time(self, model_name, context_tokens):
           '''Estimate time for this query'''
           base_time = self.response_times.get(model_name, 3.0)
           # Tokens per second varies by model
           tokens_per_sec = {
               'qwen2.5-coder:7b': 20,
               'llama2:7b': 15,
               'mistral:7b': 25,
           }
           tps = tokens_per_sec.get(model_name, 15)
           estimated_response_tokens = 400  # Average response length
           return base_time + (estimated_response_tokens / tps)


3. CONTEXT TRUNCATION STRATEGIES
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   NEEDED FEATURES:

   a) Smart Truncation
      ├─ Summarize long files instead of truncating
      ├─ Keep function signatures, drop implementation
      ├─ Extract only relevant sections
      ├─ Use ellipsis for clarity
      └─ Track truncation metadata
   
   b) Context Summarization
      ├─ Generate summaries for large files
      ├─ Extract key function signatures
      ├─ Keep import statements
      ├─ Maintain code structure
      └─ Reduce token count by 50-70%
   
   c) Adaptive Context Levels
      ├─ Level 1: Function signatures only (~30% tokens)
      ├─ Level 2: Functions + docstrings (~50% tokens)
      ├─ Level 3: Full files (~100% tokens)
      ├─ Auto-select level based on available budget
      └─ Allow user to adjust
   
   IMPLEMENTATION EXAMPLE:
   
   class ContextTruncationStrategy:
       def __init__(self):
           self.strategies = {
               'aggressive': 0.3,  # 30% of original tokens
               'moderate': 0.5,    # 50% of original tokens
               'minimal': 0.8,     # 80% of original tokens
               'none': 1.0,        # 100% of original tokens
           }
       
       def truncate_file(self, content, token_limit, strategy='moderate'):
           '''Intelligently truncate file content'''
           # Extract structure
           functions = self._extract_functions(content)
           imports = self._extract_imports(content)
           
           # Rebuild with less detail
           summary = imports + "\\n\\n"
           for func in functions:
               summary += f"{func['signature']}\\n"
               if func['docstring']:
                   summary += f"    {func['docstring']}\\n"
           
           return summary
       
       def _extract_functions(self, content):
           '''Extract function signatures'''
           # Use regex or AST parsing
           pass
       
       def _extract_imports(self, content):
           '''Extract import statements'''
           pass


4. OFFLINE CAPABILITIES
   ━━━━━━━━━━━━━━━━━━━━

   NEEDED FEATURES:

   a) Offline Context Building
      ├─ Pre-index codebase when online
      ├─ Cache embeddings
      ├─ Store call graphs
      ├─ Work offline if Ollama unavailable
      └─ Queue queries until Ollama available
   
   b) Model Caching
      ├─ Detect when model is loaded
      ├─ Keep model in memory
      ├─ Avoid reload delays
      ├─ Monitor memory automatically
      └─ Auto-unload on inactivity
   
   c) Fallback Modes
      ├─ If Ollama down: Use basic retrieval
      ├─ If model unavailable: Use smaller model
      ├─ If context full: Use summaries
      ├─ If timeout: Use cached responses
      └─ Graceful degradation
   
   IMPLEMENTATION EXAMPLE:
   
   class OfflineManager:
       def __init__(self):
           self.offline_mode = False
           self.query_queue = []
       
       def is_ollama_available(self):
           '''Check if Ollama is running'''
           try:
               requests.get("http://localhost:11434/api/tags", timeout=1)
               return True
           except:
               self.offline_mode = True
               return False
       
       def queue_query_if_offline(self, query):
           '''Queue query if offline'''
           if not self.is_ollama_available():
               self.query_queue.append({
                   'query': query,
                   'timestamp': time.time(),
               })
               return None
           return self.retrieve(query)
       
       def process_queue_when_online(self):
           '''Process queued queries when Ollama comes back'''
           while self.query_queue:
               item = self.query_queue.pop(0)
               self.retrieve(item['query'])


5. PERFORMANCE MONITORING & TUNING
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   NEEDED FEATURES:

   a) Latency Dashboard
      ├─ Track retrieval time per step
      ├─ Identify bottlenecks
      ├─ Show breakdown pie chart
      ├─ Suggestions for optimization
      └─ Compare across models
   
   b) Quality vs Performance Trade-off
      ├─ Show quality vs response time
      ├─ Allow user to adjust balance
      ├─ Pre-calculate trade-offs
      ├─ Save preferences per query type
      └─ Auto-select based on use case
   
   c) Resource Usage Tracking
      ├─ GPU/CPU/Memory graphs
      ├─ Model load times
      ├─ Cache hit rates
      ├─ Index update times
      └─ Per-model statistics
   
   IMPLEMENTATION EXAMPLE:
   
   class PerformanceMonitor:
       def __init__(self):
           self.metrics = {
               'retrieval_time': [],
               'embedding_time': [],
               'llm_time': [],
               'total_time': [],
           }
       
       def record_latency(self, stage, duration_ms):
           '''Record stage latency'''
           self.metrics[f'{stage}_time'].append(duration_ms)
       
       def get_bottleneck(self):
           '''Identify slowest stage'''
           avg_times = {
               stage: sum(times)/len(times) if times else 0
               for stage, times in self.metrics.items()
           }
           return max(avg_times, key=avg_times.get)
       
       def get_performance_report(self):
           '''Generate performance report'''
           total = sum(avg_times.values())
           percentages = {
               stage: (time/total)*100 if total > 0 else 0
               for stage, time in avg_times.items()
           }
           return percentages


6. LOCAL MODEL BENCHMARKING
   ━━━━━━━━━━━━━━━━━━━━━━━

   NEEDED FEATURES:

   a) Benchmark Suite
      ├─ Test retrieval quality
      ├─ Measure response time
      ├─ Evaluate answer correctness
      ├─ Compare multiple models
      └─ Generate comparison report
   
   b) Model Comparison
      ├─ Speed vs quality matrix
      ├─ Memory usage comparison
      ├─ Accuracy on test queries
      ├─ Recommend best model
      └─ Show pros/cons
   
   c) Continuous Testing
      ├─ Run tests on schedule
      ├─ Alert on performance degradation
      ├─ Track model performance over time
      ├─ Identify regressions
      └─ Suggest retraining/updates
   
   IMPLEMENTATION EXAMPLE:
   
   class LocalLLMBenchmark:
       def __init__(self):
           self.test_queries = [
               ("explain", "Explain this function"),
               ("fix_bug", "How do I fix this bug?"),
               ("refactor", "Refactor this code"),
               ("test", "Write tests for this"),
           ]
       
       def benchmark_model(self, model_name):
           '''Run full benchmark suite'''
           results = {
               'model': model_name,
               'quality_score': 0,
               'speed_ms': 0,
               'memory_mb': 0,
           }
           
           for query_type, query in self.test_queries:
               start = time.time()
               response = self.generate(model_name, query)
               elapsed = (time.time() - start) * 1000
               
               quality = self.evaluate_response(response, query_type)
               results['quality_score'] += quality / len(self.test_queries)
               results['speed_ms'] += elapsed / len(self.test_queries)
           
           return results
       
       def compare_models(self, model_names):
           '''Compare multiple models'''
           results = [self.benchmark_model(m) for m in model_names]
           return sorted(results, key=lambda x: x['quality_score'], reverse=True)


7. ADVANCED CONTEXT ENGINEERING FOR LOCAL LLMS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   NEEDED FEATURES:

   a) Model-Specific Context Adjustment
      ├─ Different scopes for different models
      ├─ Larger context for 13B+ models
      ├─ Smaller context for 7B models
      ├─ Auto-detect and adjust
      └─ Allow manual override
   
   b) Prompt Engineering for Local Models
      ├─ Different system prompts per model
      ├─ Few-shot examples for instruction models
      ├─ Format context appropriately
      ├─ Handle model-specific quirks
      └─ Store prompt templates
   
   c) Specialized Contexts by Task
      ├─ Bug fixing: More error logs, tests
      ├─ Feature implementation: More architecture
      ├─ Refactoring: More call graphs
      ├─ Testing: More existing tests
      └─ Documentation: More docstrings
   
   IMPLEMENTATION EXAMPLE:
   
   class LocalLLMContextEngine:
       def __init__(self, model_name):
           self.model_name = model_name
           self.context_window = self._get_context_window()
           self.model_type = self._detect_model_type()
       
       def _detect_model_type(self):
           '''Detect if model is instruction-tuned, chat, etc.'''
           if 'chat' in self.model_name:
               return 'chat'
           elif 'instruct' in self.model_name:
               return 'instruct'
           elif 'coder' in self.model_name or 'code' in self.model_name:
               return 'coder'
           else:
               return 'base'
       
       def get_system_prompt(self, task_type):
           '''Get model-specific system prompt'''
           prompts = {
               'bug_fix': {
                   'coder': '''You are an expert code debugger. Analyze the error and provide fixes.''',
                   'instruct': '''Fix the bug in the provided code.''',
               },
               'feature_impl': {
                   'coder': '''You are an expert software engineer. Implement the requested feature.''',
                   'instruct': '''Implement the requested feature.''',
               },
           }
           return prompts.get(task_type, {}).get(self.model_type, "You are an expert programmer.")
       
       def adjust_context_for_model(self, context_items, task_type):
           '''Adjust context based on model and task'''
           if self.model_type == 'coder':
               # Show full code context
               return context_items
           elif self.model_type == 'instruct':
               # Focus on clear examples
               return self._prioritize_examples(context_items)
           else:
               # General approach
               return self._prioritize_by_relevance(context_items)


8. STREAMING & REAL-TIME FEEDBACK
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━

   NEEDED FEATURES:

   a) Enhanced Streaming
      ├─ Stream tokens in real-time
      ├─ Show token count as they arrive
      ├─ Indicate quality in real-time
      ├─ Allow cancellation
      └─ Show estimated time remaining
   
   b) Progress Indicators
      ├─ Show retrieval progress
      ├─ Indicate indexing progress
      ├─ Display LLM generation progress
      ├─ Overall progress bar
      └─ ETA calculation
   
   c) Partial Results
      ├─ Show preliminary results while generating
      ├─ Update as more tokens arrive
      ├─ Allow user to stop early
      ├─ Save partial results
      └─ Grade partial responses
   
   IMPLEMENTATION EXAMPLE:
   
   class StreamingResponseManager:
       def __init__(self):
           self.stream_buffer = []
           self.tokens_generated = 0
       
       def stream_response(self, model_name, prompt):
           '''Stream response tokens in real-time'''
           response = requests.post(
               "http://localhost:11434/api/generate",
               json={
                   'model': model_name,
                   'prompt': prompt,
                   'stream': True,
               },
               stream=True
           )
           
           for line in response.iter_lines():
               data = json.loads(line)
               token = data['response']
               self.stream_buffer.append(token)
               self.tokens_generated += 1
               
               # Emit token to UI
               self.emit_token(token, self.tokens_generated)
               
               # Check for cancellation
               if self.should_cancel:
                   break
           
           return ''.join(self.stream_buffer)
       
       def emit_token(self, token, count):
           '''Send token to UI'''
           # WebSocket, callback, or print
           print(token, end='', flush=True)


9. ERROR HANDLING & RECOVERY
   ━━━━━━━━━━━━━━━━━━━━━━━━

   NEEDED FEATURES:

   a) Connection Handling
      ├─ Detect Ollama disconnection
      ├─ Retry with exponential backoff
      ├─ Queue queries if down
      ├─ Notify user of status
      └─ Auto-reconnect
   
   b) Timeout Management
      ├─ Set reasonable timeouts per model
      ├─ Handle timeouts gracefully
      ├─ Suggest solutions (smaller context, simpler query)
      ├─ Cache timeout values
      └─ Learn from history
   
   c) Recovery Strategies
      ├─ If OOM: Reduce context size
      ├─ If timeout: Simplify query
      ├─ If model fails: Try fallback
      ├─ If embedding fails: Use cache
      └─ Log all failures for debugging
   
   IMPLEMENTATION EXAMPLE:
   
   class LocalLLMErrorHandler:
       def __init__(self):
           self.retry_count = 0
           self.max_retries = 3
           self.backoff_factor = 2
       
       def handle_connection_error(self, error):
           '''Handle connection errors'''
           if self.retry_count < self.max_retries:
               wait_time = self.backoff_factor ** self.retry_count
               time.sleep(wait_time)
               self.retry_count += 1
               return True  # Retry
           else:
               self.notify_user("Ollama is not responding")
               return False  # Give up
       
       def handle_timeout(self, elapsed_ms, timeout_ms):
           '''Handle timeout errors'''
           if elapsed_ms > timeout_ms:
               # Reduce context next time
               self.suggested_action = "reduce_context"
               return False
           return True
       
       def handle_oom(self, error):
           '''Handle out of memory errors'''
           self.suggested_action = "use_smaller_model"
           self.suggested_model = "llama2:7b"  # Smaller alternative
           return False


"""

# ============================================================================
# PART 4: RECOMMENDED IMPLEMENTATION PRIORITY
# ============================================================================

IMPLEMENTATION_PRIORITY = """
╔════════════════════════════════════════════════════════════════════════════╗
║         RECOMMENDED PRIORITY FOR LOCAL LLM ENHANCEMENTS                    ║
╚════════════════════════════════════════════════════════════════════════════╝

PRIORITY 1 (CRITICAL - Implement First)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. LOCAL MODEL MANAGEMENT
   └─ Effort: 2-3 hours
   └─ Impact: HIGH (enables model switching)
   
   Code to add:
   - LocalLLMManager class
   - detect_models() method
   - get_model_context_window() method

2. ERROR HANDLING & RECOVERY
   └─ Effort: 3-4 hours
   └─ Impact: HIGH (stability)
   
   Code to add:
   - LocalLLMErrorHandler class
   - Connection retry logic
   - Timeout handling

3. STREAMING & FEEDBACK
   └─ Effort: 2-3 hours
   └─ Impact: MEDIUM (UX improvement)
   
   Code to add:
   - StreamingResponseManager class
   - Real-time token display
   - Progress indicators


PRIORITY 2 (IMPORTANT - Implement Second)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. MEMORY & PERFORMANCE OPTIMIZATION
   └─ Effort: 4-5 hours
   └─ Impact: HIGH (prevents crashes)
   
   Code to add:
   - LocalLLMOptimizer class
   - Memory monitoring
   - Response time estimation

5. CONTEXT TRUNCATION STRATEGIES
   └─ Effort: 3-4 hours
   └─ Impact: MEDIUM (larger context windows)
   
   Code to add:
   - ContextTruncationStrategy class
   - Smart summarization
   - Adaptive levels

6. OFFLINE CAPABILITIES
   └─ Effort: 2-3 hours
   └─ Impact: MEDIUM (robustness)
   
   Code to add:
   - OfflineManager class
   - Query queuing
   - Graceful degradation


PRIORITY 3 (NICE TO HAVE - Implement Third)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

7. PERFORMANCE MONITORING
   └─ Effort: 3-4 hours
   └─ Impact: MEDIUM (observability)
   
   Code to add:
   - PerformanceMonitor class
   - Latency tracking
   - Bottleneck identification

8. MODEL BENCHMARKING
   └─ Effort: 4-5 hours
   └─ Impact: LOW (nice to have)
   
   Code to add:
   - LocalLLMBenchmark class
   - Comparison suite
   - Reporting

9. ADVANCED CONTEXT ENGINEERING
   └─ Effort: 5-6 hours
   └─ Impact: MEDIUM (optimization)
   
   Code to add:
   - LocalLLMContextEngine class
   - Model-specific prompts
   - Task-specific contexts


TOTAL ESTIMATED EFFORT:
- Priority 1: ~7-10 hours
- Priority 2: ~12-15 hours
- Priority 3: ~12-15 hours
- Total: ~31-40 hours for full implementation

QUICK START (Just Priority 1):
- Time: ~7-10 hours
- Provides: Stable local LLM support
- Can be deployed and used immediately
- Other features can be added incrementally
"""

# ============================================================================
# PART 5: CODE ARCHITECTURE FOR LOCAL LLMS
# ============================================================================

LOCAL_LLM_ARCHITECTURE = """
╔════════════════════════════════════════════════════════════════════════════╗
║           RECOMMENDED ARCHITECTURE FOR LOCAL LLM SUPPORT                   ║
╚════════════════════════════════════════════════════════════════════════════╝

FILE STRUCTURE:
forge/
├── context/
│   ├── enhanced_retriever.py (existing)
│   ├── local_llm/               (NEW)
│   │   ├── __init__.py
│   │   ├── manager.py           # LocalLLMManager
│   │   ├── optimizer.py         # LocalLLMOptimizer
│   │   ├── error_handler.py     # LocalLLMErrorHandler
│   │   ├── offline_manager.py   # OfflineManager
│   │   ├── monitor.py           # PerformanceMonitor
│   │   ├── benchmark.py         # LocalLLMBenchmark
│   │   ├── streaming.py         # StreamingResponseManager
│   │   ├── truncation.py        # ContextTruncationStrategy
│   │   └── context_engine.py    # LocalLLMContextEngine
│   └── config_local_llm.py      (NEW)
│
└── agent/
    └── forge_agent.py (update to use LocalLLMManager)


INTEGRATION POINTS:

1. In forge_agent.py:
   ├─ from forge.context.local_llm import LocalLLMManager
   ├─ self.llm_manager = LocalLLMManager()
   └─ Use manager for all model operations

2. In enhanced_retriever.py:
   ├─ from forge.context.local_llm import LocalLLMOptimizer
   ├─ self.optimizer = LocalLLMOptimizer()
   └─ Use for context window adjustment

3. In embedding generation:
   ├─ from forge.context.local_llm import OfflineManager
   ├─ self.offline_manager = OfflineManager()
   └─ Queue embeddings if offline

4. New LLM invocation:
   ├─ from forge.context.local_llm import StreamingResponseManager
   ├─ from forge.context.local_llm import LocalLLMErrorHandler
   ├─ manager = StreamingResponseManager()
   ├─ response = manager.stream_response(model, prompt)
   └─ error_handler catches issues


CLASS HIERARCHY:

    LocalLLMBase (abstract)
         ├─ LocalLLMManager
         ├─ LocalLLMOptimizer
         ├─ LocalLLMErrorHandler
         ├─ OfflineManager
         ├─ PerformanceMonitor
         ├─ LocalLLMBenchmark
         ├─ StreamingResponseManager
         ├─ ContextTruncationStrategy
         └─ LocalLLMContextEngine


CONFIGURATION SCHEMA:

local_llm_config = {
    'enabled': True,
    'provider': 'ollama',
    'base_url': 'http://localhost:11434',
    'embedding_provider': 'sentence-transformers',  # or 'ollama'
    'embedding_model': 'all-MiniLM-L6-v2',  # auto-selected per provider
    'models': {
        'primary': 'qwen2.5-coder:7b',
        'fallback': 'llama2:7b',
        'small': 'neural-chat:7b',
    },
    'performance': {
        'max_timeout_seconds': 30,
        'max_memory_gb': 8,
        'batch_size': 1,
    },
    'context': {
        'enable_truncation': True,
        'summarization_enabled': True,
        'adaptive_levels': True,
    },
    'monitoring': {
        'track_latency': True,
        'track_memory': True,
        'benchmark_on_startup': False,
    },
}
"""

if __name__ == "__main__":
    print(COMPLETE_FLOW)
    print("\n" + "="*80 + "\n")
    print(LOCAL_LLM_ANALYSIS)
    print("\n" + "="*80 + "\n")
    print(EXTRA_FEATURES_NEEDED)
    print("\n" + "="*80 + "\n")
    print(IMPLEMENTATION_PRIORITY)
    print("\n" + "="*80 + "\n")
    print(LOCAL_LLM_ARCHITECTURE)
