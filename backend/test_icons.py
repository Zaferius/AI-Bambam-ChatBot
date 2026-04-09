import urllib.request
def check(name):
    try:
        url = f"https://cdn.simpleicons.org/{name}"
        urllib.request.urlopen(urllib.request.Request(url, method='HEAD'))
        print(f"{name}: OK")
    except Exception as e:
        print(f"{name}: Failed")

for i in ['openai', 'anthropic', 'meta', 'google', 'googlegemini', 'deepseek', 'groq']:
    check(i)
