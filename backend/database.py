import sqlite3
import json
import uuid
from datetime import datetime
from typing import List, Dict, Optional
import os

class DatabaseManager:
    def __init__(self, db_path: str = "bambam_chats.db"):
        self.db_path = db_path
        self.init_database()
    
    def get_connection(self):
        """Database bağlantısı oluştur"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def init_database(self):
        """Database tablolarını oluştur"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Users tablosu
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_login TEXT,
                is_active INTEGER DEFAULT 1
            )
        """)
        
        # Chats tablosu
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                user_id TEXT DEFAULT 'default',
                metadata TEXT,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        
        # Messages tablosu
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                model_name TEXT,
                images TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
            )
        """)
        
        # Long-term memory tablosu
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS long_term_memory (
                chat_id TEXT PRIMARY KEY,
                user_info TEXT,
                preferences TEXT,
                important_topics TEXT,
                last_updated TEXT NOT NULL,
                FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
            )
        """)
        
        # Index'ler
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        
        conn.commit()
        conn.close()
    
    # ===== CHAT OPERATIONS =====
    
    def create_chat(self, chat_id: str, title: str = "New Chat", user_id: str = "default") -> Dict:
        """Yeni chat oluştur"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        now = datetime.now().isoformat()
        
        cursor.execute("""
            INSERT INTO chats (id, title, created_at, updated_at, user_id)
            VALUES (?, ?, ?, ?, ?)
        """, (chat_id, title, now, now, user_id))
        
        conn.commit()
        conn.close()
        
        return {
            "id": chat_id,
            "title": title,
            "created_at": now,
            "updated_at": now,
            "user_id": user_id
        }
    
    def get_chat(self, chat_id: str) -> Optional[Dict]:
        """Chat bilgilerini getir"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM chats WHERE id = ?", (chat_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return dict(row)
        return None
    
    def list_chats(self, user_id: str = "default", limit: int = 100) -> List[Dict]:
        """Kullanıcının chatlerini listele"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT c.*, COUNT(m.id) as message_count
            FROM chats c
            LEFT JOIN messages m ON c.id = m.chat_id
            WHERE c.user_id = ?
            GROUP BY c.id
            ORDER BY c.updated_at DESC
            LIMIT ?
        """, (user_id, limit))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [dict(row) for row in rows]
    
    def update_chat_title(self, chat_id: str, title: str):
        """Chat başlığını güncelle"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE chats 
            SET title = ?, updated_at = ?
            WHERE id = ?
        """, (title, datetime.now().isoformat(), chat_id))
        
        conn.commit()
        conn.close()
    
    def delete_chat(self, chat_id: str):
        """Chat'i sil (messages cascade ile silinir)"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
        
        conn.commit()
        conn.close()
    
    def touch_chat(self, chat_id: str):
        """Chat'in updated_at'ini güncelle"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE chats 
            SET updated_at = ?
            WHERE id = ?
        """, (datetime.now().isoformat(), chat_id))
        
        conn.commit()
        conn.close()
    
    # ===== MESSAGE OPERATIONS =====
    
    def add_message(self, chat_id: str, role: str, content: str, 
                   model_name: Optional[str] = None, images: Optional[List[str]] = None):
        """Mesaj ekle"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Chat yoksa oluştur
        if not self.get_chat(chat_id):
            self.create_chat(chat_id)
        
        images_json = json.dumps(images) if images else None
        
        cursor.execute("""
            INSERT INTO messages (chat_id, role, content, model_name, images, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (chat_id, role, content, model_name, images_json, datetime.now().isoformat()))
        
        conn.commit()
        conn.close()
        
        # Chat'in updated_at'ini güncelle
        self.touch_chat(chat_id)
    
    def get_messages(self, chat_id: str, limit: Optional[int] = None, 
                    offset: int = 0) -> List[Dict]:
        """Chat mesajlarını getir"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        query = """
            SELECT * FROM messages 
            WHERE chat_id = ? 
            ORDER BY created_at ASC
        """
        
        params = [chat_id]
        
        if limit:
            query += " LIMIT ? OFFSET ?"
            params.extend([limit, offset])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        messages = []
        for row in rows:
            msg = dict(row)
            if msg['images']:
                msg['images'] = json.loads(msg['images'])
            messages.append(msg)
        
        return messages
    
    def get_message_count(self, chat_id: str) -> int:
        """Chat'teki mesaj sayısını getir"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) as count FROM messages WHERE chat_id = ?", (chat_id,))
        result = cursor.fetchone()
        conn.close()
        
        return result['count'] if result else 0
    
    def delete_old_messages(self, chat_id: str, keep_last: int = 500):
        """Eski mesajları sil, sadece son N mesajı tut"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM messages 
            WHERE chat_id = ? 
            AND id NOT IN (
                SELECT id FROM messages 
                WHERE chat_id = ? 
                ORDER BY created_at DESC 
                LIMIT ?
            )
        """, (chat_id, chat_id, keep_last))
        
        conn.commit()
        conn.close()
    
    # ===== MEMORY OPERATIONS =====
    
    def save_long_term_memory(self, chat_id: str, user_info: Dict, 
                             preferences: Dict, important_topics: List[str]):
        """Long-term memory kaydet"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT OR REPLACE INTO long_term_memory 
            (chat_id, user_info, preferences, important_topics, last_updated)
            VALUES (?, ?, ?, ?, ?)
        """, (
            chat_id,
            json.dumps(user_info),
            json.dumps(preferences),
            json.dumps(important_topics),
            datetime.now().isoformat()
        ))
        
        conn.commit()
        conn.close()
    
    def get_long_term_memory(self, chat_id: str) -> Optional[Dict]:
        """Long-term memory getir"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM long_term_memory WHERE chat_id = ?", (chat_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                'chat_id': row['chat_id'],
                'user_info': json.loads(row['user_info']) if row['user_info'] else {},
                'preferences': json.loads(row['preferences']) if row['preferences'] else {},
                'important_topics': json.loads(row['important_topics']) if row['important_topics'] else [],
                'last_updated': row['last_updated']
            }
        return None
    
    # ===== CLEANUP OPERATIONS =====
    
    def cleanup_old_chats(self, days: int = 30, user_id: str = "default"):
        """Eski chatları temizle"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cutoff_date = datetime.now().timestamp() - (days * 24 * 60 * 60)
        cutoff_iso = datetime.fromtimestamp(cutoff_date).isoformat()
        
        cursor.execute("""
            DELETE FROM chats 
            WHERE user_id = ? AND updated_at < ?
        """, (user_id, cutoff_iso))
        
        deleted = cursor.rowcount
        conn.commit()
        conn.close()
        
        return deleted
    
    def get_database_stats(self) -> Dict:
        """Database istatistikleri"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) as count FROM chats")
        total_chats = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM messages")
        total_messages = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM long_term_memory")
        total_memories = cursor.fetchone()['count']
        
        # Database boyutu
        db_size = os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0
        
        conn.close()
        
        return {
            'total_chats': total_chats,
            'total_messages': total_messages,
            'total_memories': total_memories,
            'database_size_mb': round(db_size / (1024 * 1024), 2)
        }
    
    # ===== USER OPERATIONS =====
    
    def create_user(self, email: str, username: str, password_hash: str) -> Optional[Dict]:
        """Yeni kullanıcı oluştur"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        user_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        
        try:
            cursor.execute("""
                INSERT INTO users (id, email, username, password_hash, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (user_id, email.lower(), username, password_hash, now))
            
            conn.commit()
            conn.close()
            
            return {
                "id": user_id,
                "email": email.lower(),
                "username": username,
                "created_at": now
            }
        except sqlite3.IntegrityError as e:
            conn.close()
            return None
    
    def get_user_by_email(self, email: str) -> Optional[Dict]:
        """Email ile kullanıcı getir"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM users WHERE email = ?", (email.lower(),))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return dict(row)
        return None
    
    def get_user_by_username(self, username: str) -> Optional[Dict]:
        """Username ile kullanıcı getir"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return dict(row)
        return None
    
    def get_user_by_id(self, user_id: str) -> Optional[Dict]:
        """ID ile kullanıcı getir"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return dict(row)
        return None
    
    def update_last_login(self, user_id: str):
        """Son giriş zamanını güncelle"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE users SET last_login = ? WHERE id = ?
        """, (datetime.now().isoformat(), user_id))
        
        conn.commit()
        conn.close()
