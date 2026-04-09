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

        # Teams tablosu
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)

        # Team Members tablosu (her üye bir AI rolü)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS team_members (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                role_name TEXT NOT NULL,
                description TEXT,
                system_prompt TEXT NOT NULL,
                icon TEXT DEFAULT '🤖',
                model TEXT DEFAULT 'gpt-4o-mini',
                depends_on TEXT,
                chat_id TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
                FOREIGN KEY (chat_id) REFERENCES chats (id)
            )
        """)

        cursor.execute("PRAGMA table_info(team_members)")
        team_member_columns = [row[1] for row in cursor.fetchall()]
        if "depends_on" not in team_member_columns:
            cursor.execute("ALTER TABLE team_members ADD COLUMN depends_on TEXT")

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS team_projects (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                name TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE
            )
        """
        )
        cursor.execute("PRAGMA table_info(teams)")
        team_columns = [row[1] for row in cursor.fetchall()]
        if "active_project_id" not in team_columns:
            cursor.execute("ALTER TABLE teams ADD COLUMN active_project_id TEXT")

        # Index'ler
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)"
        )
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id)")
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at)"
        )
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)"
        )
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_teams_user_id ON teams(user_id)")
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_team_projects_team_id ON team_projects(team_id)"
        )

        # Collaboration runs
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS team_runs (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                prompt TEXT NOT NULL,
                model TEXT,
                status TEXT NOT NULL DEFAULT 'running',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT,
                FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS team_tasks (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                team_id TEXT NOT NULL,
                member_id TEXT NOT NULL,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                task_order INTEGER NOT NULL DEFAULT 0,
                blocked_reason TEXT,
                step_count INTEGER DEFAULT 0,
                started_at TEXT,
                completed_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (run_id) REFERENCES team_runs (id) ON DELETE CASCADE,
                FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
                FOREIGN KEY (member_id) REFERENCES team_members (id) ON DELETE CASCADE
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS task_dependencies (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                depends_on_task_id TEXT NOT NULL,
                dependency_type TEXT NOT NULL DEFAULT 'hard',
                created_at TEXT NOT NULL,
                FOREIGN KEY (task_id) REFERENCES team_tasks (id) ON DELETE CASCADE,
                FOREIGN KEY (depends_on_task_id) REFERENCES team_tasks (id) ON DELETE CASCADE
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS agent_messages (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                team_id TEXT NOT NULL,
                from_member_id TEXT,
                to_member_id TEXT,
                task_id TEXT,
                message_type TEXT NOT NULL,
                subject TEXT,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (run_id) REFERENCES team_runs (id) ON DELETE CASCADE,
                FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
                FOREIGN KEY (from_member_id) REFERENCES team_members (id) ON DELETE SET NULL,
                FOREIGN KEY (to_member_id) REFERENCES team_members (id) ON DELETE SET NULL,
                FOREIGN KEY (task_id) REFERENCES team_tasks (id) ON DELETE SET NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS project_memory (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                team_id TEXT NOT NULL,
                member_id TEXT,
                memory_type TEXT NOT NULL,
                title TEXT,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (run_id) REFERENCES team_runs (id) ON DELETE CASCADE,
                FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
                FOREIGN KEY (member_id) REFERENCES team_members (id) ON DELETE SET NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS file_locks (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                run_id TEXT,
                task_id TEXT,
                member_id TEXT,
                file_path TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL,
                released_at TEXT,
                FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
                FOREIGN KEY (run_id) REFERENCES team_runs (id) ON DELETE CASCADE,
                FOREIGN KEY (task_id) REFERENCES team_tasks (id) ON DELETE SET NULL,
                FOREIGN KEY (member_id) REFERENCES team_members (id) ON DELETE SET NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS file_proposals (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                run_id TEXT,
                task_id TEXT,
                member_id TEXT,
                file_path TEXT NOT NULL,
                content TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                applied_at TEXT,
                FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
                FOREIGN KEY (run_id) REFERENCES team_runs (id) ON DELETE CASCADE,
                FOREIGN KEY (task_id) REFERENCES team_tasks (id) ON DELETE SET NULL,
                FOREIGN KEY (member_id) REFERENCES team_members (id) ON DELETE SET NULL
            )
        """)

        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_team_runs_team_id ON team_runs(team_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_team_runs_status ON team_runs(status)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_team_tasks_run_id ON team_tasks(run_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_team_tasks_member_id ON team_tasks(member_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_team_tasks_status ON team_tasks(status)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_agent_messages_run_id ON agent_messages(run_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_agent_messages_to_member_id ON agent_messages(to_member_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_project_memory_run_id ON project_memory(run_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_project_memory_team_id ON project_memory(team_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_file_locks_team_path ON file_locks(team_id, file_path)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_file_proposals_team_path ON file_proposals(team_id, file_path)"
        )

        # ── Credit System ─────────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_credits (
                user_id  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                balance  REAL NOT NULL DEFAULT 20.0,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                type        TEXT NOT NULL,
                amount      REAL NOT NULL,
                description TEXT,
                model       TEXT,
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)

        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)"
        )

        conn.commit()
        conn.close()

    # ===== CHAT OPERATIONS =====

    def create_chat(
        self, chat_id: str, title: str = "New Chat", user_id: str = "default"
    ) -> Dict:
        """Yeni chat oluştur"""
        conn = self.get_connection()
        cursor = conn.cursor()

        now = datetime.now().isoformat()

        cursor.execute(
            """
            INSERT INTO chats (id, title, created_at, updated_at, user_id)
            VALUES (?, ?, ?, ?, ?)
        """,
            (chat_id, title, now, now, user_id),
        )

        conn.commit()
        conn.close()

        return {
            "id": chat_id,
            "title": title,
            "created_at": now,
            "updated_at": now,
            "user_id": user_id,
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

        cursor.execute(
            """
            SELECT c.*, COUNT(m.id) as message_count
            FROM chats c
            LEFT JOIN messages m ON c.id = m.chat_id
            WHERE c.user_id = ?
            GROUP BY c.id
            ORDER BY c.updated_at DESC
            LIMIT ?
        """,
            (user_id, limit),
        )

        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def update_chat_title(self, chat_id: str, title: str):
        """Chat başlığını güncelle"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            UPDATE chats 
            SET title = ?, updated_at = ?
            WHERE id = ?
        """,
            (title, datetime.now().isoformat(), chat_id),
        )

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

        cursor.execute(
            """
            UPDATE chats 
            SET updated_at = ?
            WHERE id = ?
        """,
            (datetime.now().isoformat(), chat_id),
        )

        conn.commit()
        conn.close()

    # ===== MESSAGE OPERATIONS =====

    def add_message(
        self,
        chat_id: str,
        role: str,
        content: str,
        model_name: Optional[str] = None,
        images: Optional[List[str]] = None,
    ):
        """Mesaj ekle"""
        conn = self.get_connection()
        cursor = conn.cursor()

        # Chat yoksa oluştur
        if not self.get_chat(chat_id):
            self.create_chat(chat_id)

        images_json = json.dumps(images) if images else None

        cursor.execute(
            """
            INSERT INTO messages (chat_id, role, content, model_name, images, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """,
            (
                chat_id,
                role,
                content,
                model_name,
                images_json,
                datetime.now().isoformat(),
            ),
        )

        conn.commit()
        conn.close()

        # Chat'in updated_at'ini güncelle
        self.touch_chat(chat_id)

    def get_messages(
        self, chat_id: str, limit: Optional[int] = None, offset: int = 0
    ) -> List[Dict]:
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
            if msg["images"]:
                msg["images"] = json.loads(msg["images"])
            messages.append(msg)

        return messages

    def get_message_count(self, chat_id: str) -> int:
        """Chat'teki mesaj sayısını getir"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT COUNT(*) as count FROM messages WHERE chat_id = ?", (chat_id,)
        )
        result = cursor.fetchone()
        conn.close()

        return result["count"] if result else 0

    def delete_old_messages(self, chat_id: str, keep_last: int = 500):
        """Eski mesajları sil, sadece son N mesajı tut"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            DELETE FROM messages 
            WHERE chat_id = ? 
            AND id NOT IN (
                SELECT id FROM messages 
                WHERE chat_id = ? 
                ORDER BY created_at DESC 
                LIMIT ?
            )
        """,
            (chat_id, chat_id, keep_last),
        )

        conn.commit()
        conn.close()

    # ===== MEMORY OPERATIONS =====

    def save_long_term_memory(
        self,
        chat_id: str,
        user_info: Dict,
        preferences: Dict,
        important_topics: List[str],
    ):
        """Long-term memory kaydet"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            INSERT OR REPLACE INTO long_term_memory 
            (chat_id, user_info, preferences, important_topics, last_updated)
            VALUES (?, ?, ?, ?, ?)
        """,
            (
                chat_id,
                json.dumps(user_info),
                json.dumps(preferences),
                json.dumps(important_topics),
                datetime.now().isoformat(),
            ),
        )

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
                "chat_id": row["chat_id"],
                "user_info": json.loads(row["user_info"]) if row["user_info"] else {},
                "preferences": json.loads(row["preferences"])
                if row["preferences"]
                else {},
                "important_topics": json.loads(row["important_topics"])
                if row["important_topics"]
                else [],
                "last_updated": row["last_updated"],
            }
        return None

    # ===== CLEANUP OPERATIONS =====

    def cleanup_old_chats(self, days: int = 30, user_id: str = "default"):
        """Eski chatları temizle"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cutoff_date = datetime.now().timestamp() - (days * 24 * 60 * 60)
        cutoff_iso = datetime.fromtimestamp(cutoff_date).isoformat()

        cursor.execute(
            """
            DELETE FROM chats 
            WHERE user_id = ? AND updated_at < ?
        """,
            (user_id, cutoff_iso),
        )

        deleted = cursor.rowcount
        conn.commit()
        conn.close()

        return deleted

    def get_database_stats(self) -> Dict:
        """Database istatistikleri"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as count FROM chats")
        total_chats = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) as count FROM messages")
        total_messages = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) as count FROM long_term_memory")
        total_memories = cursor.fetchone()["count"]

        # Database boyutu
        db_size = os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0

        conn.close()

        return {
            "total_chats": total_chats,
            "total_messages": total_messages,
            "total_memories": total_memories,
            "database_size_mb": round(db_size / (1024 * 1024), 2),
        }

    # ===== USER OPERATIONS =====

    def create_user(
        self, email: str, username: str, password_hash: str
    ) -> Optional[Dict]:
        """Yeni kullanıcı oluştur"""
        conn = self.get_connection()
        cursor = conn.cursor()

        user_id = str(uuid.uuid4())
        now = datetime.now().isoformat()

        try:
            cursor.execute(
                """
                INSERT INTO users (id, email, username, password_hash, created_at)
                VALUES (?, ?, ?, ?, ?)
            """,
                (user_id, email.lower(), username, password_hash, now),
            )

            conn.commit()
            conn.close()

            return {
                "id": user_id,
                "email": email.lower(),
                "username": username,
                "created_at": now,
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

        cursor.execute(
            """
            UPDATE users SET last_login = ? WHERE id = ?
        """,
            (datetime.now().isoformat(), user_id),
        )

        conn.commit()
        conn.close()

    # ===== CREDIT OPERATIONS =====

    def init_user_credits(self, user_id: str, initial_balance: float = 20.0):
        """Yeni kullanıcı için kredi kaydı oluştur (signup'ta çağrılır)."""
        conn = self.get_connection()
        cursor = conn.cursor()
        from datetime import datetime as _dt
        now = _dt.now().isoformat()
        cursor.execute(
            """
            INSERT OR IGNORE INTO user_credits (user_id, balance, updated_at)
            VALUES (?, ?, ?)
            """,
            (user_id, initial_balance, now),
        )
        # Record the welcome bonus transaction
        cursor.execute(
            """
            INSERT INTO transactions (user_id, type, amount, description, created_at)
            VALUES (?, 'bonus', ?, 'Welcome bonus credits', ?)
            """,
            (user_id, initial_balance, now),
        )
        conn.commit()
        conn.close()

    def get_credits(self, user_id: str) -> float:
        """Kullanıcının kredi bakiyesini getir."""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT balance FROM user_credits WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return float(row["balance"])
        # Auto-initialize if missing
        self.init_user_credits(user_id, 0.0)
        return 0.0

    def deduct_credits(self, user_id: str, amount: float, description: str = "", model: str = "") -> bool:
        """Krediyi düş. Yetersizse False döner."""
        conn = self.get_connection()
        cursor = conn.cursor()
        from datetime import datetime as _dt
        now = _dt.now().isoformat()

        cursor.execute("SELECT balance FROM user_credits WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        if not row or float(row["balance"]) < amount:
            conn.close()
            return False

        new_balance = float(row["balance"]) - amount
        cursor.execute(
            "UPDATE user_credits SET balance = ?, updated_at = ? WHERE user_id = ?",
            (new_balance, now, user_id),
        )
        cursor.execute(
            """
            INSERT INTO transactions (user_id, type, amount, description, model, created_at)
            VALUES (?, 'use', ?, ?, ?, ?)
            """,
            (user_id, -amount, description, model or None, now),
        )
        conn.commit()
        conn.close()
        return True

    def add_credits(self, user_id: str, amount: float, description: str = "Top-up") -> float:
        """Kredi ekle; yeni bakiyeyi döner."""
        conn = self.get_connection()
        cursor = conn.cursor()
        from datetime import datetime as _dt
        now = _dt.now().isoformat()

        cursor.execute("SELECT balance FROM user_credits WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        current = float(row["balance"]) if row else 0.0
        new_balance = current + amount

        cursor.execute(
            """
            INSERT INTO user_credits (user_id, balance, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET balance = ?, updated_at = ?
            """,
            (user_id, new_balance, now, new_balance, now),
        )
        cursor.execute(
            """
            INSERT INTO transactions (user_id, type, amount, description, created_at)
            VALUES (?, 'purchase', ?, ?, ?)
            """,
            (user_id, amount, description, now),
        )
        conn.commit()
        conn.close()
        return new_balance

    def get_transactions(self, user_id: str, limit: int = 50) -> list:
        """Kullanıcının işlem geçmişini getir."""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM transactions
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (user_id, limit),
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    # ===== TEAM OPERATIONS =====

    def create_team(self, name: str, user_id: str, description: str = None) -> Dict:
        """Yeni takım oluştur"""
        conn = self.get_connection()
        cursor = conn.cursor()

        team_id = str(uuid.uuid4())
        now = datetime.now().isoformat()

        cursor.execute(
            """
            INSERT INTO teams (id, name, description, user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """,
            (team_id, name, description, user_id, now, now),
        )

        conn.commit()
        conn.close()

        return {
            "id": team_id,
            "name": name,
            "description": description,
            "user_id": user_id,
            "created_at": now,
            "updated_at": now,
        }

    def get_teams_by_user(self, user_id: str) -> List[Dict]:
        """Kullanıcının takımlarını getir"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT * FROM teams WHERE user_id = ? ORDER BY updated_at DESC
        """,
            (user_id,),
        )
        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def get_team(self, team_id: str) -> Optional[Dict]:
        """Takım detayını getir"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM teams WHERE id = ?", (team_id,))
        row = cursor.fetchone()
        conn.close()

        if row:
            return dict(row)
        return None

    def delete_team(self, team_id: str) -> bool:
        """Takımı ve üyelerini sil"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM team_members WHERE team_id = ?", (team_id,))
        cursor.execute("DELETE FROM teams WHERE id = ?", (team_id,))

        conn.commit()
        conn.close()
        return True

    def update_team(
        self, team_id: str, name: str = None, description: str = None
    ) -> Optional[Dict]:
        """Takım bilgilerini güncelle"""
        conn = self.get_connection()
        cursor = conn.cursor()

        updates = []
        params = []
        if name is not None:
            updates.append("name = ?")
            params.append(name)
        if description is not None:
            updates.append("description = ?")
            params.append(description)

        if not updates:
            conn.close()
            return self.get_team(team_id)

        updates.append("updated_at = ?")
        params.append(datetime.now().isoformat())
        params.append(team_id)

        cursor.execute(f"UPDATE teams SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
        conn.close()

        return self.get_team(team_id)

    # ===== TEAM MEMBER OPERATIONS =====

    def add_team_member(
        self,
        team_id: str,
        role_name: str,
        system_prompt: str,
        description: str = None,
        icon: str = "🤖",
        model: str = "gpt-4o-mini",
        depends_on: Optional[List[str]] = None,
    ) -> Dict:
        """Takıma yeni üye (AI rolü) ekle"""
        conn = self.get_connection()
        cursor = conn.cursor()

        member_id = str(uuid.uuid4())
        now = datetime.now().isoformat()

        # Bu üye için otomatik bir chat oluştur
        chat_id = str(uuid.uuid4())
        cursor.execute(
            """
            INSERT INTO chats (id, title, created_at, updated_at, user_id)
            VALUES (?, ?, ?, ?, ?)
        """,
            (chat_id, f"{role_name} Chat", now, now, "default"),
        )

        cursor.execute(
            """
            INSERT INTO team_members (id, team_id, role_name, description, system_prompt, icon, model, depends_on, chat_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                member_id,
                team_id,
                role_name,
                description,
                system_prompt,
                icon,
                model,
                json.dumps(depends_on or []),
                chat_id,
                now,
            ),
        )

        # Takımın updated_at güncelle
        cursor.execute("UPDATE teams SET updated_at = ? WHERE id = ?", (now, team_id))

        conn.commit()
        conn.close()

        return {
            "id": member_id,
            "team_id": team_id,
            "role_name": role_name,
            "description": description,
            "system_prompt": system_prompt,
            "icon": icon,
            "model": model,
            "depends_on": depends_on or [],
            "chat_id": chat_id,
            "created_at": now,
        }

    def _deserialize_team_member(self, row) -> Dict:
        member = dict(row)
        raw_depends_on = member.get("depends_on")
        if raw_depends_on:
            try:
                member["depends_on"] = json.loads(raw_depends_on)
            except Exception:
                member["depends_on"] = []
        else:
            member["depends_on"] = []
        return member

    def update_team_member(
        self,
        member_id: str,
        role_name: str = None,
        description: str = None,
        system_prompt: str = None,
        icon: str = None,
        model: str = None,
        depends_on: Optional[List[str]] = None,
    ) -> Optional[Dict]:
        """Takım üyesi alanlarını güncelle"""
        conn = self.get_connection()
        cursor = conn.cursor()

        updates = []
        params = []
        if role_name is not None:
            updates.append("role_name = ?")
            params.append(role_name)
        if description is not None:
            updates.append("description = ?")
            params.append(description)
        if system_prompt is not None:
            updates.append("system_prompt = ?")
            params.append(system_prompt)
        if icon is not None:
            updates.append("icon = ?")
            params.append(icon)
        if model is not None:
            updates.append("model = ?")
            params.append(model)
        if depends_on is not None:
            updates.append("depends_on = ?")
            params.append(json.dumps(depends_on))

        if not updates:
            conn.close()
            return self.get_team_member(member_id)

        params.append(member_id)
        cursor.execute(
            f"UPDATE team_members SET {', '.join(updates)} WHERE id = ?", params
        )
        conn.commit()
        conn.close()

        return self.get_team_member(member_id)

    def create_team_project(
        self, team_id: str, name: str, set_active: bool = True
    ) -> Dict:
        conn = self.get_connection()
        cursor = conn.cursor()
        project_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        if set_active:
            cursor.execute(
                "UPDATE team_projects SET is_active = 0 WHERE team_id = ?", (team_id,)
            )
        cursor.execute(
            "INSERT INTO team_projects (id, team_id, name, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (project_id, team_id, name, 1 if set_active else 0, now, now),
        )
        if set_active:
            cursor.execute(
                "UPDATE teams SET active_project_id = ?, updated_at = ? WHERE id = ?",
                (project_id, now, team_id),
            )
        conn.commit()
        conn.close()
        return self.get_team_project(project_id)

    def list_team_projects(self, team_id: str) -> List[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM team_projects WHERE team_id = ? ORDER BY created_at ASC",
            (team_id,),
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_team_project(self, project_id: str) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM team_projects WHERE id = ?", (project_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def set_active_team_project(self, team_id: str, project_id: str) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        now = datetime.now().isoformat()
        cursor.execute(
            "UPDATE team_projects SET is_active = 0 WHERE team_id = ?", (team_id,)
        )
        cursor.execute(
            "UPDATE team_projects SET is_active = 1, updated_at = ? WHERE id = ? AND team_id = ?",
            (now, project_id, team_id),
        )
        cursor.execute(
            "UPDATE teams SET active_project_id = ?, updated_at = ? WHERE id = ?",
            (project_id, now, team_id),
        )
        conn.commit()
        conn.close()
        return self.get_team_project(project_id)

    def delete_team_project(self, team_id: str, project_id: str) -> bool:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT is_active FROM team_projects WHERE id = ? AND team_id = ?",
            (project_id, team_id),
        )
        row = cursor.fetchone()
        if not row:
            conn.close()
            return False
        was_active = bool(row[0])
        cursor.execute(
            "DELETE FROM team_projects WHERE id = ? AND team_id = ?",
            (project_id, team_id),
        )
        if was_active:
            cursor.execute(
                "UPDATE teams SET active_project_id = NULL WHERE id = ?", (team_id,)
            )
        conn.commit()
        conn.close()
        return True

    def get_active_team_project(self, team_id: str) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT active_project_id FROM teams WHERE id = ?", (team_id,))
        row = cursor.fetchone()
        conn.close()
        if row and row[0]:
            return self.get_team_project(row[0])
        projects = self.list_team_projects(team_id)
        return next((p for p in projects if p.get("is_active")), None)

    def get_team_members(self, team_id: str) -> List[Dict]:
        """Takım üyelerini getir"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT * FROM team_members WHERE team_id = ? ORDER BY created_at ASC
        """,
            (team_id,),
        )
        rows = cursor.fetchall()
        conn.close()

        return [self._deserialize_team_member(row) for row in rows]

    def get_team_member(self, member_id: str) -> Optional[Dict]:
        """Tek bir üyeyi getir"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM team_members WHERE id = ?", (member_id,))
        row = cursor.fetchone()
        conn.close()

        if row:
            return self._deserialize_team_member(row)
        return None

    def delete_team_member(self, member_id: str) -> bool:
        """Takım üyesini sil"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
        conn.commit()
        conn.close()
        return True

    # ===== COLLABORATION RUN OPERATIONS =====

    def create_team_run(
        self, team_id: str, user_id: str, prompt: str, model: str = None
    ) -> Dict:
        conn = self.get_connection()
        cursor = conn.cursor()

        run_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        cursor.execute(
            """
            INSERT INTO team_runs (id, team_id, user_id, prompt, model, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'running', ?, ?)
            """,
            (run_id, team_id, user_id, prompt, model, now, now),
        )

        conn.commit()
        conn.close()

        return {
            "id": run_id,
            "team_id": team_id,
            "user_id": user_id,
            "prompt": prompt,
            "model": model,
            "status": "running",
            "created_at": now,
            "updated_at": now,
            "completed_at": None,
        }

    def update_team_run_status(self, run_id: str, status: str) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        now = datetime.now().isoformat()
        completed_at = now if status in ("completed", "failed", "cancelled") else None

        cursor.execute(
            """
            UPDATE team_runs
            SET status = ?, updated_at = ?, completed_at = COALESCE(?, completed_at)
            WHERE id = ?
            """,
            (status, now, completed_at, run_id),
        )

        conn.commit()
        conn.close()
        return self.get_team_run(run_id)

    def get_team_run(self, run_id: str) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM team_runs WHERE id = ?", (run_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def create_team_task(
        self,
        run_id: str,
        team_id: str,
        member_id: str,
        title: str,
        task_order: int,
        status: str = "pending",
        blocked_reason: str = None,
    ) -> Dict:
        conn = self.get_connection()
        cursor = conn.cursor()

        task_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        cursor.execute(
            """
            INSERT INTO team_tasks
            (id, run_id, team_id, member_id, title, status, task_order, blocked_reason, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                run_id,
                team_id,
                member_id,
                title,
                status,
                task_order,
                blocked_reason,
                now,
                now,
            ),
        )

        conn.commit()
        conn.close()
        return self.get_team_task(task_id)

    def get_team_task(self, task_id: str) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM team_tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def list_team_tasks(self, run_id: str) -> List[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM team_tasks WHERE run_id = ? ORDER BY task_order ASC, created_at ASC",
            (run_id,),
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def update_team_task_status(
        self,
        task_id: str,
        status: str,
        blocked_reason: str = None,
        step_count: int = None,
    ) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        now = datetime.now().isoformat()

        updates = ["status = ?", "updated_at = ?"]
        params = [status, now]

        if blocked_reason is not None:
            updates.append("blocked_reason = ?")
            params.append(blocked_reason)
        if step_count is not None:
            updates.append("step_count = ?")
            params.append(step_count)
        if status == "running":
            updates.append("started_at = COALESCE(started_at, ?)")
            params.append(now)
        if status in ("completed", "failed", "cancelled", "skipped"):
            updates.append("completed_at = ?")
            params.append(now)

        params.append(task_id)
        cursor.execute(
            f"UPDATE team_tasks SET {', '.join(updates)} WHERE id = ?", params
        )
        conn.commit()
        conn.close()
        return self.get_team_task(task_id)

    def create_task_dependency(
        self, task_id: str, depends_on_task_id: str, dependency_type: str = "hard"
    ) -> Dict:
        conn = self.get_connection()
        cursor = conn.cursor()

        dep_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        cursor.execute(
            """
            INSERT INTO task_dependencies (id, task_id, depends_on_task_id, dependency_type, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (dep_id, task_id, depends_on_task_id, dependency_type, now),
        )
        conn.commit()
        conn.close()

        return {
            "id": dep_id,
            "task_id": task_id,
            "depends_on_task_id": depends_on_task_id,
            "dependency_type": dependency_type,
            "created_at": now,
        }

    def list_task_dependencies(self, run_id: str) -> List[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT td.*
            FROM task_dependencies td
            JOIN team_tasks tt ON tt.id = td.task_id
            WHERE tt.run_id = ?
            ORDER BY tt.task_order ASC
            """,
            (run_id,),
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_task_dependencies(self, task_id: str) -> List[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM task_dependencies WHERE task_id = ? ORDER BY created_at ASC",
            (task_id,),
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def create_agent_message(
        self,
        run_id: str,
        team_id: str,
        from_member_id: Optional[str],
        to_member_id: Optional[str],
        task_id: Optional[str],
        message_type: str,
        content: str,
        subject: Optional[str] = None,
    ) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()

        message_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        cursor.execute(
            """
            INSERT INTO agent_messages
            (id, run_id, team_id, from_member_id, to_member_id, task_id, message_type, subject, content, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                message_id,
                run_id,
                team_id,
                from_member_id,
                to_member_id,
                task_id,
                message_type,
                subject,
                content,
                now,
            ),
        )
        conn.commit()
        conn.close()
        return self.get_agent_message(message_id)

    def get_agent_message(self, message_id: str) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM agent_messages WHERE id = ?", (message_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def list_agent_messages(
        self,
        run_id: str,
        to_member_id: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> List[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        query = "SELECT * FROM agent_messages WHERE run_id = ?"
        params = [run_id]
        if to_member_id:
            query += " AND (to_member_id = ? OR to_member_id IS NULL)"
            params.append(to_member_id)
        query += " ORDER BY created_at ASC"
        if limit is not None:
            query += " LIMIT ?"
            params.append(limit)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def add_project_memory(
        self,
        run_id: str,
        team_id: str,
        memory_type: str,
        content: str,
        title: Optional[str] = None,
        member_id: Optional[str] = None,
    ) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()

        memory_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        cursor.execute(
            """
            INSERT INTO project_memory
            (id, run_id, team_id, member_id, memory_type, title, content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                memory_id,
                run_id,
                team_id,
                member_id,
                memory_type,
                title,
                content,
                now,
                now,
            ),
        )
        conn.commit()
        conn.close()
        return self.get_project_memory_item(memory_id)

    def get_project_memory_item(self, memory_id: str) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM project_memory WHERE id = ?", (memory_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def list_project_memory(
        self,
        run_id: str,
        memory_type: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> List[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        query = "SELECT * FROM project_memory WHERE run_id = ?"
        params = [run_id]
        if memory_type:
            query += " AND memory_type = ?"
            params.append(memory_type)
        query += " ORDER BY updated_at ASC"
        if limit is not None:
            query += " LIMIT ?"
            params.append(limit)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_active_file_lock(self, team_id: str, file_path: str) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM file_locks
            WHERE team_id = ? AND file_path = ? AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
            """,
            (team_id, file_path),
        )
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def create_file_lock(
        self,
        team_id: str,
        file_path: str,
        run_id: Optional[str] = None,
        task_id: Optional[str] = None,
        member_id: Optional[str] = None,
    ) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        lock_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        cursor.execute(
            """
            INSERT INTO file_locks
            (id, team_id, run_id, task_id, member_id, file_path, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
            """,
            (lock_id, team_id, run_id, task_id, member_id, file_path, now),
        )
        conn.commit()
        conn.close()
        return self.get_active_file_lock(team_id, file_path)

    def release_file_lock(self, lock_id: str) -> None:
        conn = self.get_connection()
        cursor = conn.cursor()
        now = datetime.now().isoformat()
        cursor.execute(
            "UPDATE file_locks SET status = 'released', released_at = ? WHERE id = ?",
            (now, lock_id),
        )
        conn.commit()
        conn.close()

    def create_file_proposal(
        self,
        team_id: str,
        file_path: str,
        content: str,
        run_id: Optional[str] = None,
        task_id: Optional[str] = None,
        member_id: Optional[str] = None,
        status: str = "pending",
    ) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        proposal_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        cursor.execute(
            """
            INSERT INTO file_proposals
            (id, team_id, run_id, task_id, member_id, file_path, content, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                proposal_id,
                team_id,
                run_id,
                task_id,
                member_id,
                file_path,
                content,
                status,
                now,
            ),
        )
        conn.commit()
        conn.close()
        return self.get_file_proposal(proposal_id)

    def get_file_proposal(self, proposal_id: str) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM file_proposals WHERE id = ?", (proposal_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def update_file_proposal_status(
        self, proposal_id: str, status: str
    ) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        now = datetime.now().isoformat()
        if status == "applied":
            cursor.execute(
                "UPDATE file_proposals SET status = ?, applied_at = ? WHERE id = ?",
                (status, now, proposal_id),
            )
        else:
            cursor.execute(
                "UPDATE file_proposals SET status = ? WHERE id = ?",
                (status, proposal_id),
            )
        conn.commit()
        conn.close()
        return self.get_file_proposal(proposal_id)

    def list_file_proposals(self, run_id: str) -> List[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM file_proposals WHERE run_id = ? ORDER BY created_at ASC",
            (run_id,),
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]
