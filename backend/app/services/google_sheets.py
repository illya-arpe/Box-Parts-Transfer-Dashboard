"""Google Sheets data source service."""

import re
from io import StringIO

import pandas as pd
import requests


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
    def read_sheet(cls, url_or_id: str) -> pd.DataFrame:
        """
        Read data from a public Google Sheet.
        
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
        
        # Build CSV export URL
        csv_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv"
        
        try:
            response = requests.get(csv_url, timeout=30)
            response.raise_for_status()
            
            # Parse CSV content
            df = pd.read_csv(StringIO(response.text))
            
            # Clean column names (strip whitespace)
            df.columns = df.columns.str.strip()
            
            return df
        except requests.RequestException as e:
            raise ConnectionError(f"Failed to fetch Google Sheet: {e}")


# Singleton instance
google_sheets_service = GoogleSheetsService()
