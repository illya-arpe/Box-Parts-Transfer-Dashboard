"""Google Sheets data source service."""

import os
import re
from io import StringIO

import pandas as pd
import requests
import urllib3

from app.core.config import SHEET_GID_MAP

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class GoogleSheetsService:
    """Service for reading data from public Google Sheets via CSV export."""

    @staticmethod
    def extract_sheet_id(url_or_id: str) -> str | None:
        """Extract spreadsheet ID from Google Sheets URL or return as-is if already an ID."""
        url_or_id = url_or_id.strip()

        # If it looks like a direct ID, return it
        if re.match(r'^[a-zA-Z0-9_-]{20,50}$', url_or_id):
            return url_or_id

        # Try to extract from URL
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
            proxies = {
                "http": proxy,
                "https": proxy,
            }

        response = None
        errors = []
        for attempt_proxies in [None, proxies]:
            try:
                response = requests.get(csv_url, timeout=30, proxies=attempt_proxies, verify=False)
                response.raise_for_status()
                break
            except requests.RequestException as e:
                errors.append(f"proxies={attempt_proxies}: {e}")
                continue

        if response is None:
            raise ConnectionError(f"Failed to fetch Google Sheet (tried direct & proxy). Errors: {'; '.join(errors)}")

        return response.content.decode('utf-8')

    @classmethod
    def read_sheet(cls, url_or_id: str) -> pd.DataFrame:
        """
        Read data from the first sheet of a public Google Sheet.

        Args:
            url_or_id: Google Sheets URL or spreadsheet ID

        Returns:
            DataFrame with the sheet data

        Raises:
            ValueError: If the URL/ID is invalid
            ConnectionError: If unable to fetch the sheet
        """
        spreadsheet_id = cls.extract_sheet_id(url_or_id)
        if not spreadsheet_id:
            raise ValueError(f"Invalid Google Sheets URL or ID: {url_or_id}")

        content = cls._fetch_csv(spreadsheet_id)
        df = pd.read_csv(StringIO(content))
        df.columns = df.columns.str.strip()
        return df

    @classmethod
    def read_sheet_by_name(cls, url_or_id: str, sheet_name: str) -> pd.DataFrame:
        """
        Read data from a specific sheet by name.

        Args:
            url_or_id: Google Sheets URL or spreadsheet ID
            sheet_name: Name of the sheet (e.g., "黄盒数据", "主品数据", "国内仓数据")

        Returns:
            DataFrame with the sheet data

        Raises:
            ValueError: If the URL/ID is invalid or sheet_name not found
            ConnectionError: If unable to fetch the sheet
        """
        spreadsheet_id = cls.extract_sheet_id(url_or_id)
        if not spreadsheet_id:
            raise ValueError(f"Invalid Google Sheets URL or ID: {url_or_id}")

        gid = SHEET_GID_MAP.get(sheet_name)
        if gid is None:
            raise ValueError(f"Unknown sheet name: {sheet_name}. Available: {list(SHEET_GID_MAP.keys())}")

        content = cls._fetch_csv(spreadsheet_id, gid)
        df = pd.read_csv(StringIO(content))
        df.columns = df.columns.str.strip()
        return df

    @classmethod
    def read_all_sheets(cls, url_or_id: str) -> dict[str, pd.DataFrame]:
        """
        Read all configured sheets from a spreadsheet.

        Args:
            url_or_id: Google Sheets URL or spreadsheet ID

        Returns:
            Dictionary mapping sheet names to DataFrames
        """
        result = {}
        for sheet_name in SHEET_GID_MAP.keys():
            try:
                result[sheet_name] = cls.read_sheet_by_name(url_or_id, sheet_name)
            except Exception as e:
                print(f"Warning: Failed to read sheet '{sheet_name}': {e}")
        return result


# Singleton instance
google_sheets_service = GoogleSheetsService()
