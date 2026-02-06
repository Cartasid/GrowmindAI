import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend import app


def test_concurrent_store_access_preserves_data(tmp_path, monkeypatch):
    data_file = tmp_path / "persist.json"
    monkeypatch.setenv("DATA_FILE", str(data_file))

    total_workers = 5
    iterations = 25
    collection = "test"

    def worker(worker_id: int) -> None:
        for iteration in range(iterations):
            payload = app.StorePayload(data={"worker": worker_id, "iteration": iteration})
            app.store_set(collection, f"{worker_id}-{iteration}", payload)
            snapshot = app._load_store()
            assert isinstance(snapshot, dict)
            time.sleep(0.001)

    with ThreadPoolExecutor(max_workers=total_workers) as executor:
        list(executor.map(worker, range(total_workers)))

    final_store = app._load_store()
    assert set(final_store.keys()) == {collection}
    stored_items = final_store[collection]
    expected_count = total_workers * iterations
    assert len(stored_items) == expected_count

    for worker_id in range(total_workers):
        for iteration in range(iterations):
            key = f"{worker_id}-{iteration}"
            assert stored_items[key] == {"worker": worker_id, "iteration": iteration}
