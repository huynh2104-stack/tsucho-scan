from PIL import Image

from api import main, workspace
from test_api_auth import client, register  # shared isolated database fixture


def prepare(client):
    register(client)
    wid = client.post('/api/ws').json()['id']
    ws = workspace.load(wid)
    sheet = workspace.Sheet(id='s1', name='sample', origin='sample.png', sha256='revision-1')
    ws.sheets.append(sheet)
    sheet.dir(wid).mkdir(parents=True)
    Image.new('RGB', (100, 120), 'white').save(sheet.dir(wid) / 'current.png')
    ws.save()
    return f'/api/ws/{wid}/sheets/s1/rowmap'


def test_rowmap_rejects_old_image_revision(client, monkeypatch):
    url = prepare(client)
    monkeypatch.setattr(main.rowanchors, 'locate', lambda *a: (_ for _ in ()).throw(AssertionError('must not OCR stale image')))
    assert client.post(url, json={'image_revision':'old', 'rows':[]}).status_code == 409


def test_rowmap_uses_current_review_rows_and_preserves_revision(client, monkeypatch):
    url = prepare(client)
    rows = [{'amount_out':1000, 'balance':25000}]
    def locate(path, revision, targets, geometry):
        assert targets == rows
        assert revision == 'revision-1'
        return {**geometry, 'bands':[{'y0':.2, 'y1':.3, 'method':'content'}]}
    monkeypatch.setattr(main.rowanchors, 'locate', locate)
    response = client.post(url, json={'image_revision':'revision-1', 'rows':rows})
    assert response.status_code == 200
    assert response.json()['image_revision'] == 'revision-1'
    assert response.json()['bands'][0]['method'] == 'content'


def test_rowmap_limits_work_and_checks_workspace_owner(client):
    url = prepare(client)
    assert client.post(url,json={'image_revision':'revision-1','rows':[{}]*501}).status_code == 422
    client.post('/api/auth/logout')
    register(client,email='another@example.com')
    assert client.post(url,json={'image_revision':'revision-1','rows':[]}).status_code == 404
