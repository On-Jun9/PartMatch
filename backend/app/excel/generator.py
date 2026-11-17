"""
엑셀 거래명세서 생성 모듈
"""

import json
import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from openpyxl import load_workbook
from openpyxl.formula.tokenizer import TokenizerError
from openpyxl.formula.translate import Translator, TranslatorError
from openpyxl.packaging.custom import StringProperty
from openpyxl.styles.colors import COLOR_INDEX
from openpyxl.utils.cell import absolute_coordinate
from openpyxl.worksheet.cell_range import CellRange
from openpyxl.worksheet.print_settings import PrintArea
from openpyxl.worksheet.worksheet import Worksheet

logger = logging.getLogger(__name__)


class ExcelGenerator:
    """거래명세서 엑셀 파일 생성기"""

    def __init__(self, template_path: Path):
        """
        Args:
            template_path: 템플릿 엑셀 파일 경로
        """
        self.template_path = Path(template_path)
        if not self.template_path.exists():
            raise FileNotFoundError(f"템플릿 파일을 찾을 수 없습니다: {template_path}")

    def generate(
        self,
        output_path: Path,
        items: List[Dict[str, Any]],
        date: Optional[datetime] = None,
        vehicle_number: Optional[str] = None,
        start_row: int = 14,
    ) -> Path:
        """
        거래명세서 엑셀 파일 생성

        Args:
            output_path: 출력 파일 경로
            items: 부품 아이템 리스트 (name, specification, quantity, unit_price, supply_price, tax_amount)
            date: 거래 날짜 (기본: 오늘)
            vehicle_number: 차 번호 (귀하) (기본: None)
            start_row: 품목 시작 행 (기본: 14)

        Returns:
            생성된 파일 경로
        """
        if len(items) > 24:
            raise ValueError(
                "현재 거래명세서 양식에는 품목을 24개까지 넣을 수 있습니다."
            )
        # 템플릿 파일 복사
        shutil.copy(self.template_path, output_path)
        logger.info(f"템플릿 파일 복사 완료: {self.template_path} -> {output_path}")

        # 워크북 열기
        workbook = load_workbook(output_path)
        sheet: Worksheet = workbook.active
        array_ranges = [CellRange(ref) for ref in sheet.array_formulae.values()]
        tax_formula = next(
            (
                sheet.cell(row=row, column=34)
                for row in range(start_row, start_row + 24)
                if sheet.cell(row=row, column=34).data_type == "f"
                and isinstance(sheet.cell(row=row, column=34).value, str)
            ),
            None,
        )

        # 날짜 입력 (B6: 연도, F6: 월, I6: 일)
        if date is None:
            date = datetime.now()

        year = date.year
        month = date.month
        day = date.day

        sheet.cell(row=6, column=2).value = year  # B6: 연도
        sheet.cell(row=6, column=6).value = month  # F6: 월
        sheet.cell(row=6, column=9).value = day  # I6: 일

        logger.info(f"날짜 입력 완료: {year}년 {month}월 {day}일")

        # 차 번호(귀하) 입력 (B8)
        if vehicle_number:
            sheet.cell(row=8, column=2).value = vehicle_number
            sheet.cell(row=8, column=2).data_type = "s"
            logger.info(f"차 번호 입력 완료: {vehicle_number}")

        # 품목 데이터 입력 (14행부터)
        for idx, item in enumerate(items):
            row = start_row + idx

            # A열 (1): 품목명
            sheet.cell(row=row, column=1).value = item.get("name")
            sheet.cell(row=row, column=1).data_type = "s"

            # K열 (11): 규격
            if item.get("specification"):
                sheet.cell(row=row, column=11).value = item["specification"]
                sheet.cell(row=row, column=11).data_type = "s"

            # O열 (15): 수량
            if item.get("quantity") is not None:
                sheet.cell(row=row, column=15).value = item["quantity"]

            # R열 (18): 단가
            if item.get("unit_price") is not None:
                sheet.cell(row=row, column=18).value = item["unit_price"]

            # X열 (24): 공급가액
            supply_price = item.get("supply_price")
            if (
                supply_price is None
                and item.get("quantity") is not None
                and item.get("unit_price") is not None
            ):
                # 자동 계산: 수량 × 단가
                supply_price = item["quantity"] * item["unit_price"]
            if supply_price is not None:
                sheet.cell(row=row, column=24).value = supply_price

            # AH열 (34): 세액
            # 템플릿의 기존 수식을 유지하여 엑셀에서 자동 계산되도록 함
            # 사용자가 엑셀 다운로드 후 추가/수정 시 자동 계산 가능
            target = sheet.cell(row=row, column=34)
            if (
                target.value is None
                and tax_formula
                and not any(target.coordinate in area for area in array_ranges)
            ):
                try:
                    target.value = Translator(
                        tax_formula.value, origin=tax_formula.coordinate
                    ).translate_formula(target.coordinate)
                except (TranslatorError, TokenizerError):
                    logger.warning(
                        "세액 수식 복사 생략: %s -> %s",
                        tax_formula.coordinate,
                        target.coordinate,
                    )

            logger.debug(f"품목 입력: 행{row}, 품명='{item.get('name')}'")

        logger.info(f"총 {len(items)}개 품목 입력 완료")

        # Carry the source template's print settings with the generated file.
        # Browser preview must not invent its own page size, margins or scale.
        print_areas = PrintArea.from_string(sheet.print_area).sorted()
        last_print_row = max((area.max_row for area in print_areas), default=0)
        default_row_height = sheet.sheet_format.defaultRowHeight or 15
        page_properties = sheet.sheet_properties.pageSetUpPr
        layout = {
            "sheet_name": sheet.title,
            "ranges": [absolute_coordinate(str(area)) for area in print_areas],
            "paper_size": sheet.page_setup.paperSize or 9,
            "orientation": sheet.page_setup.orientation or "portrait",
            "scale": (sheet.page_setup.scale or 100) / 100,
            "fit_to_page": bool(page_properties and page_properties.fitToPage),
            "fit_to_width": (
                sheet.page_setup.fitToWidth
                if sheet.page_setup.fitToWidth is not None
                else 1
            ),
            "fit_to_height": (
                sheet.page_setup.fitToHeight
                if sheet.page_setup.fitToHeight is not None
                else 1
            ),
            "margins_mm": {
                side: getattr(sheet.page_margins, side) * 25.4
                for side in ("top", "right", "bottom", "left")
            },
            "horizontal_centered": bool(sheet.print_options.horizontalCentered),
            "vertical_centered": bool(sheet.print_options.verticalCentered),
            "default_row_height_pt": default_row_height,
            "row_heights_pt": [
                (
                    0
                    if sheet.row_dimensions[row].hidden
                    else sheet.row_dimensions[row].height or default_row_height
                )
                for row in range(1, max(sheet.max_row, last_print_row) + 1)
            ],
        }

        def css_color(color, default="000000"):
            if color is None:
                return f"#{default}"
            if color.type == "rgb":
                return f"#{color.rgb[-6:]}"
            if color.type == "indexed" and color.indexed < len(COLOR_INDEX):
                return f"#{COLOR_INDEX[color.indexed][-6:]}"
            return f"#{default}"

        cells = []
        for row in sheet:
            for cell in row:
                borders = {}
                for edge in ("top", "right", "bottom", "left"):
                    side = getattr(cell.border, edge)
                    if side and side.style:
                        borders[edge] = {
                            "style": side.style,
                            "color": css_color(side.color),
                        }
                if (
                    cell.value is None
                    and not borders
                    and cell.fill.patternType != "solid"
                ):
                    continue
                cells.append(
                    {
                        "r": cell.row - 1,
                        "c": cell.column - 1,
                        "font": {
                            "family": cell.font.name or "Arial",
                            "size": cell.font.sz or 10,
                            "bold": bool(cell.font.b),
                            "italic": bool(cell.font.i),
                            "color": css_color(cell.font.color),
                        },
                        "align": cell.alignment.horizontal or "general",
                        "vertical": cell.alignment.vertical or "bottom",
                        "wrap": bool(cell.alignment.wrapText),
                        "shrink": bool(cell.alignment.shrinkToFit),
                        "format": cell.number_format,
                        "fill": (
                            css_color(cell.fill.fgColor, "FFFFFF")
                            if cell.fill.patternType == "solid"
                            else None
                        ),
                        "borders": borders,
                    }
                )
        layout["cells"] = cells
        if "PartMatchPrintLayout" in workbook.custom_doc_props.names:
            del workbook.custom_doc_props["PartMatchPrintLayout"]
        workbook.custom_doc_props.append(
            StringProperty(name="PartMatchPrintLayout", value=json.dumps(layout))
        )

        # 저장
        workbook.save(output_path)
        workbook.close()
        logger.info(f"엑셀 파일 생성 완료: {output_path}")

        return output_path
