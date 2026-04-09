import sqlite3

db_name = 'bambam_chats.db'
conn = sqlite3.connect(db_name)
cur = conn.cursor()

# Delete all messages first (foreign key)
cur.execute("DELETE FROM messages")
deleted_msgs = cur.rowcount
print(f"Deleted {deleted_msgs} messages")

# Delete all chats
cur.execute("DELETE FROM chats")
deleted_chats = cur.rowcount
print(f"Deleted {deleted_chats} chats")

conn.commit()
conn.close()
print("Done. Database cleared.")
