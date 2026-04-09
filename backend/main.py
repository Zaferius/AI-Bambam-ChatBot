from fastapi import FastAPI, File, UploadFile, Form, Request, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import re
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import asyncio
import base64
import io
# google.generativeai is optional (incompatible with Python 3.14+)
try:
    import google.generativeai as genai
    _genai_available = True
except Exception:
    genai = None
    _genai_available = False

from database import DatabaseManager
from auth import (
    router as auth_router,
    init_auth,
    get_current_user,
    get_optional_user,
    decode_token,
)
# Teams & projects are disabled in MagAI MVP (kept for future reactivation)
# from team_endpoints import router as team_router, init_teams
# from project_files import router as project_router, init_projects
from ai_router import router as ai_router, init_ai_router
from credits_router import router as credits_router, init_credits_router
from collections import defaultdict
import time

load_dotenv()

app = FastAPI(title="MagAI Platform API", version="2.0.0")

# Database Managerâ€™Ä± baÅŸlat
db = DatabaseManager()

# Auth modÃ¼lÃ¼nÃ¼ baÅŸlat
init_auth(db)
app.include_router(auth_router)

# Teams disabled for MVP
# init_teams(db)
# app.include_router(team_router)
# init_projects(db)
# app.include_router(project_router)


# CORS
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

if "*" in ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in ALLOWED_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Simple Rate Limiting
rate_limit_store: Dict[str, List[float]] = defaultdict(list)
RATE_LIMIT_CHAT = 30  # max requests per minute for chat
RATE_LIMIT_AUTH = 10  # max requests per minute for auth


def check_rate_limit(client_ip: str, limit: int = RATE_LIMIT_CHAT) -> bool:
    """Rate limit kontrolÃ¼ - True = izin ver, False = engelle"""
    now = time.time()
    # 1 dakikadan eski istekleri temizle
    rate_limit_store[client_ip] = [
        t for t in rate_limit_store[client_ip] if now - t < 60
    ]
    if len(rate_limit_store[client_ip]) >= limit:
        return False
    rate_limit_store[client_ip].append(now)
    return True


# OpenAI Client (sadece API key varsa oluÅŸtur)
openai_client = None
if os.getenv("OPENAI_API_KEY"):
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Groq Client (OpenAI-compatible)
groq_client = None
if os.getenv("GROQ_API_KEY"):
    groq_client = OpenAI(
        api_key=os.getenv("GROQ_API_KEY"), base_url="https://api.groq.com/openai/v1"
    )

# Gemini Client
gemini_client = None
if os.getenv("GEMINI_API_KEY") and _genai_available:
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    gemini_client = True  # Flag to indicate Gemini is configured

# OpenRouter Client (OpenAI-compatible, access to 200+ models)
openrouter_client = None
if os.getenv("OPENROUTER_API_KEY"):
    openrouter_client = OpenAI(
        api_key=os.getenv("OPENROUTER_API_KEY"), base_url="https://openrouter.ai/api/v1"
    )


class CloudModelManager:
    def __init__(self):
        self.available_models = {}
        self.refresh_models()

    def refresh_models(self):
        """Cloud modelleri yÃ¼kle - hÄ±zlÄ±, network isteÄŸi yok"""
        models = []

        # Bambam Branded Models
        bambam_models = [
            {
                "id": "bambam:lite",
                "name": "Bambam 1.2 Lite",
                "description": "GÃ¼nlÃ¼k gÃ¶revler iÃ§in hafif bir ajan.",
                "provider": "bambam",
                "model_name": "groq:llama-3.1-8b-instant",
                "icon": "",
                "badge": "",
                "is_bambam": True,
            },
            {
                "id": "bambam:standard",
                "name": "Bambam 1.2",
                "description": "Ã‡oÄŸu gÃ¶revi yapabilen Ã§ok yÃ¶nlÃ¼ bir ajan.",
                "provider": "bambam",
                "model_name": "gpt-4o-mini",
                "icon": "",
                "badge": "",
                "is_bambam": True,
            },
            {
                "id": "bambam:max",
                "name": "Bambam 1.2 Max",
                "description": "KarmaÅŸÄ±k gÃ¶revler iÃ§in tasarlanmÄ±ÅŸ yÃ¼ksek performanslÄ± bir ajan.",
                "provider": "bambam",
                "model_name": "openrouter:anthropic/claude-3.5-sonnet",
                "icon": "",
                "badge": "Max",
                "is_bambam": True,
            },
        ]
        models.extend(bambam_models)

        # Groq modelleri
        groq_models = [
            {"id": "llama-3.1-70b-versatile", "name": "Llama 3.1 70B"},
            {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B"},
            {"id": "mixtral-8x7b-32768", "name": "Mixtral 8x7B"},
            {"id": "gemma2-9b-it", "name": "Gemma 2 9B"},
        ]
        for model in groq_models:
            models.append(
                {
                    "id": f"groq:{model['id']}",
                    "name": model["name"],
                    "provider": "groq",
                    "model_name": model["id"],
                    "icon": "",
                }
            )

        # Gemini modelleri
        gemini_models = [
            {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro"},
            {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash"},
            {"id": "gemini-1.0-pro", "name": "Gemini 1.0 Pro"},
        ]
        for model in gemini_models:
            models.append(
                {
                    "id": f"gemini:{model['id']}",
                    "name": model["name"],
                    "provider": "gemini",
                    "model_name": model["id"],
                    "icon": "",
                }
            )

        # OpenRouter modelleri
        openrouter_models = [
            {"id": "anthropic/claude-3.5-sonnet", "name": "Claude 3.5 Sonnet"},
            {"id": "anthropic/claude-3-opus", "name": "Claude 3 Opus"},
            {"id": "openai/gpt-4-turbo", "name": "GPT-4 Turbo"},
            {"id": "openai/gpt-4o", "name": "GPT-4o"},
            {"id": "google/gemini-pro-1.5", "name": "Gemini Pro 1.5"},
            {"id": "meta-llama/llama-3.1-405b-instruct", "name": "Llama 3.1 405B"},
            {"id": "mistralai/mistral-large", "name": "Mistral Large"},
            {"id": "deepseek/deepseek-chat", "name": "DeepSeek Chat"},
            {"id": "qwen/qwen-2.5-72b-instruct", "name": "Qwen 2.5 72B"},
        ]
        for model in openrouter_models:
            models.append(
                {
                    "id": f"openrouter:{model['id']}",
                    "name": model["name"],
                    "provider": "openrouter",
                    "model_name": model["id"],
                    "icon": "",
                }
            )

        self.available_models = {model["id"]: model for model in models}
        return models

    def get_provider_and_model(self, model_id: str):
        """Model ID'sinden provider ve gerÃ§ek model adÄ±nÄ± al"""
        return "openai", "gpt-4o"

        # Bambam branded modelleri underlying modele map et
        if model_id.startswith("bambam:"):
            if model_id in self.available_models:
                underlying_model = self.available_models[model_id]["model_name"]
                return self.get_provider_and_model(underlying_model)
            return "openai", "gpt-4o-mini"  # Fallback

        if model_id.startswith("groq:"):
            return "groq", model_id.replace("groq:", "")
        elif model_id.startswith("gemini:"):
            return "gemini", model_id.replace("gemini:", "")
        elif model_id.startswith("openrouter:"):
            return "openrouter", model_id.replace("openrouter:", "")
        else:
            return "openai", model_id

    async def chat_with_openai(self, model_name: str, messages: List[Dict]):
        """OpenAI ile sohbet"""
        if not openai_client:
            yield "OpenAI API key not configured. Please set OPENAI_API_KEY environment variable."
            return

        stream = openai_client.chat.completions.create(
            model=model_name, messages=messages, stream=True
        )

        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


# Cloud Model Manager'Ä± baÅŸlat
llm_manager = CloudModelManager()

# Credits Router'Ä± baÅŸlat (MemoryManager'dan Ã¶nce, baÄŸÄ±msÄ±z)
init_credits_router(db)
app.include_router(credits_router)

class ChatRequest(BaseModel):
    message: str
    model: str = "gpt-4o-mini"
    chat_id: Optional[str] = None
    thinking_level: Optional[str] = "medium"


class MemoryManager:
    def __init__(self):
        self.chat_histories: Dict[str, List[Dict]] = {}
        self.long_term_memory: Dict[str, Dict] = {}
        self.max_short_term = 20
        self.memory_file = "memory.json"
        self.load_memory()

    def load_memory(self):
        try:
            with open(self.memory_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.chat_histories = data.get("chat_histories", {})
                self.long_term_memory = data.get("long_term_memory", {})
        except FileNotFoundError:
            self.chat_histories = {}
            self.long_term_memory = {}

    def save_memory(self):
        try:
            with open(self.memory_file, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "chat_histories": self.chat_histories,
                        "long_term_memory": self.long_term_memory,
                    },
                    f,
                    ensure_ascii=False,
                    indent=2,
                )
        except Exception as e:
            print(f"Memory save error: {e}")

    def extract_important_info(self, message: str, role: str) -> List[str]:
        """Mesajlardan Ã¶nemli bilgileri Ã§Ä±kar"""
        important_patterns = [
            r"(?:benim adÄ±m|ismim|call me)\s+([A-Za-zÃ‡ÄÄ°Ã–ÅÃœÃ§ÄŸÄ±Ã¶ÅŸÃ¼]+)",
            r"(?:Ã§alÄ±ÅŸÄ±yorum|occupation|job)\s+(?:olarak|as)\s+([^\s.,!?]+)",
            r"(?:proje|project)\s+([^\s.,!?]+)",
            r"(?:hobby|hobilerim|interests?)\s+(?:olarak|are)\s+([^\s.,!?]+)",
            r"(?:yaÅŸÄ±m|age)\s+(\d+)",
            r"(?:ÅŸehir|city|living)\s+(?:inde|in)\s+([^\s.,!?]+)",
            r"(?:email|mail)\s+([^\s@]+@[^\s@]+\.[^\s]+)",
            r"(?:telefon|phone)\s+(\d+)",
        ]

        important_info = []
        for pattern in important_patterns:
            matches = re.findall(pattern, message, re.IGNORECASE)
            for match in matches:
                if isinstance(match, tuple):
                    match = match[0] if match[0] else match[1]
                important_info.append(match.strip())

        return important_info

    def update_long_term_memory(self, chat_id: str, message: str, role: str):
        """Uzun sÃ¼reli hafÄ±zayÄ± gÃ¼ncelle"""
        important_info = self.extract_important_info(message, role)

        if chat_id not in self.long_term_memory:
            self.long_term_memory[chat_id] = {
                "user_info": {},
                "preferences": {},
                "important_topics": [],
                "last_updated": datetime.now().isoformat(),
            }

        memory = self.long_term_memory[chat_id]

        # Ã–nemli bilgileri kaydet
        for info in important_info:
            if info.lower() not in [x.lower() for x in memory["important_topics"]]:
                memory["important_topics"].append(info)

        memory["last_updated"] = datetime.now().isoformat()

    def get_relevant_memory(self, chat_id: str, current_message: str) -> str:
        """Mevcut mesajla ilgili hafÄ±za bilgisini getir"""
        if chat_id not in self.long_term_memory:
            return ""

        memory = self.long_term_memory[chat_id]
        relevant_info = []

        # Mesajdaki kelimelerle eÅŸleÅŸen Ã¶nemli bilgileri bul
        message_words = current_message.lower().split()

        for topic in memory["important_topics"]:
            topic_lower = topic.lower()
            if any(word in topic_lower for word in message_words):
                relevant_info.append(topic)

        if relevant_info:
            return f"Ã–nemli bilgiler: {', '.join(relevant_info)}"

        return ""

    def add_message(self, chat_id: str, message: str, role: str, persist: bool = True):
        """Yeni mesaj ekle"""
        if chat_id not in self.chat_histories:
            self.chat_histories[chat_id] = []

        # MesajÄ± ekle
        self.chat_histories[chat_id].append(
            {"role": role, "content": message, "timestamp": datetime.now().isoformat()}
        )

        # KÄ±sa sÃ¼reli hafÄ±zayÄ± sÄ±nÄ±rla
        if len(self.chat_histories[chat_id]) > self.max_short_term:
            self.chat_histories[chat_id] = self.chat_histories[chat_id][
                -self.max_short_term :
            ]

        # Uzun sÃ¼reli hafÄ±zayÄ± gÃ¼ncelle
        self.update_long_term_memory(chat_id, message, role)

        if persist:
            self.save_memory()

    def get_chat_history(self, chat_id: str) -> List[Dict]:
        """Sohbet geÃ§miÅŸini getir"""
        if chat_id not in self.chat_histories:
            self.chat_histories[chat_id] = []
        return self.chat_histories[chat_id]

    def get_chat_history_for_llm(self, chat_id: str) -> List[Dict]:
        """LLM'e gÃ¶nderilecek temiz sohbet geÃ§miÅŸini getir"""
        history = self.get_chat_history(chat_id)
        return [
            {"role": message["role"], "content": message["content"]}
            for message in history
        ]

    def reset_chat(self, chat_id: str):
        """Belirli bir sohbeti sÄ±fÄ±rla"""
        if chat_id in self.chat_histories:
            self.chat_histories[chat_id] = []
        self.save_memory()


# Memory Manager'Ä± baÅŸlat
memory_manager = MemoryManager()

# AI Router'Ä± baÅŸlat (memory_manager artÄ±k hazÄ±r)
init_ai_router(
    db=db,
    memory_manager=memory_manager,
    openai_client=openai_client,
    groq_client=groq_client,
    openrouter_client=openrouter_client,
    gemini_client=gemini_client,
)
app.include_router(ai_router)

# AI router'a gerÃ§ek auth dependency'Ä± inject et
for route in ai_router.routes:
    if hasattr(route, "endpoint") and route.endpoint.__name__ == "ai_generate":
        from fastapi import Depends
        route.dependencies = [Depends(get_current_user)]

# Credits router'a da get_current_user inject et
# (Artık credits_router.py içinde direkt Depends(get_current_user) kullanılıyor, buradaki inject iptal)

# Chat endpoints'leri setup et
from chat_endpoints import setup_chat_routes

setup_chat_routes(app, db)

SYSTEM_MESSAGE = {
    "role": "system",
    "content": """Sen Ã§ok akÄ±llÄ± bir AI asistanÄ±sÄ±n. KullanÄ±cÄ±yla Ã¶nceki konuÅŸmalarÄ±nÄ± hatÄ±rlÄ±yorsun ve Ã¶nemli bilgileri saklÄ±yorsun. 
    KullanÄ±cÄ±nÄ±n tercihlerini, ismini, projelerini ve diÄŸer Ã¶nemli detaylarÄ± hatÄ±rla ve bunlarÄ± konuÅŸmalarÄ±nda kullan.
    Samimi, dostane ve yardÄ±msever ol. CevaplarÄ±nÄ± net ve pratik tut.""",
}


@app.post("/chat")
async def chat(req: ChatRequest):
    chat_id = req.chat_id if req.chat_id else "default"
    memory_manager.add_message(chat_id, req.message, "user", persist=False)

    # Ä°lgili hafÄ±za bilgisini al
    relevant_memory = memory_manager.get_relevant_memory(chat_id, req.message)

    # MesajlarÄ± hazÄ±rla
    messages = [SYSTEM_MESSAGE]

    # Ã–nemli hafÄ±za bilgisini ekle
    if relevant_memory:
        messages.append({"role": "system", "content": relevant_memory})

    # Sohbet geÃ§miÅŸini ekle
    chat_history = memory_manager.get_chat_history_for_llm(chat_id)
    messages.extend(chat_history)

    # Provider ve model belirle
    provider, model_name = llm_manager.get_provider_and_model(req.model)

    def generate():
        full_reply = ""

        if provider == "openai":
            if not openai_client:
                yield "OpenAI API key not configured. Please set OPENAI_API_KEY environment variable."
                return

            stream = openai_client.chat.completions.create(
                model=model_name, messages=messages, stream=True
            )

            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    full_reply += delta
                    yield delta

        memory_manager.add_message(chat_id, full_reply, "assistant")

    return StreamingResponse(generate(), media_type="text/plain")


@app.post("/chat/stream")
async def chat_stream(
    request: Request,
    message: str = Form(None),
    model: str = Form(None),
    chat_id: str = Form(None),
    thinking_level: str = Form(None),
    files: List[UploadFile] = File(None),
):
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip, RATE_LIMIT_CHAT):
        return JSONResponse(
            status_code=429,
            content={"detail": "Ã‡ok fazla istek. LÃ¼tfen biraz bekleyin."},
        )

    # Auth - token varsa doÄŸrula, yoksa anonim devam et
    auth_header = request.headers.get("authorization", "")
    user_id = "default"
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        payload = decode_token(token)
        if payload:
            user_id = payload.get("sub", "default")

    # Check if request is JSON
    content_type = request.headers.get("content-type", "")

    if "application/json" in content_type:
        body = await request.json()
        message = body.get("message")
        model = body.get("model", "gpt-4o-mini")
        chat_id = body.get("chat_id", "default")
        thinking_level = body.get("thinking_level", "medium")
        file_contents = []
    else:
        file_contents = []
        if files:
            for file in files:
                content = await file.read()
                file_info = {
                    "filename": file.filename,
                    "content_type": file.content_type,
                    "data": content,
                }
                file_contents.append(file_info)

        if not model:
            model = "gpt-4o-mini"
        if not chat_id:
            chat_id = "default"
        if not thinking_level:
            thinking_level = "medium"

    # KullanÄ±cÄ± mesajÄ±nÄ± memory'ye kaydet
    memory_manager.add_message(chat_id, message, "user", persist=False)

    # Database'e kullanÄ±cÄ± mesajÄ±nÄ± kaydet
    try:
        user_images = (
            [
                base64.b64encode(f["data"]).decode("utf-8")
                for f in file_contents
                if f["content_type"].startswith("image/")
            ]
            if file_contents
            else None
        )
        if not db.get_chat(chat_id):
            title = message[:30] + "..." if message and len(message) > 30 else "Image Task"
            db.create_chat(chat_id, title, user_id)
            
        db.add_message(chat_id, "user", message or "", model_name=model, images=user_images)
    except Exception as e:
        print(f"DB save user message error: {e}")

    # Ä°lgili hafÄ±za bilgisini al
    relevant_memory = memory_manager.get_relevant_memory(chat_id, message)

    # MesajlarÄ± hazÄ±rla
    messages = [SYSTEM_MESSAGE]

    if relevant_memory:
        messages.append({"role": "system", "content": relevant_memory})

    # Sohbet geÃ§miÅŸini ekle
    chat_history = memory_manager.get_chat_history_for_llm(chat_id)
    messages.extend(chat_history[:-1])

    # KullanÄ±cÄ± mesajÄ±nÄ± dosyalarla birlikte hazÄ±rla
    user_message_content = []

    if message:
        user_message_content.append({"type": "text", "text": message})

    for file_info in file_contents:
        if file_info["content_type"].startswith("image/"):
            base64_image = base64.b64encode(file_info["data"]).decode("utf-8")
            user_message_content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{file_info['content_type']};base64,{base64_image}"
                    },
                }
            )
        else:
            try:
                text_content = file_info["data"].decode("utf-8")
                user_message_content.append(
                    {
                        "type": "text",
                        "text": f"\n\n[File: {file_info['filename']}]\n{text_content}",
                    }
                )
            except:
                user_message_content.append(
                    {
                        "type": "text",
                        "text": f"\n\n[File: {file_info['filename']} - Binary file, cannot display content]",
                    }
                )

    if len(user_message_content) == 1 and user_message_content[0]["type"] == "text":
        messages.append({"role": "user", "content": user_message_content[0]["text"]})
    else:
        messages.append({"role": "user", "content": user_message_content})

    # Provider ve model belirle
    provider, model_name = llm_manager.get_provider_and_model(model)

    def generate():
        full_reply = ""

        if provider == "openai":
            if not openai_client:
                yield "OpenAI API key not configured."
                return
            try:
                stream = openai_client.chat.completions.create(
                    model=model_name, messages=messages, stream=True
                )
                for chunk in stream:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        full_reply += delta
                        yield delta
            except Exception as e:
                yield f"OpenAI error: {str(e)}"

        elif provider == "groq":
            if not groq_client:
                yield "Groq API key not configured."
                return
            try:
                stream = groq_client.chat.completions.create(
                    model=model_name, messages=messages, stream=True
                )
                for chunk in stream:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        full_reply += delta
                        yield delta
            except Exception as e:
                yield f"Groq error: {str(e)}"

        elif provider == "gemini":
            if not gemini_client:
                yield "Gemini API key not configured."
                return
            try:
                gemini_messages = []
                for msg in messages:
                    if msg["role"] == "system":
                        continue
                    role = "user" if msg["role"] == "user" else "model"
                    gemini_messages.append({"role": role, "parts": [msg["content"]]})
                gemini_model = genai.GenerativeModel(model_name)
                response = gemini_model.generate_content(
                    gemini_messages[-1]["parts"][0] if gemini_messages else message,
                    stream=True,
                )
                for chunk in response:
                    if chunk.text:
                        full_reply += chunk.text
                        yield chunk.text
            except Exception as e:
                yield f"Gemini error: {str(e)}"

        elif provider == "openrouter":
            if not openrouter_client:
                yield "OpenRouter API key not configured."
                return
            try:
                stream = openrouter_client.chat.completions.create(
                    model=model_name, messages=messages, stream=True
                )
                for chunk in stream:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        full_reply += delta
                        yield delta
            except Exception as e:
                yield f"OpenRouter error: {str(e)}"

        # Bot cevabÄ±nÄ± memory ve database'e kaydet
        memory_manager.add_message(chat_id, full_reply, "assistant")
        try:
            db.add_message(chat_id, "assistant", full_reply, model_name=model)
        except Exception as e:
            print(f"DB save bot message error: {e}")

    return StreamingResponse(generate(), media_type="text/plain")


@app.post("/reset")
async def reset_chat(req: ChatRequest):
    chat_id = req.chat_id if req.chat_id else "default"
    memory_manager.reset_chat(chat_id)
    return {"message": "Chat reset successfully."}


@app.get("/memory/{chat_id}")
async def get_memory(chat_id: str):
    """Belirli bir sohbetin hafÄ±za bilgisini getir"""
    if chat_id not in memory_manager.long_term_memory:
        return {"memory": None}

    return {
        "memory": memory_manager.long_term_memory[chat_id],
        "chat_length": len(memory_manager.get_chat_history(chat_id)),
    }


@app.get("/models")
def get_available_models():
    """Mevcut tÃ¼m modelleri getir - hÄ±zlÄ±, cache'den"""
    models = []

    # Cloud modelleri al (cache'den, hÄ±zlÄ±)
    cloud_models = list(llm_manager.available_models.values())

    # Bambam modelleri Ã¶nce ekle
    bambam_models = [m for m in cloud_models if m.get("is_bambam")]
    for model in bambam_models:
        models.append(model)

    # OpenAI modelleri
    models.append(
        {
            "id": "openai-group",
            "name": "OpenAI",
            "provider": "openai",
            "icon": "",
            "is_group": True,
        }
    )
    models.append(
        {
            "id": "gpt-4o-mini",
            "name": "gpt-4o-mini",
            "provider": "openai",
            "parent": "openai-group",
            "icon": "",
        }
    )
    models.append(
        {
            "id": "gpt-4o",
            "name": "gpt-4o",
            "provider": "openai",
            "parent": "openai-group",
            "icon": "",
        }
    )
    models.append(
        {
            "id": "gpt-3.5-turbo",
            "name": "gpt-3.5-turbo",
            "provider": "openai",
            "parent": "openai-group",
            "icon": "",
        }
    )
    models.append(
        {
            "id": "gpt-4",
            "name": "gpt-4",
            "provider": "openai",
            "parent": "openai-group",
            "icon": "",
        }
    )

    # Groq modelleri (Bambam olmayan)
    groq_models = [
        m for m in cloud_models if m["provider"] == "groq" and not m.get("is_bambam")
    ]
    if groq_models:
        models.append(
            {
                "id": "groq-group",
                "name": "Groq",
                "provider": "groq",
                "icon": "âš¡",
                "is_group": True,
            }
        )
        for model in groq_models:
            model["parent"] = "groq-group"
            models.append(model)

    # Gemini modelleri (Bambam olmayan)
    gemini_models = [
        m for m in cloud_models if m["provider"] == "gemini" and not m.get("is_bambam")
    ]
    if gemini_models:
        models.append(
            {
                "id": "gemini-group",
                "name": "Google Gemini",
                "provider": "gemini",
                "icon": "ğŸ”·",
                "is_group": True,
            }
        )
        for model in gemini_models:
            model["parent"] = "gemini-group"
            models.append(model)

    # OpenRouter modelleri (Bambam olmayan)
    openrouter_models = [
        m
        for m in cloud_models
        if m["provider"] == "openrouter" and not m.get("is_bambam")
    ]
    if openrouter_models:
        models.append(
            {
                "id": "openrouter-group",
                "name": "OpenRouter",
                "provider": "openrouter",
                "icon": "ğŸŒ",
                "is_group": True,
            }
        )
        for model in openrouter_models:
            model["parent"] = "openrouter-group"
            models.append(model)

    return {"models": models}


@app.post("/models/refresh")
def refresh_models():
    """Cloud modelleri yenile"""
    models = llm_manager.refresh_models()
    return {"models": models, "message": "Models refreshed successfully."}


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat(),
    }


# Preview: Proje dosyalarÄ±nÄ± iframe'de serve et (auth gerektirmez, doÄŸrudan eriÅŸim)
from fastapi.staticfiles import StaticFiles
import pathlib


@app.get("/preview/{team_id}/{file_path:path}")
async def serve_preview(team_id: str, file_path: str):
    """Proje dosyasÄ±nÄ± doÄŸrudan serve et (iframe preview iÃ§in)"""
    import mimetypes
    from project_files import get_project_dir, auto_fix_index_html

    project_dir = get_project_dir(team_id)
    # index.html serve edilirken otomatik dÃ¼zelt
    if file_path == "index.html":
        auto_fix_index_html(project_dir)
    fpath = project_dir / file_path
    try:
        fpath.resolve().relative_to(project_dir.resolve())
    except ValueError:
        return JSONResponse({"error": "Forbidden"}, status_code=403)
    if not fpath.exists() or not fpath.is_file():
        return JSONResponse({"error": "Not found"}, status_code=404)

    # DoÄŸru MIME type belirle
    mime_map = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
    }
    ext = fpath.suffix.lower()
    media_type = (
        mime_map.get(ext)
        or mimetypes.guess_type(str(fpath))[0]
        or "application/octet-stream"
    )

    from fastapi.responses import FileResponse as FR

    return FR(fpath, media_type=media_type)


# Frontend statik dosyalarÄ±nÄ± serve et
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import pathlib

FRONTEND_DIR = pathlib.Path(__file__).parent.parent / "frontend"


@app.get("/")
async def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/{filename}.html")
async def serve_html(filename: str):
    filepath = FRONTEND_DIR / f"{filename}.html"
    if filepath.exists():
        return FileResponse(filepath)
    return JSONResponse({"error": "Not found"}, status_code=404)


app.mount("/", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")

