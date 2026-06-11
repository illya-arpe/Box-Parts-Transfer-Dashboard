// ============================================================
// Google Apps Script - 黄盒看板数据接口
// 使用方法：
//   1. 打开你的 Google Sheets
//   2. 扩展程序 → Apps Script
//   3. 删除默认代码，粘贴本脚本全部内容
//   4. 保存项目（Ctrl+S），可重命名
//   5. 部署 → 新建部署 → 类型选"网络应用"
//      - 执行身份：我
//      - 有权访问的应用：任何人
//   6. 复制"网络应用网址"，粘贴到下方 API_URL
// ============================================================

function doGet(request) {
  const action = request.parameter.action || 'getCSV';

  if (action === 'getCSV') {
    return serveCSV(request);
  } else if (action === 'getSheets') {
    return serveSheetList(request);
  } else {
    return jsonResp({ error: 'Unknown action' }, 400);
  }
}

function serveCSV(request) {
  const sheetUrl = request.parameter.sheet_url;
  const sheetName = request.parameter.sheet_name || '';
  if (!sheetUrl) {
    return jsonResp({ error: 'Missing sheet_url parameter' }, 400);
  }

  try {
    const ss = extractSpreadsheet(sheetUrl);
    let sheet;

    if (sheetName) {
      // 按名称查找工作表
      const allSheets = ss.getSheets();
      sheet = allSheets.find(s => s.getName() === sheetName) || null;
      if (!sheet) {
        return jsonResp({ error: `Sheet "${sheetName}" not found. Available sheets: ${allSheets.map(s => s.getName()).join(', ')}` }, 404);
      }
    } else {
      sheet = ss.getActiveSheet();
    }

    const data = sheet.getDataRange().getValues();

    // 过滤空行
    const filtered = data.filter(row => row.some(cell => cell !== '' && cell !== null));

    // 转 CSV
    const csv = filtered.map(row =>
      row.map(cell => {
        const str = String(cell);
        // 包含逗号/换行/引号时转义
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      }).join(',')
    ).join('\n');

    return ContentService
      .createTextOutput(csv)
      .setMimeType(ContentService.MimeType.TEXT);

  } catch (e) {
    return jsonResp({ error: e.toString() }, 500);
  }
}

function serveSheetList(request) {
  const sheetUrl = request.parameter.sheet_url;
  if (!sheetUrl) {
    return jsonResp({ error: 'Missing sheet_url parameter' }, 400);
  }

  try {
    const ss = extractSpreadsheet(sheetUrl);
    const sheets = ss.getSheets().map(s => ({
      name: s.getName(),
      gid: ss.getSheetId()
    }));
    return jsonResp({ sheets });
  } catch (e) {
    return jsonResp({ error: e.toString() }, 500);
  }
}

// ---------- 辅助函数 ----------

/**
 * 从 URL 提取 Spreadsheet 对象
 * 支持以下格式：
 *   - https://docs.google.com/spreadsheets/d/<ID>/edit
 *   - https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0
 *   - https://docs.google.com/spreadsheets/d/<ID>/view
 */
function extractSpreadsheet(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('Invalid spreadsheet URL');
  return SpreadsheetApp.openById(match[1]);
}

function jsonResp(data, statusCode) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}
