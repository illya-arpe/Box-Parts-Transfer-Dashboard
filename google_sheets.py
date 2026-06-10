"""Google Sheets data source service."""

import os
import re
from io import StringIO

import pandas as pd
import requests
import urllib3
from dotenv import load_dotenv

load_dotenv()  # 加载 .env 中的代理配置

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class GoogleSheetsService:
    """Service for reading data from public Google Sheets via CSV export."""

    # 运行时发现的 GID 映射（避免每次都扫描）
    _discovered_gids: dict[str, int] = {}
    _scan_cache: dict[str, list[tuple[int, str]]] = {}

    @staticmethod
    def extract_sheet_id(url_or_id: str) -> str | None:
        """Extract spreadsheet ID from Google Sheets URL or return as-is if already an ID."""
        url_or_id = url_or_id.strip()

        if re.match(r'^[a-zA-Z0-9_-]{20,50}$', url_or_id):
            return url_or_id

        patterns = [
            r'/spreadsheets/d/([a-zA-Z0-9_-]+)',
            r'/d/([a-zA-Z0-9_-]+)/',
        ]

        for pattern in patterns:
            match = re.search(pattern, url_or_id)
            if match:
                return match.group(1)

        return None

    @classmethod
    def _fetch_csv(cls, spreadsheet_id: str, gid: int | None = None) -> str:
        """Fetch CSV content from spreadsheet. Optionally specify sheet by GID."""
        csv_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv&usp=sharing"
        if gid is not None:
            csv_url = f"{csv_url}&gid={gid}"

        proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
        proxies = None
        if proxy:
            proxies = {"http": proxy, "https": proxy}

        last_error = None
        max_attempts = 5

        for attempt in range(max_attempts):
            for attempt_proxies in [proxies, None]:
                try:
                    response = requests.get(
                        csv_url,
                        timeout=60,
                        proxies=attempt_proxies,
                        verify=False,
                        allow_redirects=True
                    )
                    response.raise_for_status()

                    if len(response.content) < 100:
                        last_error = f"响应内容过小 ({len(response.content)} bytes)"
                        continue

                    for encoding in ['utf-8-sig', 'utf-8', 'gb18030', 'gbk', 'gb2312']:
                        try:
                            text = response.content.decode(encoding)
                            if ',' in text and len(text) > 50:
                                return text
                        except (UnicodeDecodeError, LookupError):
                            continue

                    return response.content.decode('utf-8', errors='replace')
                except requests.RequestException as e:
                    last_error = str(e)
                    continue

        raise ConnectionError(f"无法连接到 Google Sheets (spreadsheet_id={spreadsheet_id}, gid={gid}): {last_error}")

    @classmethod
    def _is_valid_csv(cls, text: str) -> bool:
        """Check if the response is a valid CSV (not HTML error page)."""
        if not text or len(text) < 20:
            return False
        text_lower = text.lower().strip()
        if '<!doctype html>' in text_lower or '<html' in text_lower:
            return False
        # 检查是否有逗号分隔符（CSV 的基本特征）
        if ',' not in text:
            return False
        return True

    @classmethod
    def _scan_gids(cls, spreadsheet_id: str, max_gid: int = 100) -> list[tuple[int, str]]:
        """Scan GIDs 0-max_gid to find valid sheets. Returns list of (gid, first_line) tuples."""
        cache_key = spreadsheet_id
        if cache_key in cls._scan_cache:
            return cls._scan_cache[cache_key]

        results = []
        for gid in range(max_gid + 1):
            try:
                text = cls._fetch_csv(spreadsheet_id, gid=gid)
                if cls._is_valid_csv(text):
                    first_line = text.split('\n')[0] if text else ""
                    results.append((gid, first_line))
            except Exception:
                continue

        cls._scan_cache[cache_key] = results
        print(f"[DISCOVER] Scanned GIDs 0-{max_gid}, found {len(results)} valid sheets")
        for gid, first in results:
            print(f"  GID={gid}: {first[:80]}")
        return results

    @classmethod
    def discover_gids(cls, spreadsheet_id: str, expected_names: list[str]) -> dict[str, int]:
        """
        动态扫描表格，找到每个 Sheet 对应的 GID。
        通过列名关键词匹配 sheet 名称。
        """
        scans = cls._scan_gids(spreadsheet_id)
        discovered = {}

        # 关键词 -> sheet name 映射
        name_keywords = {
            "黄盒数据": ["黄盒", "黄盒数据", "box"],
            "主品数据": ["主品", "主品数据", "main"],
            "国内仓数据": ["国内", "国内仓", "domestic"],
        }

        for sheet_name, keywords in name_keywords.items():
            for gid, first_line in scans:
                first_lower = first_line.lower()
                if any(kw.lower() in first_lower for kw in keywords):
                    discovered[sheet_name] = gid
                    print(f"[DISCOVER] Sheet '{sheet_name}' -> GID={gid}, header: {first_line[:60]}")
                    break

        cls._discovered_gids = discovered
        return discovered

    @classmethod
    def read_sheet(cls, url_or_id: str) -> pd.DataFrame:
        """Read data from the first sheet of a public Google Sheet."""
        spreadsheet_id = cls.extract_sheet_id(url_or_id)
        if not spreadsheet_id:
            raise ValueError(f"Invalid Google Sheets URL or ID: {url_or_id}")

        content = cls._fetch_csv(spreadsheet_id)
        if not cls._is_valid_csv(content):
            raise ConnectionError("Google Sheet 返回了 HTML 错误页面，请确认表格已设置为「任何人都可查看」")

        df = pd.read_csv(StringIO(content))
        # 清洗列名：取分号前的部分作为实际列名
        df.columns = [col.split(';')[0].strip() for col in df.columns]
        return df

    @classmethod
    def read_sheet_by_name(cls, url_or_id: str, sheet_name: str) -> pd.DataFrame:
        """Read data from a specific sheet by name. Auto-discovers GID if needed."""
        spreadsheet_id = cls.extract_sheet_id(url_or_id)
        if not spreadsheet_id:
            raise ValueError(f"Invalid Google Sheets URL or ID: {url_or_id}")

        # 动态获取 GID
        if not cls._discovered_gids:
            from app.core.config import SHEET_GID_MAP
            fallback = dict(SHEET_GID_MAP)
            cls.discover_gids(spreadsheet_id, list(fallback.keys()))
            # 用扫描结果覆盖配置
            cls._discovered_gids.update({k: v for k, v in fallback.items() if k not in cls._discovered_gids})

        gid = cls._discovered_gids.get(sheet_name)
        if gid is None:
            # 尝试用配置文件的默认值
            from app.core.config import SHEET_GID_MAP
            gid = SHEET_GID_MAP.get(sheet_name)

        if gid is None:
            raise ValueError(
                f"未找到 Sheet '{sheet_name}' 的 GID。"
                f"已扫描到的 GID: {cls._discovered_gids}。"
                f"请确认 Google Sheets 中存在名为「{sheet_name}」的工作表。"
            )

        content = cls._fetch_csv(spreadsheet_id, gid)
        if not cls._is_valid_csv(content):
            raise ConnectionError(
                f"Sheet '{sheet_name}' (GID={gid}) 返回 HTML 错误。"
                f"请确认表格已设置为「任何人都可查看」。"
            )

        df = pd.read_csv(StringIO(content))
        # 清洗列名：取分号前的部分作为实际列名
        df.columns = [col.split(';')[0].strip() for col in df.columns]
        return df

    @classmethod
    def read_all_sheets(cls, url_or_id: str) -> dict[str, pd.DataFrame]:
        """Read all sheets from a spreadsheet. Auto-discovers GIDs."""
        spreadsheet_id = cls.extract_sheet_id(url_or_id)
        if not spreadsheet_id:
            raise ValueError(f"Invalid Google Sheets URL or ID: {url_or_id}")

        from app.core.config import SHEET_GID_MAP
        result = {}
        cls.discover_gids(spreadsheet_id, list(SHEET_GID_MAP.keys()))

        for sheet_name in SHEET_GID_MAP.keys():
            try:
                result[sheet_name] = cls.read_sheet_by_name(url_or_id, sheet_name)
            except Exception as e:
                print(f"[DISCOVER] Sheet '{sheet_name}' 读取失败: {e}")
        return result


google_sheets_service = GoogleSheetsService()
