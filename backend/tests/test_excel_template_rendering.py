"""Verify generated preview metadata without opening the production database."""

import importlib.util
import json
from pathlib import Path

import pytest
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Border, Font, Side
from openpyxl.worksheet.formula import ArrayFormula
from openpyxl.worksheet.print_settings import PrintArea

module_path = Path(__file__).resolve().parents[1] / "app" / "excel" / "generator.py"
spec = importlib.util.spec_from_file_location("invoice_generator", module_path)
generator_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator_module)
ExcelGenerator = generator_module.ExcelGenerator


def template(path: Path) -> Path:
    workbook = Workbook()
    sheet = workbook.active
    sheet.merge_cells("M2:AE4")
    sheet["M2"] = "거 래 명 세 서"
    sheet["M2"].font = Font(name="돋움", size=18, bold=True)
    sheet["A14"].border = Border(bottom=Side(style="medium", color="000000"))
    sheet["AH14"] = "=X14*0.1"
    sheet["B39"] = "템플릿 안내문"
    sheet["B39"].font = Font(name="굴림", size=10)
    sheet.print_area = "A2:AP44"
    sheet.page_setup.scale = 91
    sheet.page_setup.paperSize = 9
    sheet.row_dimensions[14].height = 18
    workbook.save(path)
    return path


def test_preview_carries_the_actual_template_formatting(tmp_path: Path):
    path = template(tmp_path / "template.xlsx")
    output = tmp_path / "invoice.xlsx"
    ExcelGenerator(path).generate(
        output, [{"name": "엔진오일", "quantity": 2, "unit_price": 15000}]
    )
    workbook = load_workbook(output)
    layout = json.loads(workbook.custom_doc_props["PartMatchPrintLayout"].value)
    assert layout["ranges"] == ["$A$2:$AP$44"]
    assert layout["sheet_name"] == workbook.active.title
    assert layout["scale"] == 0.91
    assert layout["row_heights_pt"][13] == 18
    title = next(cell for cell in layout["cells"] if cell["r"] == 1 and cell["c"] == 12)
    assert title["font"]["family"] == "돋움"
    assert title["font"]["size"] == 18
    assert title["font"]["bold"] is True
    item = next(cell for cell in layout["cells"] if cell["r"] == 13 and cell["c"] == 0)
    assert item["borders"]["bottom"]["style"] == "medium"
    assert workbook.active["X14"].value == 30000
    assert workbook.active["AH14"].value == "=X14*0.1"


def test_different_template_print_settings_are_preserved(tmp_path: Path):
    path = template(tmp_path / "template.xlsx")
    workbook = load_workbook(path)
    sheet = workbook.active
    sheet.page_setup.paperSize = 1
    sheet.page_setup.orientation = "landscape"
    sheet.page_setup.scale = 75
    sheet.page_margins.left = 0.5
    sheet.print_area = "B3:AO40"
    sheet.row_dimensions[14].height = 27
    workbook.save(path)
    output = tmp_path / "invoice.xlsx"
    ExcelGenerator(path).generate(output, [{"name": "부품"}])
    result = load_workbook(output)
    layout = json.loads(result.custom_doc_props["PartMatchPrintLayout"].value)
    assert layout["ranges"] == ["$B$3:$AO$40"]
    assert int(layout["paper_size"]) == 1
    assert layout["orientation"] == "landscape"
    assert layout["scale"] == 0.75
    assert layout["margins_mm"]["left"] == 12.7
    assert layout["row_heights_pt"][13] == 27


def test_fixed_invoice_capacity_does_not_overwrite_totals(tmp_path: Path):
    path = template(tmp_path / "template.xlsx")
    with pytest.raises(ValueError, match="24"):
        ExcelGenerator(path).generate(
            tmp_path / "invoice.xlsx", [{"name": "부품"}] * 25
        )


def test_print_area_extends_beyond_used_cells_and_preserves_hidden_rows(tmp_path: Path):
    path = template(tmp_path / "template.xlsx")
    workbook = load_workbook(path)
    sheet = workbook.active
    assert sheet.max_row < 44
    sheet.sheet_format.defaultRowHeight = 21
    sheet.row_dimensions[14].hidden = True
    workbook.save(path)
    output = tmp_path / "invoice.xlsx"
    ExcelGenerator(path).generate(output, [{"name": "부품"}])
    with_output = load_workbook(output)
    layout = json.loads(with_output.custom_doc_props["PartMatchPrintLayout"].value)
    assert len(layout["row_heights_pt"]) >= 44
    assert layout["row_heights_pt"][43] == 21
    assert layout["row_heights_pt"][13] == 0
    assert layout["default_row_height_pt"] == 21


def test_multiple_print_areas_are_kept_without_splitting_sheet_names(tmp_path: Path):
    path = template(tmp_path / "template.xlsx")
    workbook = load_workbook(path)
    sheet = workbook.active
    sheet.title = "양식!최종,안"
    sheet.print_area = ["A2:AP20", "A25:AP44"]
    workbook.save(path)
    output = tmp_path / "invoice.xlsx"
    ExcelGenerator(path).generate(output, [{"name": "부품"}])
    result = load_workbook(output)
    layout = json.loads(result.custom_doc_props["PartMatchPrintLayout"].value)
    assert set(layout["ranges"]) == {"$A$2:$AP$20", "$A$25:$AP$44"}
    assert len(PrintArea.from_string(result.active.print_area).ranges) == 2
    assert layout["sheet_name"] == "양식!최종,안"


def test_missing_print_area_still_allows_excel_download(tmp_path: Path):
    path = template(tmp_path / "template.xlsx")
    workbook = load_workbook(path)
    workbook.active.print_area = None
    workbook.save(path)
    output = tmp_path / "invoice.xlsx"
    ExcelGenerator(path).generate(output, [{"name": "부품"}])
    result = load_workbook(output)
    layout = json.loads(result.custom_doc_props["PartMatchPrintLayout"].value)
    assert layout["ranges"] == []
    assert result.active["A14"].value == "부품"


def test_active_sheet_and_fit_to_page_settings_are_preserved(tmp_path: Path):
    path = template(tmp_path / "template.xlsx")
    workbook = load_workbook(path)
    sheet = workbook.active
    sheet.title = "출력 양식"
    workbook.create_sheet("안내", 0)
    workbook.active = 1
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.print_options.verticalCentered = True
    workbook.save(path)
    output = tmp_path / "invoice.xlsx"
    ExcelGenerator(path).generate(output, [{"name": "부품"}])
    result = load_workbook(output)
    layout = json.loads(result.custom_doc_props["PartMatchPrintLayout"].value)
    assert layout["sheet_name"] == "출력 양식"
    assert layout["fit_to_page"] is True
    assert layout["fit_to_width"] == 1
    assert layout["fit_to_height"] == 0
    assert layout["vertical_centered"] is True
    assert result["출력 양식"]["A14"].value == "부품"


@pytest.mark.parametrize("value", ["=SUM(A100:XFD1048576)", "#N/A"])
def test_user_text_is_not_interpreted_as_a_formula_or_error(tmp_path: Path, value: str):
    path = template(tmp_path / "template.xlsx")
    output = tmp_path / "invoice.xlsx"
    ExcelGenerator(path).generate(
        output, [{"name": value, "specification": value}], vehicle_number=value
    )
    workbook = load_workbook(output)
    try:
        for address in ("A14", "K14", "B8"):
            assert workbook.active[address].value == value
            assert workbook.active[address].data_type == "s"
        assert workbook.active["AH14"].value == "=X14*0.1"
    finally:
        workbook.close()


@pytest.mark.parametrize("tax_formula", [None, "=X14*0.08"])
def test_missing_tax_cells_follow_the_template_instead_of_adding_a_tax_rate(
    tmp_path: Path, tax_formula: str | None
):
    path = template(tmp_path / "template.xlsx")
    workbook = load_workbook(path)
    workbook.active["AH14"] = tax_formula
    workbook.save(path)
    workbook.close()
    output = tmp_path / "invoice.xlsx"
    ExcelGenerator(path).generate(output, [{"name": "one"}, {"name": "two"}])
    result = load_workbook(output)
    try:
        assert result.active["AH14"].value == tax_formula
        assert result.active["AH15"].value == ("=X15*0.08" if tax_formula else None)
    finally:
        result.close()


def test_tax_formula_that_cannot_move_up_does_not_block_download(tmp_path: Path):
    path = template(tmp_path / "template.xlsx")
    workbook = load_workbook(path)
    workbook.active["AH14"] = None
    workbook.active["AH15"] = "=X15*B1"
    workbook.save(path)
    workbook.close()
    output = tmp_path / "invoice.xlsx"
    ExcelGenerator(path).generate(output, [{"name": "part"}])
    result = load_workbook(output)
    try:
        assert result.active["AH14"].value is None
        assert result.active["AH15"].value == "=X15*B1"
    finally:
        result.close()


@pytest.mark.parametrize("with_regular_formula", [False, True])
def test_array_tax_formula_is_preserved_without_copying_it_to_other_cells(
    tmp_path: Path, with_regular_formula: bool
):
    path = template(tmp_path / "template.xlsx")
    workbook = load_workbook(path)
    workbook.active["AH14"] = ArrayFormula("AH14:AH20", "=X14:X20*0.1")
    if with_regular_formula:
        workbook.active["AH21"] = "=X21*0.1"
    workbook.save(path)
    workbook.close()
    output = tmp_path / "invoice.xlsx"
    ExcelGenerator(path).generate(output, [{"name": "one"}, {"name": "two"}])
    result = load_workbook(output)
    try:
        assert isinstance(result.active["AH14"].value, ArrayFormula)
        assert result.active["AH14"].value.ref == "AH14:AH20"
        assert result.active["AH15"].value is None
        if with_regular_formula:
            assert result.active["AH21"].value == "=X21*0.1"
    finally:
        result.close()
