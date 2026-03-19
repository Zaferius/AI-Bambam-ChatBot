from fastapi import FastAPI, File, UploadFile, Form, Request
from fastapi.responses import StreamingResponse
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

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenAI Client (sadece API key varsa oluştur)
openai_client = None
if os.getenv("OPENAI_API_KEY"):
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Local LLM Configuration
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
LM_STUDIO_BASE_URL = os.getenv("LM_STUDIO_BASE_URL", "http://localhost:1234/v1")

class LocalLLMManager:
    def __init__(self):
        self.available_models = {}
        # Sadece başlangıçta bir kere yükle
        self.refresh_models()
    
    def refresh_models(self):
        """Mevcut local modelleri güncelle"""
        models = []
        
        # Ollama modelleri
        try:
            response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
            if response.status_code == 200:
                ollama_models = response.json().get('models', [])
                for model in ollama_models:
                    models.append({
                        'id': f"ollama:{model['name']}",
                        'name': model['name'],
                        'provider': 'ollama',
                        'model_name': model['name'],
                        'icon': ''
                    })
        except:
            pass
        
        # LM Studio modelleri
        try:
            response = requests.get(f"{LM_STUDIO_BASE_URL}/models", timeout=2)
            if response.status_code == 200:
                lm_models = response.json().get('data', [])
                for model in lm_models:
                    models.append({
                        'id': f"lmstudio:{model['id']}",
                        'name': model['id'],
                        'provider': 'lmstudio',
                        'model_name': model['id'],
                        'icon': ''
                    })
        except:
            pass
        
        self.available_models = {model['id']: model for model in models}
        return models
    
    def get_provider_and_model(self, model_id: str):
        """Model ID'sinden provider ve gerçek model adını al"""
        if model_id.startswith("ollama:"):
            return "ollama", model_id.replace("ollama:", "")
        elif model_id.startswith("lmstudio:"):
            return "lmstudio", model_id.replace("lmstudio:", "")
        else:
            return "openai", model_id
    
    async def chat_with_ollama(self, model_name: str, messages: List[Dict]):
        """Ollama ile sohbet"""
        payload = {
            "model": model_name,
            "messages": messages,
            "stream": True
        }
        
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            stream=True,
            timeout=300
        )
        
        if response.status_code == 200:
            for line in response.iter_lines():
                if line:
                    try:
                        data = json.loads(line.decode('utf-8'))
                        if 'message' in data and 'content' in data['message']:
                            yield data['message']['content']
                    except:
                        continue
        else:
            yield f"Ollama error: {response.status_code}"
    
    async def chat_with_lmstudio(self, model_name: str, messages: List[Dict]):
        """LM Studio ile sohbet"""
        payload = {
            "model": model_name,
            "messages": messages,
            "stream": True
        }
        
        response = requests.post(
            f"{LM_STUDIO_BASE_URL}/chat/completions",
            json=payload,
            stream=True,
            timeout=300
        )
        
        if response.status_code == 200:
            for line in response.iter_lines():
                if line:
                    try:
                        line_str = line.decode('utf-8')
                        if line_str.startswith('data: '):
                            data_str = line_str[6:]
                            if data_str.strip() == '[DONE]':
                                break
                            data = json.loads(data_str)
                            if 'choices' in data and len(data['choices']) > 0:
                                delta = data['choices'][0].get('delta', {})
                                if 'content' in delta:
                                    yield delta['content']
                    except:
                        continue
        else:
            yield f"LM Studio error: {response.status_code}"
    
    async def chat_with_openai(self, model_name: str, messages: List[Dict]):
        """OpenAI ile sohbet"""
        if not openai_client:
            yield "OpenAI API key not configured. Please set OPENAI_API_KEY environment variable."
            return
        
        stream = openai_client.chat.completions.create(
            model=model_name,
            messages=messages,
            stream=True
        )
        
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

# Local LLM Manager'ı başlat
llm_manager = LocalLLMManager()

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
    
    def add_message(self, chat_id: str, message: str, role: str, persist: bool = True):
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
        
        if persist:
            self.save_memory()
    
    def get_chat_history(self, chat_id: str) -> List[Dict]:
        """Sohbet geçmişini getir"""
        if chat_id not in self.chat_histories:
            self.chat_histories[chat_id] = []
        return self.chat_histories[chat_id]
    
    def get_chat_history_for_llm(self, chat_id: str) -> List[Dict]:
        """LLM'e gönderilecek temiz sohbet geçmişini getir"""
        history = self.get_chat_history(chat_id)
        return [
            {
                "role": message["role"],
                "content": message["content"]
            }
            for message in history
        ]
    
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
    memory_manager.add_message(chat_id, req.message, "user", persist=False)
    
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
                model=model_name,
                messages=messages,
                stream=True
            )
            
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    full_reply += delta
                    yield delta
        
        elif provider == "ollama":
            try:
                response = requests.post(
                    f"{OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": model_name,
                        "messages": messages,
                        "stream": True
                    },
                    stream=True,
                    timeout=300
                )
                
                if response.status_code == 200:
                    for line in response.iter_lines():
                        if line:
                            try:
                                data = json.loads(line.decode('utf-8'))
                                if 'message' in data and 'content' in data['message']:
                                    chunk = data['message']['content']
                                    if chunk:
                                        full_reply += chunk
                                        yield chunk
                            except:
                                continue
                else:
                    yield f"Ollama error: {response.status_code}"
            except Exception as e:
                yield f"Ollama connection error: {str(e)}"
        
        elif provider == "lmstudio":
            try:
                response = requests.post(
                    f"{LM_STUDIO_BASE_URL}/chat/completions",
                    json={
                        "model": model_name,
                        "messages": messages,
                        "stream": True
                    },
                    stream=True,
                    timeout=300
                )
                
                if response.status_code == 200:
                    for line in response.iter_lines():
                        if line:
                            try:
                                line_str = line.decode('utf-8')
                                if line_str.startswith('data: '):
                                    data_str = line_str[6:]
                                    if data_str.strip() == '[DONE]':
                                        break
                                    data = json.loads(data_str)
                                    if 'choices' in data and len(data['choices']) > 0:
                                        delta = data['choices'][0].get('delta', {})
                                        if 'content' in delta:
                                            chunk = delta['content']
                                            if chunk:
                                                full_reply += chunk
                                                yield chunk
                            except:
                                continue
                else:
                    yield f"LM Studio error: {response.status_code}"
            except Exception as e:
                yield f"LM Studio connection error: {str(e)}"
        
        memory_manager.add_message(chat_id, full_reply, "assistant")
    
    return StreamingResponse(generate(), media_type="text/plain")


@app.post("/chat/stream")
async def chat_stream(
    request: Request,
    message: str = Form(None),
    model: str = Form(None),
    chat_id: str = Form(None),
    thinking_level: str = Form(None),
    files: List[UploadFile] = File(None)
):
    # Check if request is JSON
    content_type = request.headers.get("content-type", "")
    
    if "application/json" in content_type:
        # Handle JSON request
        body = await request.json()
        message = body.get("message")
        model = body.get("model", "gpt-4o-mini")
        chat_id = body.get("chat_id", "default")
        thinking_level = body.get("thinking_level", "medium")
        file_contents = []
    else:
        # Handle Form data request
        file_contents = []
        if files:
            for file in files:
                content = await file.read()
                file_info = {
                    "filename": file.filename,
                    "content_type": file.content_type,
                    "data": content
                }
                file_contents.append(file_info)
        
        # Set defaults for Form data
        if not model:
            model = "gpt-4o-mini"
        if not chat_id:
            chat_id = "default"
        if not thinking_level:
            thinking_level = "medium"
    
    memory_manager.add_message(chat_id, message, "user", persist=False)
    
    # İlgili hafıza bilgisini al
    relevant_memory = memory_manager.get_relevant_memory(chat_id, message)
    
    # Mesajları hazırla
    messages = [SYSTEM_MESSAGE]
    
    # Önemli hafıza bilgisini ekle
    if relevant_memory:
        messages.append({
            "role": "system",
            "content": relevant_memory
        })
    
    # Sohbet geçmişini ekle
    chat_history = memory_manager.get_chat_history_for_llm(chat_id)
    messages.extend(chat_history[:-1])  # Son mesajı çıkar, dosyalarla birlikte ekleyeceğiz
    
    # Kullanıcı mesajını dosyalarla birlikte hazırla
    user_message_content = []
    
    # Metin mesajı ekle
    if message:
        user_message_content.append({
            "type": "text",
            "text": message
        })
    
    # Dosyaları ekle (görsel dosyalar için vision API kullan)
    for file_info in file_contents:
        if file_info["content_type"].startswith("image/"):
            # Görseli base64'e çevir
            base64_image = base64.b64encode(file_info["data"]).decode('utf-8')
            user_message_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{file_info['content_type']};base64,{base64_image}"
                }
            })
        else:
            # Metin dosyaları için içeriği oku
            try:
                text_content = file_info["data"].decode('utf-8')
                user_message_content.append({
                    "type": "text",
                    "text": f"\n\n[File: {file_info['filename']}]\n{text_content}"
                })
            except:
                user_message_content.append({
                    "type": "text",
                    "text": f"\n\n[File: {file_info['filename']} - Binary file, cannot display content]"
                })
    
    # Kullanıcı mesajını ekle
    if len(user_message_content) == 1 and user_message_content[0]["type"] == "text":
        # Sadece metin varsa basit format kullan
        messages.append({
            "role": "user",
            "content": user_message_content[0]["text"]
        })
    else:
        # Dosya varsa veya çoklu içerik varsa array format kullan
        messages.append({
            "role": "user",
            "content": user_message_content
        })

    # Provider ve model belirle
    provider, model_name = llm_manager.get_provider_and_model(model)

    def generate():
        full_reply = ""

        if provider == "openai":
            if not openai_client:
                yield "OpenAI API key not configured. Please set OPENAI_API_KEY environment variable."
                return
            
            stream = openai_client.chat.completions.create(
                model=model_name,
                messages=messages,
                stream=True
            )

            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    full_reply += delta
                    yield delta

        elif provider == "ollama":
            try:
                response = requests.post(
                    f"{OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": model_name,
                        "messages": messages,
                        "stream": True
                    },
                    stream=True,
                    timeout=300
                )
                
                if response.status_code == 200:
                    for line in response.iter_lines():
                        if line:
                            try:
                                data = json.loads(line.decode('utf-8'))
                                if 'message' in data and 'content' in data['message']:
                                    chunk = data['message']['content']
                                    if chunk:
                                        full_reply += chunk
                                        yield chunk
                            except:
                                continue
                else:
                    yield f"Ollama error: {response.status_code}"
            except Exception as e:
                yield f"Ollama connection error: {str(e)}"

        elif provider == "lmstudio":
            try:
                response = requests.post(
                    f"{LM_STUDIO_BASE_URL}/chat/completions",
                    json={
                        "model": model_name,
                        "messages": messages,
                        "stream": True
                    },
                    stream=True,
                    timeout=300
                )
                
                if response.status_code == 200:
                    for line in response.iter_lines():
                        if line:
                            try:
                                line_str = line.decode('utf-8')
                                if line_str.startswith('data: '):
                                    data_str = line_str[6:]
                                    if data_str.strip() == '[DONE]':
                                        break
                                    data = json.loads(data_str)
                                    if 'choices' in data and len(data['choices']) > 0:
                                        delta = data['choices'][0].get('delta', {})
                                        if 'content' in delta:
                                            chunk = delta['content']
                                            if chunk:
                                                full_reply += chunk
                                                yield chunk
                            except:
                                continue
                else:
                    yield f"LM Studio error: {response.status_code}"
            except Exception as e:
                yield f"LM Studio connection error: {str(e)}"

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


@app.get("/models")
def get_available_models():
    """Mevcut tüm modelleri getir"""
    # Refresh kaldırıldı, sadece mevcut modelleri göster
    
    models = [
        {"id": "openai-group", "name": "OpenAI", "provider": "openai", "icon": "🌐", "is_group": True},
        {"id": "gpt-4o-mini", "name": "gpt-4o-mini", "provider": "openai", "parent": "openai-group", "icon": "🌐"},
        {"id": "gpt-4o", "name": "gpt-4o", "provider": "openai", "parent": "openai-group", "icon": "🌐"},
        {"id": "gpt-3.5-turbo", "name": "gpt-3.5-turbo", "provider": "openai", "parent": "openai-group", "icon": "🌐"},
        {"id": "gpt-4", "name": "gpt-4", "provider": "openai", "parent": "openai-group", "icon": "🌐"},
    ]
    
    # Local modelleri ekle
    local_models = list(llm_manager.available_models.values())
    
    # Ollama varsa grupla
    ollama_models = [m for m in local_models if m['provider'] == 'ollama']
    if ollama_models:
        models.append({"id": "ollama-group", "name": "Ollama", "provider": "ollama", "icon": "🦙", "is_group": True})
        for model in ollama_models:
            model['parent'] = 'ollama-group'
            models.append(model)

    # LM Studio varsa grupla
    lmstudio_models = [m for m in local_models if m['provider'] == 'lmstudio']
    if lmstudio_models:
        models.append({"id": "lmstudio-group", "name": "LM Studio", "provider": "lmstudio", "icon": "🖥️", "is_group": True})
        for model in lmstudio_models:
            model['parent'] = 'lmstudio-group'
            models.append(model)
    
    return {"models": models}


@app.post("/models/refresh")
def refresh_models():
    """Local modelleri yenile"""
    models = llm_manager.refresh_models()
    return {"models": models, "message": "Models refreshed successfully."}


@app.get("/providers/ollama/status")
def get_ollama_status():
    """Ollama durumunu kontrol et"""
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=2)
        if response.status_code == 200:
            models = response.json().get('models', [])
            return {
                "available": True,
                "models_count": len(models),
                "url": OLLAMA_BASE_URL
            }
    except:
        pass
    return {"available": False, "models_count": 0}


@app.post("/providers/ollama/connect")
def connect_ollama():
    """Ollama'ya bağlan ve modelleri yükle"""
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get('models', [])
            llm_manager.refresh_models()
            return {
                "success": True,
                "models_count": len(models),
                "message": "Connected to Ollama successfully"
            }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to connect: {str(e)}"
        }


@app.get("/providers/lmstudio/status")
def get_lmstudio_status():
    """LM Studio durumunu kontrol et"""
    try:
        # LM Studio uses OpenAI-compatible API
        response = requests.get(f"{LM_STUDIO_BASE_URL}/models", timeout=2)
        if response.status_code == 200:
            data = response.json()
            models = data.get('data', [])
            return {
                "available": True,
                "models_count": len(models),
                "url": LM_STUDIO_BASE_URL
            }
    except Exception as e:
        print(f"LM Studio status check error: {e}")
        pass
    return {"available": False, "models_count": 0}


@app.post("/providers/lmstudio/connect")
def connect_lmstudio():
    """LM Studio'ya bağlan ve modelleri yükle"""
    try:
        print(f"Attempting to connect to LM Studio at {LM_STUDIO_BASE_URL}/models")
        response = requests.get(f"{LM_STUDIO_BASE_URL}/models", timeout=5)
        print(f"LM Studio response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"LM Studio response data: {data}")
            models = data.get('data', [])
            print(f"LM Studio models found: {len(models)}")
            llm_manager.refresh_models()
            return {
                "success": True,
                "models_count": len(models),
                "message": "Connected to LM Studio successfully"
            }
        else:
            print(f"LM Studio returned non-200 status: {response.status_code}")
            return {
                "success": False,
                "message": f"LM Studio returned status {response.status_code}"
            }
    except Exception as e:
        print(f"LM Studio connect error: {e}")
        return {
            "success": False,
            "message": f"Failed to connect: {str(e)}"
        }