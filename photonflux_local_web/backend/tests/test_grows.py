import sys
from pathlib import Path
from fastapi.testclient import TestClient
import pytest

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app import app

client = TestClient(app)

@pytest.fixture
def mock_store(tmp_path, monkeypatch):
    data_file = tmp_path / "persist.json"
    monkeypatch.setenv("DATA_FILE", str(data_file))
    return data_file

def test_ha_entities_fallback(monkeypatch):
    monkeypatch.setenv("SUPERVISOR_TOKEN", "")
    response = client.get("/api/ha/entities")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "entity_id" in data[0]

def test_ha_state_fallback(monkeypatch):
    monkeypatch.setenv("SUPERVISOR_TOKEN", "")
    response = client.get("/api/ha/state/sensor.test")
    assert response.status_code == 200
    data = response.json()
    assert "state" in data

def test_grow_list_persistence(mock_store):
    collection = "photonflux_grows"
    key = "grows_list"
    grows = [
        {"id": "grow-1", "name": "Summer 2024", "cultivar": "blue_dream", "substrate": "coco", "startDate": "2024-06-01"},
        {"id": "grow-2", "name": "Winter 2024", "cultivar": "wedding_cake", "substrate": "soil", "startDate": "2024-11-01"}
    ]

    # Save grows
    response = client.post(f"/api/store/{collection}/{key}", json={"data": grows})
    assert response.status_code == 200

    # Load grows
    response = client.get(f"/api/store/{collection}/{key}")
    assert response.status_code == 200
    assert response.json()["data"] == grows

def test_journal_persistence_by_grow_id(mock_store):
    grow_id = "test-grow-123"
    collection = "photonfluxJournal"
    key = f"journal_{grow_id}"
    entries = [
        {"id": "entry-1", "notes": "Looking good"},
        {"id": "entry-2", "notes": "Fed them today"}
    ]

    # Save journal
    response = client.post(f"/api/store/{collection}/{key}", json={"data": entries})
    assert response.status_code == 200

    # Load journal
    response = client.get(f"/api/store/{collection}/{key}")
    assert response.status_code == 200
    assert response.json()["data"] == entries
