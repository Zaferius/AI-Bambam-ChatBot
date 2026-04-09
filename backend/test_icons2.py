import urllib.request
for i in ['openai', 'anthropic', 'meta', 'google', 'googlegemini', 'deepseek', 'groq', 'llama', 'gemini']:
    try:
        req = urllib.request.Request(f'https://cdn.jsdelivr.net/npm/simple-icons@v10/icons/{i}.svg', headers={'User-Agent': 'Mozilla/5.0'})
        print(f'{i}: ' + str(len(urllib.request.urlopen(req).read())))
    except Exception as e:
        print(f'{i}: {e}')
