from dataclasses import dataclass

COUNTRIES = ["TH", "VN", "SG", "MY", "ID", "PH"]

WAREHOUSES = [
    "泰国主仓-AP",
    "越南胡志明京东仓",
    "新加坡百世仓",
    "马来京东仓",
    "新印尼Flash本地仓",
    "菲律宾C仓",
]


@dataclass(frozen=True)
class CalculationConfig:
    forecast_days: int = 90
    failure_rate: float = 0.02
    replacement_ratio: float = 0.20


CALCULATION_CONFIG = CalculationConfig()

REQUIRED_COLUMNS = [
    "国家",
    "仓库名",
    "主品SKU",
    "主品在途数量",
    "主品仓库可用量",
    "主品计划在途量",
    "主品90天销量",
    "主品90天日均销",
    "主品商品等级",
    "黄盒SKU",
    "黄盒在途数量",
    "黄盒海外仓可用量",
    "黄盒计划在途量",
    "黄盒90天销量",
    "黄盒国内仓可用量",
]

# 多Sheet配置 - 各Sheet必填列
BOX_SHEET_COLUMNS = [
    "国家",
    "仓库名",
    "黄盒SKU",
    "黄盒在途数量",
    "黄盒海外仓可用量",
    "黄盒计划在途量",
    "黄盒90天销量",
    "黄盒90天日均销",
]

MAIN_SHEET_COLUMNS = [
    "主品SKU",
    "主品在途数量",
    "主品仓库可用量",
    "主品计划在途量",
    "主品90天销量",
    "主品90天日均销",
    "主品商品等级",
]

DOMESTIC_SHEET_COLUMNS = [
    "黄盒SKU",
    "黄盒国内仓可用量",
]

# Sheet名称与GID映射（可通过gid参数读取指定Sheet）
SHEET_GID_MAP = {
    "黄盒数据": 0,
    "主品数据": 1,
    "国内仓数据": 2,
}


def box_sku_to_main_sku(box_sku: str) -> str | None:
    """
    将黄盒SKU转换为主品SKU。

    规则：
    - 黄盒SKU = "HUAH-" + 主品SKU  →  返回主品SKU
    - 黄盒SKU = 主品SKU + "-HUAH"  →  返回主品SKU
    - 其他情况                       →  返回 None（无法自动转换）

    示例：
        HUAH-ZFBA007PK00        → ZFBA007PK00
        B0004DSLU002WH00-HUAH   → B0004DSLU002WH00
    """
    box_sku = box_sku.strip()

    # 规则1: HUAH- 前缀
    if box_sku.startswith("HUAH-"):
        main_sku = box_sku[5:]  # 去掉 "HUAH-" 前缀
        return main_sku if main_sku else None

    # 规则2: -HUAH 后缀
    if box_sku.endswith("-HUAH"):
        main_sku = box_sku[:-5]  # 去掉 "-HUAH" 后缀
        return main_sku if main_sku else None

    return None
