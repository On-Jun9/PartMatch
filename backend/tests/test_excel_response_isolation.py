"""Exercise streaming responses in a subprocess with an isolated database."""

import json
import os
import subprocess
import sys
from pathlib import Path


def test_same_second_responses_keep_their_own_contents_and_are_cleaned(tmp_path: Path):
    backend = Path(__file__).resolve().parents[1]
    upload_dir = tmp_path / "data" / "uploads"
    upload_dir.mkdir(parents=True)
    env = dict(
        os.environ,
        PROJECT_ROOT=str(tmp_path),
        UPLOAD_DIR=str(upload_dir),
        TEMPLATE_PATH=str(tmp_path / "template.xlsx"),
        PYTHONPATH=str(backend),
    )
    script = """
import asyncio
import json
from datetime import datetime
from io import BytesIO
from openpyxl import Workbook, load_workbook
from app.api import routes

book = Workbook()
book.active.print_area = 'A1:AP44'
book.save(routes.settings.TEMPLATE_PATH)

class FixedDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return cls(2026, 11, 17, 12, 0, 0)

routes.datetime = FixedDateTime

async def run():
    responses = []
    for name in ['request-A', 'request-B']:
        responses.append(await routes.generate_excel(
            routes.GenerateExcelRequest(items=[routes.PartItem(name=name)])
        ))
    files_before = len(list(routes.settings.UPLOAD_DIR.glob('*.xlsx')))
    names = []
    for response in responses:
        data = b''.join([chunk async for chunk in response.body_iterator])
        result = load_workbook(BytesIO(data))
        names.append(result.active['A14'].value)
        result.close()
        if response.background:
            await response.background()
    print(json.dumps({'names': names, 'files_before': files_before,
                      'files_after': len(list(routes.settings.UPLOAD_DIR.glob('*.xlsx')))}))

asyncio.run(run())
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(tmp_path),
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["names"] == ["request-A", "request-B"]
    assert report["files_before"] == 2
    assert report["files_after"] == 0
