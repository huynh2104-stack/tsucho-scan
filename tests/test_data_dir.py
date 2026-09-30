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
    return [Path(line) for line in out.stdout.splitlines()]


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
