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
import shutil
import base64
from concurrent.futures import ThreadPoolExecutor
from project_files import (
    extract_files_from_text,
    save_extracted_files,
    save_extracted_files_with_proposals,
    get_project_dir,
)

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
        clients["groq"] = OpenAI(
            api_key=os.getenv("GROQ_API_KEY"), base_url="https://api.groq.com/openai/v1"
        )
    if os.getenv("OPENROUTER_API_KEY"):
        clients["openrouter"] = OpenAI(
            api_key=os.getenv("OPENROUTER_API_KEY"),
            base_url="https://openrouter.ai/api/v1",
        )
    return clients


def _employee_output_guide():
    return (
        "YAZIM DİLİ VE FORMAT:\n"
        "- Şirket içi uzman ekip üyesi gibi konuş: net, profesyonel, aksiyona odaklı.\n"
        "- Kısa bir ilerleme özeti ver, gereksiz uzun anlatım yapma.\n"
        "- MUTLAKA 'Brainstorming:' başlığı yaz. Bu başlık her yanıtta zorunlu.\n"
        "- Kodları düz metin olarak yazma; sadece belirtilen kod bloğu formatında yaz.\n"
        "- Kullanıcının açıkça istemediği hiçbir şeyi değiştirme. Tasarım, metin, renk, dosya yapısı veya davranış değişikliği ekleme.\n"
        "- Görev kapsamı dışına çıkma. Sadece istenen bileşen, ekran, stil veya dosya üzerinde minimal değişiklik yap.\n"
        "- Mevcut çalışan yapıyı koru; istenmeyen refactor, yeniden adlandırma veya ek özellik ekleme.\n"
        "- Yanıtı şu iskelette yaz:\n"
        "  Durum: <1-2 cümle durum güncellemesi>\n"
        "  Brainstorming: <kısa düşünce/plan notları>\n"
        "  Deliverable: <çıktı, açıklama ve kodlar>\n"
        "- Brainstorming bölümünü kısa tut (2-5 satır).\n"
        "- KOD YAZARKEN dosyaları mutlaka bu formatta ver:\n"
        "  ```dil:dosya_adi.uzanti\\n// kod içeriği\\n```\n"
        "  Örnek: ```html:index.html veya ```css:style.css veya ```js:script.js\n"
    )


# ===== MODELS =====


class MemberInput(BaseModel):
    client_key: Optional[str] = None
    role_name: str
    description: Optional[str] = None
    system_prompt: str
    icon: Optional[str] = "🤖"
    model: Optional[str] = "gpt-4o-mini"
    depends_on: Optional[List[str]] = None


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
    depends_on: Optional[List[str]] = None


class UpdateMemberRequest(BaseModel):
    role_name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    icon: Optional[str] = None
    model: Optional[str] = None
    depends_on: Optional[List[str]] = None


class TeamProjectRequest(BaseModel):
    name: str


class AttachmentInput(BaseModel):
    name: str
    type: Optional[str] = None
    content: Optional[str] = None


# ===== ENDPOINTS =====


@router.post("")
async def create_team(
    req: CreateTeamRequest, current_user: dict = Depends(get_current_user)
):
    """Yeni takım oluştur + üyelerini ekle"""
    if not req.members or len(req.members) == 0:
        raise HTTPException(status_code=400, detail="En az bir üye gerekli")

    team = db.create_team(req.name, current_user["id"], req.description)

    members = []
    member_key_map = {}
    for m in req.members:
        member = db.add_team_member(
            team_id=team["id"],
            role_name=m.role_name,
            system_prompt=m.system_prompt,
            description=m.description,
            icon=m.icon or "🤖",
            model=m.model or "gpt-4o-mini",
            depends_on=[],
        )
        member_key_map[m.client_key or member["id"]] = member["id"]
        members.append(member)

    for created_member, member_input in zip(members, req.members):
        raw_depends = member_input.depends_on or []
        resolved_depends = []
        for dep in raw_depends:
            resolved = member_key_map.get(dep, dep)
            if resolved != created_member["id"] and resolved in member_key_map.values():
                resolved_depends.append(resolved)
        updated_member = db.update_team_member(
            created_member["id"], depends_on=resolved_depends
        )
        if updated_member:
            created_member.update(updated_member)

    team["members"] = members
    return team


@router.get("")
async def list_teams(current_user: dict = Depends(get_current_user)):
    """Kullanıcının takımlarını listele"""
    teams = db.get_teams_by_user(current_user["id"])

    for team in teams:
        team["members"] = db.get_team_members(team["id"])
        team["projects"] = db.list_team_projects(team["id"])
        team["active_project"] = db.get_active_team_project(team["id"])

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
    team["projects"] = db.list_team_projects(team_id)
    team["active_project"] = db.get_active_team_project(team_id)
    return team


@router.put("/{team_id}")
async def update_team(
    team_id: str, req: UpdateTeamRequest, current_user: dict = Depends(get_current_user)
):
    """Takım bilgilerini güncelle"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")

    updated = db.update_team(team_id, name=req.name, description=req.description)
    updated["members"] = db.get_team_members(team_id)
    updated["projects"] = db.list_team_projects(team_id)
    updated["active_project"] = db.get_active_team_project(team_id)
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
async def add_member(
    team_id: str, req: AddMemberRequest, current_user: dict = Depends(get_current_user)
):
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
        model=req.model or "gpt-4o-mini",
        depends_on=req.depends_on or [],
    )
    return member


@router.patch("/{team_id}/members/{member_id}")
async def update_member(
    team_id: str,
    member_id: str,
    req: UpdateMemberRequest,
    current_user: dict = Depends(get_current_user),
):
    """Takım üyesinin modelini güncelle"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")

    member = db.get_team_member(member_id)
    if not member or member["team_id"] != team_id:
        raise HTTPException(status_code=404, detail="Üye bulunamadı")

    updated = db.update_team_member(
        member_id,
        role_name=req.role_name,
        description=req.description,
        system_prompt=req.system_prompt,
        icon=req.icon,
        model=req.model,
        depends_on=req.depends_on,
    )
    return updated


@router.delete("/{team_id}/members/{member_id}")
async def remove_member(
    team_id: str, member_id: str, current_user: dict = Depends(get_current_user)
):
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


@router.get("/{team_id}/projects")
async def list_team_projects(
    team_id: str, current_user: dict = Depends(get_current_user)
):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    return {
        "projects": db.list_team_projects(team_id),
        "active_project": db.get_active_team_project(team_id),
    }


@router.post("/{team_id}/projects")
async def create_team_project(
    team_id: str,
    req: TeamProjectRequest,
    current_user: dict = Depends(get_current_user),
):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    project = db.create_team_project(team_id, req.name.strip(), set_active=True)
    return {"project": project, "projects": db.list_team_projects(team_id)}


@router.post("/{team_id}/projects/{project_id}/activate")
async def activate_team_project(
    team_id: str, project_id: str, current_user: dict = Depends(get_current_user)
):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    project = db.set_active_team_project(team_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proje bulunamadı")
    return {"project": project, "projects": db.list_team_projects(team_id)}


@router.delete("/{team_id}/projects/{project_id}")
async def delete_team_project(
    team_id: str, project_id: str, current_user: dict = Depends(get_current_user)
):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    project_dir = get_project_dir(team_id, project_id)
    ok = db.delete_team_project(team_id, project_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Proje bulunamadı")
    if project_dir.exists():
        shutil.rmtree(project_dir, ignore_errors=True)
    return {
        "projects": db.list_team_projects(team_id),
        "active_project": db.get_active_team_project(team_id),
    }


@router.get("/{team_id}/members/{member_id}/messages")
async def get_member_messages(
    team_id: str, member_id: str, current_user: dict = Depends(get_current_user)
):
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
    current_user: dict = Depends(get_current_user),
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
        f"{_employee_output_guide()}\n"
        f"Bu format sayesinde kodların otomatik olarak proje dosyalarına kaydedilecek.\n\n"
        f"{member['system_prompt']}"
    )
    llm_messages = [{"role": "system", "content": member_system}]

    # Son 20 mesajı ekle
    recent = history[-20:] if len(history) > 20 else history
    for msg in recent:
        llm_messages.append({"role": msg["role"], "content": msg["content"]})

    # Model provider belirle (request'ten gelen varsa onu, yoksa üyenin kayıtlı modelini kullan)
    model_id = req.model or member.get("model") or "gpt-4o-mini"

    provider = "openai"
    model_name = "gpt-4o"

    clients = _get_llm_clients()
    client = clients.get(provider)

    if not client:
        raise HTTPException(
            status_code=500, detail=f"{provider} API key yapılandırılmamış"
        )

    def generate():
        full_reply = ""
        try:
            stream = client.chat.completions.create(
                model=model_name, messages=llm_messages, stream=True
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
    attachments: Optional[List[AttachmentInput]] = None


def _format_master_message(
    message: str, attachments: Optional[List[AttachmentInput]] = None
) -> str:
    if not attachments:
        return message

    blocks = []
    for item in attachments:
        if not item.name:
            continue
        file_type = item.type or "file"
        if file_type.startswith("image/"):
            blocks.append(
                f"[Gorsel] {item.name}: Bu gorseli dikkate al ve tasarim kararlarini buna gore ver."
            )
        else:
            content = (item.content or "").strip()
            if content:
                blocks.append(f"[Dosya] {item.name}\n{content[:12000]}")
            else:
                blocks.append(
                    f"[Dosya] {item.name}: Icerik okunamadi ama dosya baglama eklendi."
                )

    if not blocks:
        return message

    return f"{message}\n\n=== EKLER ===\n" + "\n\n".join(blocks)


def _build_user_content(
    message: str, attachments: Optional[List[AttachmentInput]] = None
):
    parts = []
    if message:
        parts.append({"type": "text", "text": message})

    for item in attachments or []:
        if not item.name:
            continue
        file_type = item.type or "file"
        raw_content = item.content or ""
        if file_type.startswith("image/") and raw_content:
            image_url = raw_content
            if not raw_content.startswith("data:"):
                image_url = f"data:{file_type};base64,{raw_content}"
            parts.append({"type": "image_url", "image_url": {"url": image_url}})
            parts.append(
                {
                    "type": "text",
                    "text": f"\n[Gorsel: {item.name}] Bu gorseli analiz et ve dikkate al.",
                }
            )
        elif raw_content:
            parts.append(
                {
                    "type": "text",
                    "text": f"\n[Dosya: {item.name}]\n{raw_content[:12000]}",
                }
            )
        else:
            parts.append(
                {"type": "text", "text": f"\n[Dosya: {item.name}] Icerik okunamadi."}
            )

    if len(parts) == 1 and parts[0]["type"] == "text":
        return parts[0]["text"]
    return parts


def _resolve_model(model_id: str):
    """Model ID'den provider ve model adı çıkar"""
    return "openai", "gpt-4o"


def _run_member_chat(member, message, model_id, clients, attachments=None):
    """Bir üye için senkron LLM çağrısı (thread'de çalışır)"""
    provider, model_name = _resolve_model(model_id)
    client = clients.get(provider)

    if not client:
        return {
            "member_id": member["id"],
            "role_name": member["role_name"],
            "icon": member.get("icon", "🤖"),
            "content": f"Hata: {provider} API key yapılandırılmamış",
            "error": True,
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
        f"{_employee_output_guide()}\n"
        f"Bu format sayesinde kodların otomatik olarak proje dosyalarına kaydedilecek.\n\n"
        f"{member['system_prompt']}"
    )
    llm_messages = [{"role": "system", "content": team_system}]
    recent = history[-20:] if len(history) > 20 else history
    for msg in recent:
        llm_messages.append({"role": msg["role"], "content": msg["content"]})
    llm_messages.append(
        {"role": "user", "content": _build_user_content(message, attachments)}
    )

    try:
        response = client.chat.completions.create(
            model=model_name, messages=llm_messages, stream=False
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
            "error": False,
        }
    except Exception as e:
        return {
            "member_id": member["id"],
            "role_name": member["role_name"],
            "icon": member.get("icon", "🤖"),
            "content": f"Hata: {str(e)}",
            "error": True,
        }


@router.post("/{team_id}/master")
async def master_prompt(
    team_id: str,
    req: MasterPromptRequest,
    current_user: dict = Depends(get_current_user),
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
    formatted_message = _format_master_message(req.message, req.attachments)

    # Tüm üyelere paralel istek gönder
    loop = asyncio.get_event_loop()
    executor = ThreadPoolExecutor(max_workers=len(members))

    tasks = [
        loop.run_in_executor(
            executor,
            _run_member_chat,
            member,
            formatted_message,
            req.model or member.get("model") or "gpt-4o-mini",
            clients,
            req.attachments,
        )
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

    return {"results": results, "combined": combined, "extracted_files": all_extracted}


# ===== AGENTIC MULTI-STEP + SSE STREAMING =====


def _build_system_prompt(member, team_id, run_id=None):
    """Üye için system prompt oluştur (mevcut proje dosyalarını da ekle)"""
    base = (
        f"Sen bir takımda '{member['role_name']}' rolündesin. "
        f"Takımda başka üyeler de var ve herkes kendi uzmanlık alanında çalışıyor. "
        f"SADECE senin rolünle ilgili olan kısmı yap. Diğer rollerin işine karışma. "
        f"Projenin tamamını kurma, sadece kendi sorumluluğundaki parçayı detaylı şekilde ele al.\n\n"
        f"{_employee_output_guide()}\n"
        f"Bu format sayesinde kodların otomatik olarak proje dosyalarına kaydedilecek.\n\n"
        f"{member['system_prompt']}"
    )
    # Mevcut proje dosyalarını context'e ekle
    try:
        project_dir = get_project_dir(team_id)
        existing_files = []
        for p in sorted(project_dir.rglob("*")):
            if p.is_file() and p.suffix in (
                ".html",
                ".css",
                ".js",
                ".json",
                ".py",
                ".txt",
            ):
                try:
                    content = p.read_text(encoding="utf-8", errors="replace")
                    if len(content) < 5000:
                        rel = p.relative_to(project_dir).as_posix()
                        existing_files.append(f"--- {rel} ---\n{content}")
                except:
                    pass
        if existing_files:
            base += (
                "\n\n=== MEVCUT PROJE DOSYALARI ===\n"
                + "\n\n".join(existing_files)
                + "\n=== DOSYA SONU ===\n"
            )
            base += "\nBu dosyaları incele. Eğer güncelleme gerekiyorsa dosyanın TAMAMINI yeniden yaz (patch değil). "
            base += "Yeni dosya oluşturacaksan aynı format ile yaz.\n"
    except:
        pass

    if run_id:
        collaboration_context = _build_collaboration_context(run_id, member["id"])
        if collaboration_context:
            base += f"\n\n{collaboration_context}\n"

    return base


def _get_project_file_list(team_id):
    """Projede var olan dosya listesini döndür (sadece isimler, küçük boyutlu bağlam)"""
    try:
        project_dir = get_project_dir(team_id)
        files = []
        for p in sorted(project_dir.rglob("*")):
            if p.is_file() and p.suffix in (".html", ".css", ".js", ".json", ".py", ".txt", ".tsx", ".ts"):
                rel = p.relative_to(project_dir).as_posix()
                files.append(rel)
        return files
    except:
        return []


def _check_relevance(member, message, model_id, clients, team_id=None, force_accept=False):
    """Görevin bu üyenin rolüyle ilgili olup olmadığını kontrol et.
    Returns: (is_relevant: bool, reason: str)"""
    if force_accept:
        return True, ""

    provider, model_name = _resolve_model(model_id)
    client = clients.get(provider)
    if not client:
        return True, ""

    # Proje dosyaları bağlamı
    file_context = ""
    if team_id:
        existing_files = _get_project_file_list(team_id)
        if existing_files:
            file_context = f"\nProjede mevcut dosyalar: {', '.join(existing_files[:30])}\n"

    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"Sen '{member['role_name']}' rolünde bir takım üyesisin.\n"
                        f"Rol açıklaman: {member.get('system_prompt', '')[:300]}\n"
                        f"{file_context}\n"
                        f"Aşağıdaki görevi değerlendir.\n\n"
                        f"KURALLAR:\n"
                        f"1. Eğer görev mevcut dosyaları GÜNCELLEME/DEĞİŞTİRME/DÜZENLEME içeriyorsa "
                        f"(title değiştir, renk güncelle, metin ekle, düzelt vb.) ve projedeki dosyalar "
                        f"senin uzmanlık alanındaki dosya türlerini içeriyorsa → relevant: true\n"
                        f"2. Eğer görev yeni bir şey OLUŞTURMA içeriyorsa ve senin rolünle ilişkili bir "
                        f"kısmı varsa → relevant: true\n"
                        f"3. Şüphede kalırsan → relevant: true (atlamaktansa katkı sağla)\n"
                        f"4. SADECE görev tamamen farklı bir uzmanlık alanıysa ve senin yapabileceğin "
                        f"HİÇBİR şey yoksa → relevant: false\n\n"
                        f"Sadece JSON döndür:\n"
                        f'{{"relevant": true}} veya {{"relevant": false, "reason": "kısa açıklama"}}'
                    ),
                },
                {"role": "user", "content": message},
            ],
            max_tokens=100,
            temperature=0.1,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        result = json.loads(raw)
        return result.get("relevant", True), result.get("reason", "")
    except:
        return True, ""


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
                {
                    "role": "system",
                    "content": f"Sen '{member['role_name']}' rolünde bir AI asistansın. Sadece JSON array döndür. Basit işler için 1 adım yeterli.",
                },
                {"role": "user", "content": plan_prompt},
            ],
            max_tokens=300,
            temperature=0.2,
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


def _event_payload(base: dict, run_id: str = None, task_id: str = None):
    payload = dict(base)
    if run_id:
        payload["run_id"] = run_id
    if task_id:
        payload["task_id"] = task_id
    return payload


def _normalize_role_text(member):
    return " ".join(
        [
            str(member.get("role_name") or ""),
            str(member.get("description") or ""),
            str(member.get("system_prompt") or ""),
        ]
    ).lower()


def _infer_member_stage(member):
    text = _normalize_role_text(member)
    if any(
        k in text
        for k in [
            "architect",
            "planner",
            "product",
            "manager",
            "strateji",
            "strategy",
            "coordinator",
        ]
    ):
        return "strategy"
    if any(k in text for k in ["design", "designer", "ui/ux", "ux", "ui", "brand"]):
        return "design"
    if any(
        k in text
        for k in ["backend", "api", "server", "database", "db ", "sql", "auth"]
    ):
        return "backend"
    if any(
        k in text
        for k in [
            "frontend",
            "front-end",
            "react",
            "html",
            "css",
            "javascript",
            "js",
            "client",
        ]
    ):
        return "frontend"
    if any(k in text for k in ["qa", "test", "tester", "quality"]):
        return "qa"
    if any(
        k in text for k in ["devops", "deploy", "infrastructure", "docker", "ci/cd"]
    ):
        return "devops"
    return "general"


def _build_role_dependencies(members):
    stage_priority = {
        "strategy": 0,
        "design": 1,
        "backend": 1,
        "frontend": 2,
        "devops": 3,
        "qa": 4,
        "general": 2,
    }
    members_by_stage = {}
    member_by_id = {member["id"]: member for member in members}
    for member in members:
        stage = _infer_member_stage(member)
        member["dependency_stage"] = stage
        members_by_stage.setdefault(stage, []).append(member)

    dependency_map = {}
    for member in members:
        explicit_depends_on = [
            dep_id
            for dep_id in (member.get("depends_on") or [])
            if dep_id in member_by_id and dep_id != member["id"]
        ]
        if explicit_depends_on:
            dependency_map[member["id"]] = [
                member_by_id[dep_id] for dep_id in explicit_depends_on
            ]
            continue

        stage = member["dependency_stage"]
        deps = []

        if stage != "strategy":
            deps.extend(members_by_stage.get("strategy", []))
        if stage == "frontend":
            deps.extend(members_by_stage.get("design", []))
            if not members_by_stage.get("design"):
                deps.extend(members_by_stage.get("backend", []))
        elif stage == "devops":
            deps.extend(members_by_stage.get("backend", []))
            deps.extend(members_by_stage.get("frontend", []))
        elif stage == "qa":
            deps.extend(members_by_stage.get("design", []))
            deps.extend(members_by_stage.get("backend", []))
            deps.extend(members_by_stage.get("frontend", []))
        elif stage == "general":
            deps.extend(members_by_stage.get("design", []))
            deps.extend(members_by_stage.get("backend", []))

        unique = []
        seen = set()
        for dep in sorted(
            deps, key=lambda m: stage_priority.get(m["dependency_stage"], 99)
        ):
            if dep["id"] == member["id"] or dep["id"] in seen:
                continue
            seen.add(dep["id"])
            unique.append(dep)
        dependency_map[member["id"]] = unique

    return dependency_map


def _create_hard_block_run(team_id, user_id, prompt, model_id, members):
    run = db.create_team_run(team_id, user_id, prompt, model_id)
    tasks = []
    dependencies = []
    dependency_map = _build_role_dependencies(members)
    task_by_member = {}

    for idx, member in enumerate(members, 1):
        member_dependencies = dependency_map.get(member["id"], [])
        blocked_reason = None
        status = "ready" if not member_dependencies else "blocked"
        if member_dependencies:
            dep_names = ", ".join(dep["role_name"] for dep in member_dependencies[:2])
            blocked_reason = f"Bekleniyor: {dep_names}"

        task = db.create_team_task(
            run_id=run["id"],
            team_id=team_id,
            member_id=member["id"],
            title=f"{member['role_name']} görevi",
            task_order=idx,
            status=status,
            blocked_reason=blocked_reason,
        )
        tasks.append(task)
        task_by_member[member["id"]] = task

    for member in members:
        task = task_by_member[member["id"]]
        for dep_member in dependency_map.get(member["id"], []):
            dep_task = task_by_member[dep_member["id"]]
            dependencies.append(
                db.create_task_dependency(
                    task["id"], dep_task["id"], dependency_type="hard"
                )
            )

    return run, tasks, dependencies


def _get_member_task_map(tasks):
    return {task["member_id"]: task for task in tasks}


def _get_task_id_map(tasks):
    return {task["id"]: task for task in tasks}


def _summarize_task_result(text: str, max_len: int = 240) -> str:
    source = (text or "").strip()
    if not source:
        return "Görev tamamlandı."

    for line in source.splitlines():
        cleaned = line.strip().strip("#*- ")
        if not cleaned:
            continue
        if cleaned.lower().startswith(("durum:", "brainstorming:", "deliverable:")):
            cleaned = cleaned.split(":", 1)[-1].strip()
        if cleaned:
            return cleaned[:max_len] + ("..." if len(cleaned) > max_len else "")

    compact = " ".join(source.split())
    return compact[:max_len] + ("..." if len(compact) > max_len else "")


def _build_collaboration_context(run_id: str, member_id: str) -> str:
    parts = []

    memories = db.list_project_memory(run_id, limit=8)
    if memories:
        memory_lines = []
        for item in memories:
            title = item.get("title") or item.get("memory_type") or "not"
            memory_lines.append(f"- {title}: {item.get('content', '')}")
        parts.append("=== SHARED PROJECT MEMORY ===\n" + "\n".join(memory_lines))

    inbox = db.list_agent_messages(run_id, to_member_id=member_id, limit=8)
    if inbox:
        inbox_lines = []
        for msg in inbox:
            msg_type = msg.get("message_type") or "message"
            subject = msg.get("subject") or "Kısa not"
            inbox_lines.append(f"- [{msg_type}] {subject}: {msg.get('content', '')}")
        parts.append("=== TEAM HANDOFFS ===\n" + "\n".join(inbox_lines))

    return "\n\n".join(parts).strip()


def _record_task_completion_artifacts(
    run_id: str,
    team_id: str,
    member: dict,
    task_id: str,
    full_content: str,
    extracted_files: list,
):
    summary = _summarize_task_result(full_content)

    db.add_project_memory(
        run_id,
        team_id,
        memory_type="task_summary",
        title=f"{member['role_name']} özeti",
        content=summary,
        member_id=member["id"],
    )

    if extracted_files:
        file_list = ", ".join(
            sorted({f.get("path", "") for f in extracted_files if f.get("path")})
        )
        if file_list:
            db.add_project_memory(
                run_id,
                team_id,
                memory_type="file_update",
                title=f"{member['role_name']} dosyaları",
                content=file_list,
                member_id=member["id"],
            )


def _create_handoff_message(
    run_id: str,
    team_id: str,
    from_member: dict,
    to_member: dict,
    task_id: str,
    full_content: str,
    extracted_files: list,
):
    summary = _summarize_task_result(full_content)
    file_list = ", ".join(
        sorted({f.get("path", "") for f in extracted_files if f.get("path")})
    )
    content = summary
    if file_list:
        content += f"\nDosyalar: {file_list}"

    message = db.create_agent_message(
        run_id=run_id,
        team_id=team_id,
        from_member_id=from_member["id"],
        to_member_id=to_member["id"],
        task_id=task_id,
        message_type="handoff",
        subject=f"{from_member['role_name']} -> {to_member['role_name']}",
        content=content,
    )
    return message


def _dependencies_satisfied(task, completed_task_ids, dependencies_by_task):
    deps = dependencies_by_task.get(task["id"], [])
    if not deps:
        return True
    return all(dep["depends_on_task_id"] in completed_task_ids for dep in deps)


def _run_step_streaming(
    member,
    message,
    step_desc,
    step_num,
    total_steps,
    model_id,
    clients,
    team_id,
    event_queue,
    run_id=None,
    task_id=None,
    attachments=None,
):
    """Bir adım için streaming LLM çağrısı yap, token'ları event_queue'ya gönder"""
    provider, model_name = _resolve_model(model_id)
    client = clients.get(provider)
    member_id = member["id"]

    if not client:
        event_queue.put(
            _event_payload(
                {
                    "member_id": member_id,
                    "type": "step_error",
                    "step": step_num,
                    "error": f"{provider} API key yok",
                },
                run_id,
                task_id,
            )
        )
        return ""

    chat_id = member["chat_id"]
    history = db.get_messages(chat_id)

    system_prompt = _build_system_prompt(member, team_id, run_id=run_id)
    system_prompt += f"\n\nŞu anda Adım {step_num}/{total_steps} üzerinde çalışıyorsun: {step_desc}\nBu adımla ilgili kodu yaz."

    llm_messages = [{"role": "system", "content": system_prompt}]
    recent = history[-10:] if len(history) > 10 else history
    for msg in recent:
        llm_messages.append({"role": msg["role"], "content": msg["content"]})

    # Son kullanıcı mesajı history'de yoksa ekle
    if attachments or not recent or recent[-1]["content"] != message:
        llm_messages.append(
            {
                "role": "user",
                "content": _build_user_content(
                    f"{message}\n\n[Adım {step_num}/{total_steps}: {step_desc}]",
                    attachments,
                ),
            }
        )

    full_content = ""
    try:
        stream = client.chat.completions.create(
            model=model_name, messages=llm_messages, stream=True
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                full_content += delta
                event_queue.put(
                    _event_payload(
                        {
                            "member_id": member_id,
                            "type": "delta",
                            "step": step_num,
                            "content": delta,
                        },
                        run_id,
                        task_id,
                    )
                )
    except Exception as e:
        event_queue.put(
            _event_payload(
                {
                    "member_id": member_id,
                    "type": "step_error",
                    "step": step_num,
                    "error": str(e),
                },
                run_id,
                task_id,
            )
        )

    return full_content


def _run_member_agentic(
    member,
    message,
    model_id,
    clients,
    team_id,
    event_queue,
    run_id=None,
    task_id=None,
    attachments=None,
    force_relevant=False,
):
    """Bir üye için agentic multi-step çalışma (thread'de çalışır)"""
    member_id = member["id"]

    # Kullanıcı mesajını DB'ye kaydet
    try:
        db.add_message(member["chat_id"], "user", message, model_name=model_id)
    except:
        pass

    # Önce: Bu görev benim rolümle ilgili mi?
    event_queue.put(
        _event_payload({"member_id": member_id, "type": "planning"}, run_id, task_id)
    )
    is_relevant, skip_reason = _check_relevance(
        member, message, model_id, clients, team_id=team_id, force_accept=force_relevant
    )

    if not is_relevant:
        reason_text = skip_reason or "Bu görev benim rolümle ilgili değil."
        # DB'ye kaydet
        try:
            db.add_message(
                member["chat_id"],
                "assistant",
                f"⏭ Atlandı: {reason_text}",
                model_name=model_id,
            )
        except:
            pass
        event_queue.put(
            _event_payload(
                {"member_id": member_id, "type": "skipped", "reason": reason_text},
                run_id,
                task_id,
            )
        )
        event_queue.put(
            _event_payload(
                {"member_id": member_id, "type": "member_done", "extracted_files": []},
                run_id,
                task_id,
            )
        )
        return

    # Plan oluştur
    steps, plan_error = _plan_steps(member, message, model_id, clients)

    if plan_error:
        event_queue.put(
            _event_payload(
                {"member_id": member_id, "type": "error", "error": plan_error},
                run_id,
                task_id,
            )
        )
        return

    event_queue.put(
        _event_payload(
            {
                "member_id": member_id,
                "type": "plan",
                "steps": steps,
                "total": len(steps),
            },
            run_id,
            task_id,
        )
    )

    # Adım 2..N: Her adımı streaming olarak çalıştır
    all_content = ""
    all_extracted = []

    for i, step_desc in enumerate(steps, 1):
        event_queue.put(
            _event_payload(
                {
                    "member_id": member_id,
                    "type": "step_start",
                    "step": i,
                    "total": len(steps),
                    "description": step_desc,
                },
                run_id,
                task_id,
            )
        )

        step_content = _run_step_streaming(
            member,
            message,
            step_desc,
            i,
            len(steps),
            model_id,
            clients,
            team_id,
            event_queue,
            run_id,
            task_id,
            attachments,
        )

        all_content += f"\n\n## Adım {i}: {step_desc}\n{step_content}"

        # Her adımda dosya çıkarma yap
        if step_content:
            extracted = extract_files_from_text(step_content)
            if extracted:
                saved = save_extracted_files_with_proposals(
                    team_id,
                    extracted,
                    run_id=run_id,
                    task_id=task_id,
                    member_id=member_id,
                )
                all_extracted.extend(saved)
                event_queue.put(
                    _event_payload(
                        {
                            "member_id": member_id,
                            "type": "files",
                            "step": i,
                            "files": saved,
                        },
                        run_id,
                        task_id,
                    )
                )
                conflicts = [item for item in saved if item.get("status") == "conflict"]
                for conflict in conflicts:
                    event_queue.put(
                        _event_payload(
                            {
                                "member_id": member_id,
                                "type": "file_conflict",
                                "step": i,
                                "path": conflict.get("path"),
                                "lock_member_id": conflict.get("lock_member_id"),
                                "proposal_id": conflict.get("proposal_id"),
                            },
                            run_id,
                            task_id,
                        )
                    )

        event_queue.put(
            _event_payload(
                {
                    "member_id": member_id,
                    "type": "step_done",
                    "step": i,
                    "total": len(steps),
                },
                run_id,
                task_id,
            )
        )

    # Tüm içeriği DB'ye kaydet
    try:
        db.add_message(
            member["chat_id"], "assistant", all_content.strip(), model_name=model_id
        )
    except:
        pass

    event_queue.put(
        _event_payload(
            {
                "member_id": member_id,
                "type": "member_done",
                "extracted_files": all_extracted,
            },
            run_id,
            task_id,
        )
    )


@router.get("/{team_id}/runs/{run_id}")
async def get_team_run_detail(
    team_id: str, run_id: str, current_user: dict = Depends(get_current_user)
):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")

    run = db.get_team_run(run_id)
    if not run or run["team_id"] != team_id:
        raise HTTPException(status_code=404, detail="Run bulunamadı")

    run["tasks"] = db.list_team_tasks(run_id)
    run["dependencies"] = db.list_task_dependencies(run_id)
    run["messages"] = db.list_agent_messages(run_id)
    run["memory"] = db.list_project_memory(run_id)
    run["proposals"] = db.list_file_proposals(run_id)
    return run


@router.post("/{team_id}/master-stream")
async def master_prompt_stream(
    team_id: str,
    req: MasterPromptRequest,
    current_user: dict = Depends(get_current_user),
):
    """Coordinator tabanlı hard-block collaboration stream"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")

    members = db.get_team_members(team_id)
    if not members:
        raise HTTPException(status_code=400, detail="Takımda üye yok")

    clients = _get_llm_clients()
    formatted_message = _format_master_message(req.message, req.attachments)
    event_queue = queue.Queue()
    run, tasks, dependencies = _create_hard_block_run(
        team_id,
        current_user["id"],
        formatted_message,
        req.model,
        members,
    )
    db.add_project_memory(
        run["id"],
        team_id,
        memory_type="master_prompt",
        title="Master Prompt",
        content=formatted_message,
    )
    task_by_member = _get_member_task_map(tasks)
    task_by_id = _get_task_id_map(tasks)
    dependencies_by_task = {}
    for dep in dependencies:
        dependencies_by_task.setdefault(dep["task_id"], []).append(dep)

    def coordinator_worker():
        try:
            pending_tasks = {task["id"] for task in tasks}
            completed_task_ids = set()

            while pending_tasks:
                ready_batch = []
                for task_id in list(pending_tasks):
                    task = task_by_id[task_id]
                    if _dependencies_satisfied(
                        task, completed_task_ids, dependencies_by_task
                    ):
                        ready_batch.append(task)

                if not ready_batch:
                    raise RuntimeError(
                        "Dependency graph çözümlenemedi; bekleyen görevler kaldı"
                    )

                batch_threads = []
                batch_results = []

                def run_member_task(member, task):
                    db.update_team_task_status(task["id"], "running", blocked_reason="")
                    event_queue.put(
                        _event_payload(
                            {"type": "task_started", "member_id": member["id"]},
                            run["id"],
                            task["id"],
                        )
                    )

                    _run_member_agentic(
                        member,
                        formatted_message,
                        req.model or member.get("model") or "gpt-4o-mini",
                        clients,
                        team_id,
                        event_queue,
                        run["id"],
                        task["id"],
                        req.attachments,
                    )

                    member_messages = db.get_messages(member["chat_id"])
                    assistant_messages = [
                        m for m in member_messages if m.get("role") == "assistant"
                    ]
                    latest_reply = (
                        assistant_messages[-1]["content"] if assistant_messages else ""
                    )
                    extracted_files = (
                        extract_files_from_text(latest_reply) if latest_reply else []
                    )
                    batch_results.append((member, task, latest_reply, extracted_files))

                for task in ready_batch:
                    member = next(
                        (m for m in members if m["id"] == task["member_id"]), None
                    )
                    if not member:
                        continue
                    if task.get("status") == "blocked":
                        dep_list = dependencies_by_task.get(task["id"], [])
                        first_dep = dep_list[0] if dep_list else None
                        event_queue.put(
                            _event_payload(
                                {
                                    "type": "task_unblocked",
                                    "member_id": member["id"],
                                    "depends_on_member_id": task_by_id[
                                        first_dep["depends_on_task_id"]
                                    ]["member_id"]
                                    if first_dep
                                    else None,
                                    "depends_on_task_id": first_dep[
                                        "depends_on_task_id"
                                    ]
                                    if first_dep
                                    else None,
                                },
                                run["id"],
                                task["id"],
                            )
                        )
                    thread = threading.Thread(
                        target=run_member_task, args=(member, task), daemon=True
                    )
                    batch_threads.append(thread)
                    thread.start()

                for thread in batch_threads:
                    thread.join()

                for member, task, latest_reply, extracted_files in batch_results:
                    latest_task = db.get_team_task(task["id"])
                    _record_task_completion_artifacts(
                        run["id"],
                        team_id,
                        member,
                        task["id"],
                        latest_reply,
                        extracted_files,
                    )

                    downstream_tasks = [
                        dep
                        for dep in dependencies
                        if dep["depends_on_task_id"] == task["id"]
                    ]
                    for dep in downstream_tasks:
                        target_task = task_by_id.get(dep["task_id"])
                        if not target_task:
                            continue
                        target_member = next(
                            (m for m in members if m["id"] == target_task["member_id"]),
                            None,
                        )
                        if not target_member:
                            continue
                        handoff = _create_handoff_message(
                            run["id"],
                            team_id,
                            member,
                            target_member,
                            task["id"],
                            latest_reply,
                            extracted_files,
                        )
                        if handoff:
                            event_queue.put(
                                _event_payload(
                                    {
                                        "type": "agent_message",
                                        "member_id": target_member["id"],
                                        "from_member_id": member["id"],
                                        "message_type": handoff.get(
                                            "message_type", "handoff"
                                        ),
                                        "subject": handoff.get("subject", "Handoff"),
                                        "content": handoff.get("content", ""),
                                    },
                                    run["id"],
                                    target_task["id"],
                                )
                            )

                    if latest_task and latest_task.get("status") not in (
                        "failed",
                        "skipped",
                        "completed",
                    ):
                        db.update_team_task_status(task["id"], "completed")

                    completed_task_ids.add(task["id"])
                    pending_tasks.discard(task["id"])

            # Fallback: Tüm üyeler skip ettiyse en uygun üyeyi zorla çalıştır
            all_tasks_final = [db.get_team_task(t["id"]) for t in tasks]
            all_skipped = all(
                t and t.get("status") == "skipped" for t in all_tasks_final
            )
            if all_skipped and members:
                # En uygun üyeyi bul: frontend > general > ilk üye
                fallback_member = None
                for m in members:
                    stage = _infer_member_stage(m)
                    if stage == "frontend":
                        fallback_member = m
                        break
                if not fallback_member:
                    for m in members:
                        stage = _infer_member_stage(m)
                        if stage in ("general", "backend"):
                            fallback_member = m
                            break
                if not fallback_member:
                    fallback_member = members[0]

                fb_task = task_by_member.get(fallback_member["id"])
                if fb_task:
                    db.update_team_task_status(fb_task["id"], "running", blocked_reason="")
                    event_queue.put(
                        _event_payload(
                            {"type": "task_started", "member_id": fallback_member["id"]},
                            run["id"],
                            fb_task["id"],
                        )
                    )
                    _run_member_agentic(
                        fallback_member,
                        formatted_message,
                        req.model or fallback_member.get("model") or "gpt-4o-mini",
                        clients,
                        team_id,
                        event_queue,
                        run["id"],
                        fb_task["id"],
                        req.attachments,
                        force_relevant=True,
                    )
                    fb_messages = db.get_messages(fallback_member["chat_id"])
                    fb_assistant = [m for m in fb_messages if m.get("role") == "assistant"]
                    fb_reply = fb_assistant[-1]["content"] if fb_assistant else ""
                    fb_extracted = extract_files_from_text(fb_reply) if fb_reply else []
                    _record_task_completion_artifacts(
                        run["id"], team_id, fallback_member, fb_task["id"], fb_reply, fb_extracted
                    )
                    if fb_extracted:
                        saved = save_extracted_files_with_proposals(
                            team_id, fb_extracted, run_id=run["id"],
                            task_id=fb_task["id"], member_id=fallback_member["id"],
                        )
                    latest_fb = db.get_team_task(fb_task["id"])
                    if latest_fb and latest_fb.get("status") not in ("failed", "skipped", "completed"):
                        db.update_team_task_status(fb_task["id"], "completed")

            db.update_team_run_status(run["id"], "completed")
        except Exception as e:
            db.update_team_run_status(run["id"], "failed")
            event_queue.put(
                _event_payload({"type": "run_error", "error": str(e)}, run["id"])
            )
        finally:
            event_queue.put(_event_payload({"type": "all_done"}, run["id"]))

    worker = threading.Thread(target=coordinator_worker, daemon=True)
    worker.start()

    def sse_generator():
        members_info = [
            {
                "id": m["id"],
                "role_name": m["role_name"],
                "icon": m.get("icon", "🤖"),
                "task_id": task_by_member[m["id"]]["id"],
                "task_status": task_by_member[m["id"]]["status"],
            }
            for m in members
        ]
        yield f"data: {json.dumps({'type': 'start', 'run_id': run['id'], 'members': members_info, 'tasks': tasks, 'dependencies': dependencies}, ensure_ascii=False)}\n\n"

        for task in tasks:
            if task["status"] == "blocked":
                deps = db.get_task_dependencies(task["id"])
                dep_task_id = deps[0]["depends_on_task_id"] if deps else None
                dep_member_id = None
                if dep_task_id:
                    dep_task = db.get_team_task(dep_task_id)
                    dep_member_id = dep_task["member_id"] if dep_task else None
                blocked_event = _event_payload(
                    {
                        "type": "task_blocked",
                        "member_id": task["member_id"],
                        "blocked_reason": task.get("blocked_reason")
                        or "Bağımlılık bekleniyor",
                        "depends_on_task_id": dep_task_id,
                        "depends_on_member_id": dep_member_id,
                    },
                    run["id"],
                    task["id"],
                )
                yield f"data: {json.dumps(blocked_event, ensure_ascii=False)}\n\n"

        done_members = set()
        total_members = len(members)

        while len(done_members) < total_members:
            try:
                event = event_queue.get(timeout=120)

                if event.get("type") == "member_done":
                    done_members.add(event["member_id"])
                    db.update_team_task_status(event["task_id"], "completed")
                elif event.get("type") == "skipped":
                    db.update_team_task_status(
                        event["task_id"], "skipped", blocked_reason=event.get("reason")
                    )
                elif event.get("type") in ("error", "step_error"):
                    if event.get("task_id"):
                        db.update_team_task_status(event["task_id"], "failed")
                    if event.get("member_id"):
                        done_members.add(event["member_id"])

                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            except queue.Empty:
                yield f"data: {json.dumps({'type': 'heartbeat', 'run_id': run['id']}, ensure_ascii=False)}\n\n"

        worker.join(timeout=5)

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
