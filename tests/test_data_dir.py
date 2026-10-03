"""TSUCHO_DATA_DIR: thư mục dữ liệu riêng để test/thử máy chủ không đụng `.data` thật.

Chạy trong tiến trình con vì `DATA_DIR` được đọc một lần lúc import module.
"""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _paths(**env_extra):
    env = {k: v for k, v in os.environ.items() if k != "TSUCHO_DATA_DIR"}
    env.update(env_extra)
    out = subprocess.run(
        [sys.executable, "-c",
         "from api import auth, workspace; print(workspace.DATA_DIR); print(workspace.WS_DIR); print(auth.DB_PATH)"],
        cwd=ROOT, env=env, capture_output=True, text=True, check=True,
    )
    # 3 dòng CUỐI: một số bản PyMuPDF in thêm cảnh báo `fitz` deprecated ra stdout lúc import
    return [Path(line) for line in out.stdout.splitlines()[-3:]]


def test_khong_dat_bien_thi_dung_thu_muc_data_mac_dinh():
    data, ws, db = _paths()
    assert data == ROOT / ".data"
    assert ws == data / "ws" and db == data / "app.db"


def test_dat_bien_thi_ca_workspace_lan_csdl_tai_khoan_di_theo(tmp_path):
    data, ws, db = _paths(TSUCHO_DATA_DIR=str(tmp_path))
    assert data == tmp_path
    assert ws == tmp_path / "ws" and db == tmp_path / "app.db"


def test_bien_rong_thi_coi_nhu_khong_dat():
    data, _, _ = _paths(TSUCHO_DATA_DIR="")
    assert data == ROOT / ".data"


def test_dockerfile_cai_font_cjk_dung_voi_duong_dan_sample_tim():
    """Sổ mẫu in chữ Nhật; python:slim không có font CJK nên Dockerfile phải cài một gói, và
    sample.py phải tìm đúng chỗ gói đó đặt file (không thì sổ mẫu trên máy chủ mất chữ Nhật)."""
    from api import sample

    docker = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    assert "fonts-ipafont-gothic" in docker
    assert "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf" in sample._FONT_CANDIDATES


def test_dockerfile_chep_du_moi_module_goc_ma_may_chu_import():
    """Module .py ở gốc repo mà api/ (hoặc một module đã được chép) import phải có trong dòng COPY của
    Dockerfile — thiếu thì máy chủ trên Docker chết ngay lúc khởi động với ModuleNotFoundError, mà
    chạy trên máy dev thì không bao giờ thấy lỗi này."""
    import ast
    import re

    docker = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    m = re.search(r"^COPY\s+((?:[\w.\-]+\.py\s+)+)\./?\s*$", docker, re.M)
    assert m, "không thấy dòng COPY các module .py ở gốc trong Dockerfile"
    copied = {Path(x).stem for x in m.group(1).split()}
    root_modules = {p.stem for p in ROOT.glob("*.py")}

    def imports(path: Path) -> set[str]:
        out = set()
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                out |= {a.name.split(".")[0] for a in node.names}
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                out.add(node.module.split(".")[0])
        return out & root_modules

    need: set[str] = set()
    for f in (ROOT / "api").glob("*.py"):
        need |= imports(f)
    todo = list(need | copied)
    while todo:                                   # module gốc import module gốc khác
        for dep in imports(ROOT / f"{todo.pop()}.py") - need:
            need.add(dep)
            todo.append(dep)
    assert not (need - copied), f"Dockerfile thiếu COPY: {sorted(need - copied)}"
