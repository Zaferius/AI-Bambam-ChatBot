# ============================================================
# model_costs.py — Credit cost mapping for all AI operations
# ============================================================
# LLM costs are per 1K tokens (combined input+output average).
# fal.ai costs are flat per-request.
# All costs are denominated in platform credits.

# ── OpenRouter / LLM models ─────────────────────────────────
LLM_COSTS: dict[str, float] = {
    # OpenAI
    "openai/gpt-4o":                     0.20,
    "openai/gpt-4o-mini":                0.03,
    "openai/gpt-4-turbo":                0.20,
    "openai/gpt-3.5-turbo":              0.03,
    # Anthropic
    "anthropic/claude-3.5-sonnet":       0.22,
    "anthropic/claude-3-opus":           0.40,
    "anthropic/claude-3-haiku":          0.05,
    # Google
    "google/gemini-pro-1.5":             0.10,
    "google/gemini-flash-1.5":           0.03,
    # Meta / Llama (via OpenRouter)
    "meta-llama/llama-3.1-405b-instruct": 0.08,
    "meta-llama/llama-3.1-70b-instruct":  0.04,
    "meta-llama/llama-3.1-8b-instruct":   0.02,
    # Mistral
    "mistralai/mistral-large":            0.10,
    "mistralai/mixtral-8x7b-instruct":    0.04,
    # DeepSeek
    "deepseek/deepseek-chat":             0.03,
    "deepseek/deepseek-coder":            0.03,
    # Qwen
    "qwen/qwen-2.5-72b-instruct":         0.04,
    # Groq (direct)
    "groq/llama-3.1-70b-versatile":       0.03,
    "groq/llama-3.1-8b-instant":          0.01,
    "groq/mixtral-8x7b-32768":            0.03,
    "groq/gemma2-9b-it":                  0.01,
    # Fallback
    "default":                            0.05,
}

# ── fal.ai tools ────────────────────────────────────────────
FAL_COSTS: dict[str, float] = {
    # Image generation
    "fal-ai/flux/schnell":                      2.0,
    "fal-ai/flux/dev":                          5.0,
    "fal-ai/flux-pro":                          8.0,
    "fal-ai/stable-diffusion-v3-medium":        3.0,
    "fal-ai/aura-flow":                         4.0,
    # Image editing / inpainting
    "fal-ai/flux/dev/image-to-image":           4.0,
    "fal-ai/sd-inpainting":                     3.0,
    # Face swap
    "fal-ai/face-swap":                         5.0,
    # Video generation
    "fal-ai/kling-video/v1/standard/text-to-video": 12.0,
    "fal-ai/kling-video/v1/pro/text-to-video":      20.0,
    "fal-ai/stable-video":                          10.0,
    # Fallback
    "default":                                   3.0,
}


def get_llm_cost(model_id: str) -> float:
    """Return credit cost per 1K tokens for a given LLM model."""
    return LLM_COSTS.get(model_id, LLM_COSTS["default"])


def get_fal_cost(model_id: str) -> float:
    """Return flat credit cost per fal.ai request."""
    return FAL_COSTS.get(model_id, FAL_COSTS["default"])


def estimate_llm_credits(model_id: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimate credits for an LLM call given token counts."""
    cost_per_1k = get_llm_cost(model_id)
    total_tokens = prompt_tokens + completion_tokens
    return round((total_tokens / 1000) * cost_per_1k, 4)
