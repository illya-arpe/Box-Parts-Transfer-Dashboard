import os
import shutil

backend_dir = r"D:\software\Cursor\Test\backend"
removed = 0

for root, dirs, files in os.walk(backend_dir):
    for d in dirs:
        if d == '__pycache__':
            path = os.path.join(root, d)
            shutil.rmtree(path)
            print(f"Removed: {path}")
            removed += 1
    for f in files:
        if f.endswith('.pyc'):
            path = os.path.join(root, f)
            os.remove(path)
            print(f"Removed: {path}")
            removed += 1

print(f"\nDone. Removed {removed} items.")
