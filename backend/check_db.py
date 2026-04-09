import sqlite3

db_name = 'bambam_chats.db'
conn = sqlite3.connect(db_name)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print('=== USERS ===')
cur.execute("SELECT id, email, username, created_at FROM users LIMIT 10")
for r in cur.fetchall():
    print(dict(r))

print('\n=== CHATS (user_id = default OR real user) ===')
users = conn.cursor()
users.execute("SELECT id FROM users LIMIT 1")
u = users.fetchone()
user_id = u['id'] if u else 'default'
print(f'Testing with user_id: {user_id}')

cur.execute("""
    SELECT c.id, c.title, c.user_id, c.updated_at, COUNT(m.id) as message_count
    FROM chats c
    LEFT JOIN messages m ON c.id = m.chat_id
    WHERE c.user_id = ? OR c.user_id = 'default'
    GROUP BY c.id
    ORDER BY c.updated_at DESC
    LIMIT 20
""", (user_id,))
rows = cur.fetchall()
print(f'Found {len(rows)} chats:')
for r in rows:
    print(' -', dict(r))

conn.close()
