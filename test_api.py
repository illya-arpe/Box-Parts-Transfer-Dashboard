import urllib.request
import json

url = 'http://127.0.0.1:8000/api/snapshots/template'
try:
    with urllib.request.urlopen(url) as response:
        data = response.read()
        print(f"Status: {response.status}")
        print(f"Content-Type: {response.headers.get('Content-Type')}")
        print(f"Content-Length: {len(data)}")
        print(f"First bytes: {data[:20]}")
except Exception as e:
    print(f"Error: {e}")
