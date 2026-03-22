from fastapi import APIRouter, HTTPException, Depends, Request, Form
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional
from auth import get_current_user, decode_token
from openai import OpenAI
import os
import json
import asyncio
import queue
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from project_files import extract_files_from_text, save_extracted_files, get_project_dir

router = APIRouter(prefix="/api/teams", tags=["Teams"])

db = None

def init_teams(database):
    global db
    db = database

def _get_llm_clients():
    """LLM client'ları al (main.py'deki global'ları kullanmak yerine lazy init)"""
    clients = {}
    if os.getenv("OPENAI_API_KEY"):
        clients["openai"] = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    if os.getenv("GROQ_API_KEY"):
        clients["groq"] = OpenAI(api_key=os.getenv("GROQ_API_KEY"), base_url="https://api.groq.com/openai/v1")
    if os.getenv("OPENROUTER_API_KEY"):
        clients["openrouter"] = OpenAI(api_key=os.getenv("OPENROUTER_API_KEY"), base_url="https://openrouter.ai/api/v1")
    return clients


# ===== MODELS =====

class MemberInput(BaseModel):
    role_name: str
    description: Optional[str] = None
    system_prompt: str
    icon: Optional[str] = "🤖"
    model: Optional[str] = "gpt-4o-mini"

class CreateTeamRequest(BaseModel):
    name: str
    description: Optional[str] = None
    members: List[MemberInput]

class UpdateTeamRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class AddMemberRequest(BaseModel):
    role_name: str
    description: Optional[str] = None
    system_prompt: str
    icon: Optional[str] = "🤖"
    model: Optional[str] = "gpt-4o-mini"

class UpdateMemberRequest(BaseModel):
    model: Optional[str] = None


# ===== ENDPOINTS =====

@router.post("")
async def create_team(req: CreateTeamRequest, current_user: dict = Depends(get_current_user)):
    """Yeni takım oluştur + üyelerini ekle"""
    if not req.members or len(req.members) == 0:
        raise HTTPException(status_code=400, detail="En az bir üye gerekli")
    
    team = db.create_team(req.name, current_user["id"], req.description)
    
    members = []
    for m in req.members:
        member = db.add_team_member(
            team_id=team["id"],
            role_name=m.role_name,
            system_prompt=m.system_prompt,
            description=m.description,
            icon=m.icon or "🤖",
            model=m.model or "gpt-4o-mini"
        )
        members.append(member)
    
    team["members"] = members
    return team


@router.get("")
async def list_teams(current_user: dict = Depends(get_current_user)):
    """Kullanıcının takımlarını listele"""
    teams = db.get_teams_by_user(current_user["id"])
    
    for team in teams:
        team["members"] = db.get_team_members(team["id"])
    
    return teams


@router.get("/{team_id}")
async def get_team(team_id: str, current_user: dict = Depends(get_current_user)):
    """Takım detayını getir"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    team["members"] = db.get_team_members(team_id)
    return team


@router.put("/{team_id}")
async def update_team(team_id: str, req: UpdateTeamRequest, current_user: dict = Depends(get_current_user)):
    """Takım bilgilerini güncelle"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    updated = db.update_team(team_id, name=req.name, description=req.description)
    updated["members"] = db.get_team_members(team_id)
    return updated


@router.delete("/{team_id}")
async def delete_team(team_id: str, current_user: dict = Depends(get_current_user)):
    """Takımı sil"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    db.delete_team(team_id)
    return {"message": "Takım silindi"}


@router.post("/{team_id}/members")
async def add_member(team_id: str, req: AddMemberRequest, current_user: dict = Depends(get_current_user)):
    """Takıma yeni üye ekle"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    member = db.add_team_member(
        team_id=team_id,
        role_name=req.role_name,
        system_prompt=req.system_prompt,
        description=req.description,
        icon=req.icon or "🤖",
        model=req.model or "gpt-4o-mini"
    )
    return member


@router.patch("/{team_id}/members/{member_id}")
async def update_member(team_id: str, member_id: str, req: UpdateMemberRequest, current_user: dict = Depends(get_current_user)):
    """Takım üyesinin modelini güncelle"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    member = db.get_team_member(member_id)
    if not member or member["team_id"] != team_id:
        raise HTTPException(status_code=404, detail="Üye bulunamadı")
    
    updated = db.update_team_member(member_id, model=req.model)
    return updated


@router.delete("/{team_id}/members/{member_id}")
async def remove_member(team_id: str, member_id: str, current_user: dict = Depends(get_current_user)):
    """Takım üyesini sil"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    member = db.get_team_member(member_id)
    if not member or member["team_id"] != team_id:
        raise HTTPException(status_code=404, detail="Üye bulunamadı")
    
    db.delete_team_member(member_id)
    return {"message": "Üye silindi"}


@router.get("/{team_id}/members/{member_id}/messages")
async def get_member_messages(team_id: str, member_id: str, current_user: dict = Depends(get_current_user)):
    """Üyenin chat mesajlarını getir"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    member = db.get_team_member(member_id)
    if not member or member["team_id"] != team_id:
        raise HTTPException(status_code=404, detail="Üye bulunamadı")
    
    messages = db.get_messages(member["chat_id"])
    return messages


class TeamChatRequest(BaseModel):
    message: str
    model: Optional[str] = "gpt-4o-mini"


@router.post("/{team_id}/members/{member_id}/chat")
async def team_member_chat(
    team_id: str, 
    member_id: str, 
    req: TeamChatRequest,
    current_user: dict = Depends(get_current_user)
):
    """Takım üyesiyle sohbet et - rolün system prompt'u ile LLM'e gönderir"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    member = db.get_team_member(member_id)
    if not member or member["team_id"] != team_id:
        raise HTTPException(status_code=404, detail="Üye bulunamadı")
    
    chat_id = member["chat_id"]
    
    # Kullanıcı mesajını DB'ye kaydet
    db.add_message(chat_id, "user", req.message, model_name=req.model)
    
    # Mesaj geçmişini al
    history = db.get_messages(chat_id)
    
    # LLM mesajlarını hazırla
    member_system = (
        f"KOD YAZARKEN: Dosya oluşturmak istediğinde kod bloklarını şu formatta yaz:\n"
        f"```dil:dosya_adi.uzanti\n// kod içeriği\n```\n"
        f"Örnek: ```html:index.html veya ```css:style.css veya ```js:script.js\n"
        f"Bu format sayesinde kodların otomatik olarak proje dosyalarına kaydedilecek.\n\n"
        f"{member['system_prompt']}"
    )
    llm_messages = [
        {"role": "system", "content": member_system}
    ]
    
    # Son 20 mesajı ekle
    recent = history[-20:] if len(history) > 20 else history
    for msg in recent:
        llm_messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })
    
    # Model provider belirle (request'ten gelen varsa onu, yoksa üyenin kayıtlı modelini kullan)
    model_id = req.model or member.get("model") or "gpt-4o-mini"
    
    if model_id.startswith("groq:"):
        provider = "groq"
        model_name = model_id.replace("groq:", "")
    elif model_id.startswith("openrouter:"):
        provider = "openrouter"
        model_name = model_id.replace("openrouter:", "")
    elif model_id.startswith("bambam:lite"):
        provider = "groq"
        model_name = "llama-3.1-8b-instant"
    elif model_id.startswith("bambam:max"):
        provider = "openrouter"
        model_name = "anthropic/claude-3.5-sonnet"
    else:
        provider = "openai"
        model_name = model_id if not model_id.startswith("bambam:") else "gpt-4o-mini"
    
    clients = _get_llm_clients()
    client = clients.get(provider)
    
    if not client:
        raise HTTPException(status_code=500, detail=f"{provider} API key yapılandırılmamış")
    
    def generate():
        full_reply = ""
        try:
            stream = client.chat.completions.create(
                model=model_name,
                messages=llm_messages,
                stream=True
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    full_reply += delta
                    yield delta
        except Exception as e:
            yield f"Error: {str(e)}"
        
        # Bot cevabını DB'ye kaydet
        if full_reply:
            try:
                db.add_message(chat_id, "assistant", full_reply, model_name=req.model)
            except Exception as e:
                print(f"DB save team bot message error: {e}")
            # Otomatik dosya çıkarma
            try:
                extracted = extract_files_from_text(full_reply)
                if extracted:
                    saved = save_extracted_files(team_id, extracted)
                    print(f"[AutoExtract] {len(saved)} dosya çıkarıldı: {saved}")
            except Exception as e:
                print(f"AutoExtract error: {e}")
    
    return StreamingResponse(generate(), media_type="text/plain")


class MasterPromptRequest(BaseModel):
    message: str
    model: Optional[str] = None


def _resolve_model(model_id: str):
    """Model ID'den provider ve model adı çıkar"""
    if model_id.startswith("groq:"):
        return "groq", model_id.replace("groq:", "")
    elif model_id.startswith("openrouter:"):
        return "openrouter", model_id.replace("openrouter:", "")
    elif model_id.startswith("bambam:lite"):
        return "groq", "llama-3.1-8b-instant"
    elif model_id.startswith("bambam:max"):
        return "openrouter", "anthropic/claude-3.5-sonnet"
    else:
        return "openai", model_id if not model_id.startswith("bambam:") else "gpt-4o-mini"


def _run_member_chat(member, message, model_id, clients):
    """Bir üye için senkron LLM çağrısı (thread'de çalışır)"""
    provider, model_name = _resolve_model(model_id)
    client = clients.get(provider)
    
    if not client:
        return {
            "member_id": member["id"],
            "role_name": member["role_name"],
            "icon": member.get("icon", "🤖"),
            "content": f"Hata: {provider} API key yapılandırılmamış",
            "error": True
        }
    
    chat_id = member["chat_id"]
    
    # Kullanıcı mesajını kaydet
    try:
        db.add_message(chat_id, "user", message, model_name=model_id)
    except:
        pass
    
    # Mesaj geçmişini al
    history = db.get_messages(chat_id)
    
    team_system = (
        f"Sen bir takımda '{member['role_name']}' rolündesin. "
        f"Takımda başka üyeler de var ve herkes kendi uzmanlık alanında çalışıyor. "
        f"SADECE senin rolünle ilgili olan kısmı yap. Diğer rollerin işine karışma. "
        f"Projenin tamamını kurma, sadece kendi sorumluluğundaki parçayı detaylı şekilde ele al.\n\n"
        f"KOD YAZARKEN: Dosya oluşturmak istediğinde kod bloklarını şu formatta yaz:\n"
        f"```dil:dosya_adi.uzanti\n// kod içeriği\n```\n"
        f"Örnek: ```html:index.html veya ```css:style.css veya ```js:script.js\n"
        f"Bu format sayesinde kodların otomatik olarak proje dosyalarına kaydedilecek.\n\n"
        f"{member['system_prompt']}"
    )
    llm_messages = [
        {"role": "system", "content": team_system}
    ]
    recent = history[-20:] if len(history) > 20 else history
    for msg in recent:
        llm_messages.append({"role": msg["role"], "content": msg["content"]})
    
    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=llm_messages,
            stream=False
        )
        content = response.choices[0].message.content
        
        # Bot cevabını kaydet
        try:
            db.add_message(chat_id, "assistant", content, model_name=model_id)
        except:
            pass
        
        return {
            "member_id": member["id"],
            "role_name": member["role_name"],
            "icon": member.get("icon", "🤖"),
            "content": content,
            "error": False
        }
    except Exception as e:
        return {
            "member_id": member["id"],
            "role_name": member["role_name"],
            "icon": member.get("icon", "🤖"),
            "content": f"Hata: {str(e)}",
            "error": True
        }


@router.post("/{team_id}/master")
async def master_prompt(
    team_id: str,
    req: MasterPromptRequest,
    current_user: dict = Depends(get_current_user)
):
    """Tüm takım üyelerine aynı anda master prompt gönder, paralel çalıştır"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    members = db.get_team_members(team_id)
    if not members:
        raise HTTPException(status_code=400, detail="Takımda üye yok")
    
    clients = _get_llm_clients()
    
    # Tüm üyelere paralel istek gönder
    loop = asyncio.get_event_loop()
    executor = ThreadPoolExecutor(max_workers=len(members))
    
    tasks = [
        loop.run_in_executor(executor, _run_member_chat, member, req.message, req.model or member.get("model") or "gpt-4o-mini", clients)
        for member in members
    ]
    
    results = await asyncio.gather(*tasks)
    
    # Otomatik dosya çıkarma: her üyenin cevabından kod bloklarını çıkar ve kaydet
    all_extracted = []
    for r in results:
        if not r.get("error") and r.get("content"):
            extracted = extract_files_from_text(r["content"])
            if extracted:
                saved = save_extracted_files(team_id, extracted)
                all_extracted.extend(saved)
    
    # Birleştirme: Tüm sonuçları topla
    combined_parts = []
    for r in results:
        combined_parts.append(f"## {r['icon']} {r['role_name']}\n\n{r['content']}")
    
    combined = "\n\n---\n\n".join(combined_parts)
    
    return {
        "results": results,
        "combined": combined,
        "extracted_files": all_extracted
    }


# ===== AGENTIC MULTI-STEP + SSE STREAMING =====

def _build_system_prompt(member, team_id):
    """Üye için system prompt oluştur (mevcut proje dosyalarını da ekle)"""
    base = (
        f"Sen bir takımda '{member['role_name']}' rolündesin. "
        f"Takımda başka üyeler de var ve herkes kendi uzmanlık alanında çalışıyor. "
        f"SADECE senin rolünle ilgili olan kısmı yap. Diğer rollerin işine karışma. "
        f"Projenin tamamını kurma, sadece kendi sorumluluğundaki parçayı detaylı şekilde ele al.\n\n"
        f"KOD YAZARKEN: Dosya oluşturmak istediğinde kod bloklarını şu formatta yaz:\n"
        f"```dil:dosya_adi.uzanti\n// kod içeriği\n```\n"
        f"Örnek: ```html:index.html veya ```css:style.css veya ```js:script.js\n"
        f"Bu format sayesinde kodların otomatik olarak proje dosyalarına kaydedilecek.\n\n"
        f"{member['system_prompt']}"
    )
    # Mevcut proje dosyalarını context'e ekle
    try:
        project_dir = get_project_dir(team_id)
        existing_files = []
        for p in sorted(project_dir.rglob("*")):
            if p.is_file() and p.suffix in ('.html', '.css', '.js', '.json', '.py', '.txt'):
                try:
                    content = p.read_text(encoding="utf-8", errors="replace")
                    if len(content) < 5000:
                        rel = p.relative_to(project_dir).as_posix()
                        existing_files.append(f"--- {rel} ---\n{content}")
                except:
                    pass
        if existing_files:
            base += "\n\n=== MEVCUT PROJE DOSYALARI ===\n" + "\n\n".join(existing_files) + "\n=== DOSYA SONU ===\n"
            base += "\nBu dosyaları incele. Eğer güncelleme gerekiyorsa dosyanın TAMAMINI yeniden yaz (patch değil). "
            base += "Yeni dosya oluşturacaksan aynı format ile yaz.\n"
    except:
        pass
    return base


def _check_relevance(member, message, model_id, clients):
    """Görevin bu üyenin rolüyle ilgili olup olmadığını kontrol et.
    Returns: (is_relevant: bool, reason: str)"""
    provider, model_name = _resolve_model(model_id)
    client = clients.get(provider)
    if not client:
        return True, ""  # Client yoksa yine de dene
    
    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": (
                    f"Sen '{member['role_name']}' rolünde bir takım üyesisin.\n"
                    f"Rol açıklaman: {member.get('system_prompt', '')[:200]}\n\n"
                    f"Aşağıdaki görevi değerlendir. Bu görev SENİN ROLÜNLE doğrudan ilgili mi?\n"
                    f"Sadece JSON döndür, başka bir şey yazma.\n"
                    f'İlgiliyse: {{"relevant": true}}\n'
                    f'İlgili değilse: {{"relevant": false, "reason": "kısa açıklama"}}'
                )},
                {"role": "user", "content": message}
            ],
            max_tokens=100,
            temperature=0.1
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        result = json.loads(raw)
        return result.get("relevant", True), result.get("reason", "")
    except:
        return True, ""  # Parse hatası olursa yine de çalış


def _plan_steps(member, message, model_id, clients):
    """Üye için plan adımları oluştur (kısa planlama LLM çağrısı)"""
    provider, model_name = _resolve_model(model_id)
    client = clients.get(provider)
    if not client:
        return None, f"{provider} API key yapılandırılmamış"
    
    plan_prompt = (
        f"Sen '{member['role_name']}' rolündesin. "
        f"Aşağıdaki görev için SADECE senin rolünle ilgili yapılacak işleri adımlara böl. "
        f"KURAL: Basit, tek bir değişiklik gerektiren görevler (renk değiştirme, metin düzenleme, küçük düzeltme vb.) için SADECE 1 ADIM yaz. "
        f"Karmaşık, çok parçalı görevler için en fazla 3-5 adım yaz. Gereksiz adım ekleme. "
        f"Sadece JSON array döndür, başka bir şey yazma. "
        f"Her eleman kısa bir string olsun (max 10 kelime). "
        f'Basit görev örneği: ["CSS renklerini güncelle"]\n'
        f'Karmaşık görev örneği: ["HTML yapısını kur", "CSS stilleri ekle", "JavaScript ekle"]\n\n'
        f"Görev: {message}"
    )
    
    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": f"Sen '{member['role_name']}' rolünde bir AI asistansın. Sadece JSON array döndür. Basit işler için 1 adım yeterli."},
                {"role": "user", "content": plan_prompt}
            ],
            max_tokens=300,
            temperature=0.2
        )
        raw = response.choices[0].message.content.strip()
        # JSON parse et
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        steps = json.loads(raw)
        if isinstance(steps, list) and len(steps) > 0:
            return steps, None
        return ["Görevi tamamla"], None
    except Exception as e:
        # Plan oluşturulamazsa tek adımda çalış
        return ["Görevi tamamla"], None


def _run_step_streaming(member, message, step_desc, step_num, total_steps, model_id, clients, team_id, event_queue):
    """Bir adım için streaming LLM çağrısı yap, token'ları event_queue'ya gönder"""
    provider, model_name = _resolve_model(model_id)
    client = clients.get(provider)
    member_id = member["id"]
    
    if not client:
        event_queue.put({"member_id": member_id, "type": "step_error", "step": step_num, "error": f"{provider} API key yok"})
        return ""
    
    chat_id = member["chat_id"]
    history = db.get_messages(chat_id)
    
    system_prompt = _build_system_prompt(member, team_id)
    system_prompt += f"\n\nŞu anda Adım {step_num}/{total_steps} üzerinde çalışıyorsun: {step_desc}\nBu adımla ilgili kodu yaz."
    
    llm_messages = [{"role": "system", "content": system_prompt}]
    recent = history[-10:] if len(history) > 10 else history
    for msg in recent:
        llm_messages.append({"role": msg["role"], "content": msg["content"]})
    
    # Son kullanıcı mesajı history'de yoksa ekle
    if not recent or recent[-1]["content"] != message:
        llm_messages.append({"role": "user", "content": f"{message}\n\n[Adım {step_num}/{total_steps}: {step_desc}]"})
    
    full_content = ""
    try:
        stream = client.chat.completions.create(
            model=model_name,
            messages=llm_messages,
            stream=True
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                full_content += delta
                event_queue.put({
                    "member_id": member_id,
                    "type": "delta",
                    "step": step_num,
                    "content": delta
                })
    except Exception as e:
        event_queue.put({"member_id": member_id, "type": "step_error", "step": step_num, "error": str(e)})
    
    return full_content


def _run_member_agentic(member, message, model_id, clients, team_id, event_queue):
    """Bir üye için agentic multi-step çalışma (thread'de çalışır)"""
    member_id = member["id"]
    
    # Kullanıcı mesajını DB'ye kaydet
    try:
        db.add_message(member["chat_id"], "user", message, model_name=model_id)
    except:
        pass
    
    # Önce: Bu görev benim rolümle ilgili mi?
    event_queue.put({"member_id": member_id, "type": "planning"})
    is_relevant, skip_reason = _check_relevance(member, message, model_id, clients)
    
    if not is_relevant:
        reason_text = skip_reason or "Bu görev benim rolümle ilgili değil."
        # DB'ye kaydet
        try:
            db.add_message(member["chat_id"], "assistant", f"⏭ Atlandı: {reason_text}", model_name=model_id)
        except:
            pass
        event_queue.put({
            "member_id": member_id,
            "type": "skipped",
            "reason": reason_text
        })
        event_queue.put({
            "member_id": member_id,
            "type": "member_done",
            "extracted_files": []
        })
        return
    
    # Plan oluştur
    steps, plan_error = _plan_steps(member, message, model_id, clients)
    
    if plan_error:
        event_queue.put({"member_id": member_id, "type": "error", "error": plan_error})
        return
    
    event_queue.put({
        "member_id": member_id,
        "type": "plan",
        "steps": steps,
        "total": len(steps)
    })
    
    # Adım 2..N: Her adımı streaming olarak çalıştır
    all_content = ""
    all_extracted = []
    
    for i, step_desc in enumerate(steps, 1):
        event_queue.put({
            "member_id": member_id,
            "type": "step_start",
            "step": i,
            "total": len(steps),
            "description": step_desc
        })
        
        step_content = _run_step_streaming(
            member, message, step_desc, i, len(steps),
            model_id, clients, team_id, event_queue
        )
        
        all_content += f"\n\n## Adım {i}: {step_desc}\n{step_content}"
        
        # Her adımda dosya çıkarma yap
        if step_content:
            extracted = extract_files_from_text(step_content)
            if extracted:
                saved = save_extracted_files(team_id, extracted)
                all_extracted.extend(saved)
                event_queue.put({
                    "member_id": member_id,
                    "type": "files",
                    "step": i,
                    "files": saved
                })
        
        event_queue.put({
            "member_id": member_id,
            "type": "step_done",
            "step": i,
            "total": len(steps)
        })
    
    # Tüm içeriği DB'ye kaydet
    try:
        db.add_message(member["chat_id"], "assistant", all_content.strip(), model_name=model_id)
    except:
        pass
    
    event_queue.put({
        "member_id": member_id,
        "type": "member_done",
        "extracted_files": all_extracted
    })


@router.post("/{team_id}/master-stream")
async def master_prompt_stream(
    team_id: str,
    req: MasterPromptRequest,
    current_user: dict = Depends(get_current_user)
):
    """Agentic multi-step master prompt - SSE streaming"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    members = db.get_team_members(team_id)
    if not members:
        raise HTTPException(status_code=400, detail="Takımda üye yok")
    
    clients = _get_llm_clients()
    event_queue = queue.Queue()
    
    # Tüm üyeleri paralel olarak başlat
    threads = []
    for member in members:
        model_id = req.model or member.get("model") or "gpt-4o-mini"
        t = threading.Thread(
            target=_run_member_agentic,
            args=(member, req.message, model_id, clients, team_id, event_queue),
            daemon=True
        )
        threads.append(t)
        t.start()
    
    def sse_generator():
        # Başlangıç event'i
        members_info = [{"id": m["id"], "role_name": m["role_name"], "icon": m.get("icon", "🤖")} for m in members]
        yield f"data: {json.dumps({'type': 'start', 'members': members_info})}\n\n"
        
        done_members = set()
        total_members = len(members)
        
        while len(done_members) < total_members:
            try:
                event = event_queue.get(timeout=120)
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                
                if event.get("type") == "member_done":
                    done_members.add(event["member_id"])
                elif event.get("type") == "error":
                    done_members.add(event["member_id"])
            except queue.Empty:
                # Timeout - gönder heartbeat
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        
        # Tüm üyeler bitti
        yield f"data: {json.dumps({'type': 'all_done'})}\n\n"
        
        # Thread'lerin bitmesini bekle
        for t in threads:
            t.join(timeout=5)
    
    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
