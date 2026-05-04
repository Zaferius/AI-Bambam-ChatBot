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
# Conservative launch calibration:
# 1 credit ~= $0.015 vendor cost target, rounded upward for safety.
FAL_COSTS: dict[str, float] = {
    # Image generation — Flux family
    "fal-ai/flux/schnell":                      1.0,   # ~$0.003 / MP
    "fal-ai/flux/dev":                          3.0,   # ~$0.025 / MP
    "fal-ai/flux-pro":                          12.0,  # deprecated / hide in UI when possible
    "fal-ai/flux-2-pro":                        3.0,   # ~$0.03 first MP + $0.015 extra MP
    "fal-ai/stable-diffusion-v3-medium":        3.0,   # ~$0.035 / image
    "fal-ai/aura-flow":                         4.0,   # unverified compute pricing; keep conservative or hide
    # Image generation — Gemini (nano-banana) family
    "fal-ai/nano-banana":                       3.0,   # ~$0.039 / image
    "fal-ai/nano-banana-2":                     6.0,   # ~$0.08 / image base
    "fal-ai/nano-banana-pro":                  10.0,   # ~$0.15 / image base
    # Image generation — OpenAI
    "openai/gpt-image-2":                      12.0,   # token-based; launch-safe fixed value
    # Image generation — Bytedance Seedream family
    "fal-ai/bytedance/seedream/v4/text-to-image":       2.0,   # ~$0.03 / image
    "fal-ai/bytedance/seedream/v4.5/text-to-image":     3.0,   # ~$0.04 / image
    "fal-ai/bytedance/seedream/v5/lite/text-to-image":  3.0,   # ~$0.035 / image
    "fal-ai/seedvr/upscale/image":                      1.0,   # ~$0.001 / MP
    # Image editing / inpainting (legacy)
    "fal-ai/flux/dev/image-to-image":           3.0,   # ~$0.03 / MP
    "fal-ai/sd-inpainting":                     3.0,   # unverified; keep conservative fixed launch value
    # Edit panel — dedicated edit models
    "fal-ai/nano-banana/edit":                  3.0,   # ~$0.039 / image
    "fal-ai/nano-banana-2/edit":                6.0,   # ~$0.08 / image base
    "fal-ai/nano-banana-pro/edit":             10.0,   # ~$0.15 / image base
    "openai/gpt-image-2/edit":                 14.0,   # token-based; launch-safe fixed value
    "fal-ai/bytedance/seedream/v4/edit":        2.0,   # ~$0.03 / image
    "fal-ai/bytedance/seedream/v4.5/edit":      3.0,   # ~$0.04 / image
    "xai/grok-imagine-image/edit":              2.0,   # ~$0.022 / image
    "fal-ai/bria/background/remove":            2.0,   # ~$0.018 / generation
    # Video generation (text-to-video) — conservative 5s launch defaults
    "fal-ai/kling-video/v1/standard/text-to-video":              15.0,   # ~$0.225 / 5s
    "fal-ai/kling-video/v1/pro/text-to-video":                   35.0,   # proxy from nearest v1.5 pro pricing
    "fal-ai/kling-video/v3/pro/text-to-video":                   40.0,   # audio-off conservative base
    "fal-ai/stable-video":                                         6.0,   # ~$0.075 / video
    "fal-ai/wan/v2.7/text-to-video":                              35.0,   # conservative 720p launch value
    "fal-ai/bytedance/seedance/v1.5/pro/text-to-video":          20.0,   # conservative 5s launch value
    "fal-ai/bytedance/seedance-2.0/text-to-video":              110.0,   # ~$1.517 / 5s at 720p with audio
    "fal-ai/sora-2/text-to-video":                              100.0,   # ~$1.50 / 5s at 720p
    "fal-ai/veo3.1":                                              70.0,   # conservative audio-off 5s base
    "xai/grok-imagine-video/text-to-video":                      25.0,   # ~$0.25-$0.35 / 5s
    # Video generation (image-to-video)
    "fal-ai/kling-video/v1/standard/image-to-video":             15.0,   # ~$0.225 / 5s
    "fal-ai/kling-video/v1/pro/image-to-video":                  35.0,   # proxy from nearest v1.5 pro pricing
    "fal-ai/seedvr/upscale/video":                               15.0,   # conservative fixed launch value
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
