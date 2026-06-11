"""Proxy endpoint for fetching Google Sheets CSV data (bypasses CORS)."""

import urllib3
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from app.services.google_sheets import google_sheets_service

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

router = APIRouter(prefix="/api/sheets", tags=["sheets"])


@router.get("/fetch-csv")
def fetch_sheet_csv(sheet_url: str = Query(...)) -> PlainTextResponse:
    """
    Fetch Google Sheets CSV data via backend proxy.
    Bypasses CORS restrictions that prevent browser-based proxies from working.
    """
    spreadsheet_id = google_sheets_service.extract_sheet_id(sheet_url)
    if not spreadsheet_id:
        raise HTTPException(status_code=400, detail=f"Invalid Google Sheets URL: {sheet_url}")

    content = google_sheets_service._fetch_csv(spreadsheet_id)
    if not google_sheets_service._is_valid_csv(content):
        raise HTTPException(
            status_code=502,
            detail="Google Sheet returned HTML error. Ensure the sheet is set to 'Anyone with link can view'.",
        )

    return PlainTextResponse(content, media_type="text/csv; charset=utf-8")
