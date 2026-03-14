from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

class ChatRequest(BaseModel):
    message: str
    model: str = "gpt-4o-mini"
    chat_id: Optional[str] = None

class MemoryManager:
    def __init__(self):
        self.chat_histories: Dict[str, List[Dict]] = {}
        self.long_term_memory: Dict[str, Dict] = {}
        self.max_short_term = 20
        self.memory_file = "memory.json"
        self.load_memory()
    
    def load_memory(self):
        try:
            with open(self.memory_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.chat_histories = data.get('chat_histories', {})
                self.long_term_memory = data.get('long_term_memory', {})
        except FileNotFoundError:
            self.chat_histories = {}
            self.long_term_memory = {}
    
    def save_memory(self):
        try:
            with open(self.memory_file, 'w', encoding='utf-8') as f:
                json.dump({
                    'chat_histories': self.chat_histories,
                    'long_term_memory': self.long_term_memory
                }, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Memory save error: {e}")
    
    def extract_important_info(self, message: str, role: str) -> List[str]:
        """Mesajlardan önemli bilgileri çıkar"""
        important_patterns = [
            r'(?:benim adım|ismim|call me)\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)',
            r'(?:çalışıyorum|occupation|job)\s+(?:olarak|as)\s+([^\s.,!?]+)',
            r'(?:proje|project)\s+([^\s.,!?]+)',
            r'(?:hobby|hobilerim|interests?)\s+(?:olarak|are)\s+([^\s.,!?]+)',
            r'(?:yaşım|age)\s+(\d+)',
            r'(?:şehir|city|living)\s+(?:inde|in)\s+([^\s.,!?]+)',
            r'(?:email|mail)\s+([^\s@]+@[^\s@]+\.[^\s]+)',
            r'(?:telefon|phone)\s+(\d+)',
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
        """Uzun süreli hafızayı güncelle"""
        important_info = self.extract_important_info(message, role)
        
        if chat_id not in self.long_term_memory:
            self.long_term_memory[chat_id] = {
                'user_info': {},
                'preferences': {},
                'important_topics': [],
                'last_updated': datetime.now().isoformat()
            }
        
        memory = self.long_term_memory[chat_id]
        
        # Önemli bilgileri kaydet
        for info in important_info:
            if info.lower() not in [x.lower() for x in memory['important_topics']]:
                memory['important_topics'].append(info)
        
        memory['last_updated'] = datetime.now().isoformat()
        self.save_memory()
    
    def get_relevant_memory(self, chat_id: str, current_message: str) -> str:
        """Mevcut mesajla ilgili hafıza bilgisini getir"""
        if chat_id not in self.long_term_memory:
            return ""
        
        memory = self.long_term_memory[chat_id]
        relevant_info = []
        
        # Mesajdaki kelimelerle eşleşen önemli bilgileri bul
        message_words = current_message.lower().split()
        
        for topic in memory['important_topics']:
            topic_lower = topic.lower()
            if any(word in topic_lower for word in message_words):
                relevant_info.append(topic)
        
        if relevant_info:
            return f"Önemli bilgiler: {', '.join(relevant_info)}"
        
        return ""
    
    def add_message(self, chat_id: str, message: str, role: str):
        """Yeni mesaj ekle"""
        if chat_id not in self.chat_histories:
            self.chat_histories[chat_id] = []
        
        # Mesajı ekle
        self.chat_histories[chat_id].append({
            'role': role,
            'content': message,
            'timestamp': datetime.now().isoformat()
        })
        
        # Kısa süreli hafızayı sınırla
        if len(self.chat_histories[chat_id]) > self.max_short_term:
            self.chat_histories[chat_id] = self.chat_histories[chat_id][-self.max_short_term:]
        
        # Uzun süreli hafızayı güncelle
        self.update_long_term_memory(chat_id, message, role)
        
        self.save_memory()
    
    def get_chat_history(self, chat_id: str) -> List[Dict]:
        """Sohbet geçmişini getir"""
        if chat_id not in self.chat_histories:
            self.chat_histories[chat_id] = []
        return self.chat_histories[chat_id]
    
    def reset_chat(self, chat_id: str):
        """Belirli bir sohbeti sıfırla"""
        if chat_id in self.chat_histories:
            self.chat_histories[chat_id] = []
        self.save_memory()

# Memory Manager'ı başlat
memory_manager = MemoryManager()

SYSTEM_MESSAGE = {
    "role": "system",
    "content": """Sen çok akıllı bir AI asistanısın. Kullanıcıyla önceki konuşmalarını hatırlıyorsun ve önemli bilgileri saklıyorsun. 
    Kullanıcının tercihlerini, ismini, projelerini ve diğer önemli detayları hatırla ve bunları konuşmalarında kullan.
    Samimi, dostane ve yardımsever ol. Cevaplarını net ve pratik tut."""
}

@app.post("/chat")
async def chat(req: ChatRequest):
    chat_id = req.chat_id if req.chat_id else "default"
    memory_manager.add_message(chat_id, req.message, "user")
    
    # İlgili hafıza bilgisini al
    relevant_memory = memory_manager.get_relevant_memory(chat_id, req.message)
    
    # Mesajları hazırla
    messages = [SYSTEM_MESSAGE]
    
    # Önemli hafıza bilgisini ekle
    if relevant_memory:
        messages.append({
            "role": "system",
            "content": relevant_memory
        })
    
    # Sohbet geçmişini ekle
    chat_history = memory_manager.get_chat_history(chat_id)
    messages.extend(chat_history)

    response = client.chat.completions.create(
        model=req.model,
        messages=messages
    )

    reply = response.choices[0].message.content or ""
    memory_manager.add_message(chat_id, reply, "assistant")

    return {"reply": reply}


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    chat_id = req.chat_id if req.chat_id else "default"
    memory_manager.add_message(chat_id, req.message, "user")
    
    # İlgili hafıza bilgisini al
    relevant_memory = memory_manager.get_relevant_memory(chat_id, req.message)
    
    # Mesajları hazırla
    messages = [SYSTEM_MESSAGE]
    
    # Önemli hafıza bilgisini ekle
    if relevant_memory:
        messages.append({
            "role": "system",
            "content": relevant_memory
        })
    
    # Sohbet geçmişini ekle
    chat_history = memory_manager.get_chat_history(chat_id)
    messages.extend(chat_history)

    def generate():
        full_reply = ""

        stream = client.chat.completions.create(
            model=req.model,
            messages=messages,
            stream=True
        )

        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                full_reply += delta
                yield delta

        memory_manager.add_message(chat_id, full_reply, "assistant")

    return StreamingResponse(generate(), media_type="text/plain")


@app.post("/reset")
async def reset_chat(req: ChatRequest):
    chat_id = req.chat_id if req.chat_id else "default"
    memory_manager.reset_chat(chat_id)
    return {"message": "Chat reset successfully."}


@app.get("/memory/{chat_id}")
async def get_memory(chat_id: str):
    """Belirli bir sohbetin hafıza bilgisini getir"""
    if chat_id not in memory_manager.long_term_memory:
        return {"memory": None}
    
    return {
        "memory": memory_manager.long_term_memory[chat_id],
        "chat_length": len(memory_manager.get_chat_history(chat_id))
    }