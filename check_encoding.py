import requests
import base64

r = requests.get('https://docs.google.com/spreadsheets/d/1H4Dyg4ZAf4kJ3C-MEInm4zAT9XyQRDfCl4KgIWkywyM/export?format=csv', timeout=30)
headers = r.text.split('\n')[0].split(',')

actual = headers[0].strip()
actual_hex = actual.encode('utf-8').hex()

with open('result.txt', 'w', encoding='utf-8') as f:
    f.write(f"First header: {actual}\n")
    f.write(f"First header hex: {actual_hex}\n\n")

    # Check if it's double-encoded GB2312
    # GB2312 '国' = E5 9B BD
    # GB2312 '家' = E5 AE B6
    # If these are double-encoded via Latin-1:
    # E5 -> C3 A5, 9B -> C2 9B, BD -> C2 BD
    # So '国家' double-encoded would be: C3 A5 C2 9B C2 BD C3 A5 C2 AE C2 B6

    f.write("Expected hex values:\n")
    f.write("- GB2312 '国家': e59bbde5aeb6\n")
    f.write("- Big5 '國家': e59c8be5aeb6\n")
    f.write("- UTF-8 '国家': e59bbde5aeb6\n")
    f.write("- UTF-8 '國家': e59c8be5aeb6\n\n")

    f.write(f"Actual hex: {actual_hex}\n\n")

    # Try to decode with Latin-1 first, then GB2312
    try:
        latin1_decoded = actual.encode('latin-1').decode('gb2312', errors='replace')
        f.write(f"After Latin-1 -> GB2312: {latin1_decoded}\n")
    except Exception as e:
        f.write(f"Latin-1 -> GB2312 failed: {e}\n")

    try:
        latin1_decoded = actual.encode('latin-1').decode('gbk', errors='replace')
        f.write(f"After Latin-1 -> GBK: {latin1_decoded}\n")
    except Exception as e:
        f.write(f"Latin-1 -> GBK failed: {e}\n")

    # List all headers with hex
    f.write("\nAll headers:\n")
    for i, h in enumerate(headers, 1):
        f.write(f"{i}: {h.strip()} | hex: {h.strip().encode('utf-8').hex()}\n")

print("Done")
