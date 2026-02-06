"""Unit tests for database functionality."""
import os
import pytest
import tempfile
from pathlib import Path

# Setup test database before imports
@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Create isolated test database"""
    test_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
    os.environ["DATABASE_URL"] = test_db.name
    yield
    Path(test_db.name).unlink(missing_ok=True)


@pytest.fixture
def db():
    """Get database instance"""
    from app.database import GrowMindDB
    # Reset singleton for test isolation
    GrowMindDB._instance = None
    return GrowMindDB()


class TestDatabase:
    """Test database operations"""

    def test_database_singleton(self, db):
        """Verify database is singleton"""
        from app.database import GrowMindDB
        db2 = GrowMindDB()
        assert db is db2
        assert id(db) == id(db2)

    def test_collection_get_set(self, db):
        """Test collection storage and retrieval"""
        test_data = {"key1": "value1", "key2": 42, "key3": {"nested": True}}
        
        # Set collection
        db.set_collection("test_collection", test_data)
        
        # Get collection
        result = db.get_collection("test_collection")
        assert result == test_data

    def test_collection_update(self, db):
        """Test collection updates"""
        db.set_collection("test_coll2", {"initial": "value"})
        db.set_collection("test_coll2", {"updated": "data", "more": 123})
        
        result = db.get_collection("test_coll2")
        assert result == {"updated": "data", "more": 123}
        assert "initial" not in result

    def test_collection_key_operations(self, db):
        """Test individual key operations"""
        db.set_collection_key("test_coll3", "key1", "value1")
        db.set_collection_key("test_coll3", "key2", {"nested": "data"})
        
        assert db.get_collection_key("test_coll3", "key1") == "value1"
        assert db.get_collection_key("test_coll3", "key2") == {"nested": "data"}
        assert db.get_collection_key("test_coll3", "nonexistent") is None
        assert db.get_collection_key("test_coll3", "nonexistent", "default") == "default"

    def test_delete_collection_key(self, db):
        """Test key deletion"""
        db.set_collection_key("test_coll4", "key1", "value1")
        db.set_collection_key("test_coll4", "key2", "value2")
        
        db.delete_collection_key("test_coll4", "key1")
        
        assert db.get_collection_key("test_coll4", "key1") is None
        assert db.get_collection_key("test_coll4", "key2") == "value2"

    def test_settings_operations(self, db):
        """Test settings storage"""
        db.set_setting("setting1", "value1")
        db.set_setting("setting2", {"nested": "object"})
        
        assert db.get_setting("setting1") == "value1"
        assert db.get_setting("setting2") == {"nested": "object"}
        assert db.get_setting("nonexistent", "default") == "default"

    def test_transaction_commit(self, db):
        """Test transaction commits successfully"""
        with db.transaction() as conn:
            conn.execute("INSERT INTO settings (key, value) VALUES (?, ?)",
                        ("txn_key", '{"transactional": true}'))
        
        # Verify data was committed
        assert db.get_setting("txn_key") == {"transactional": True}

    def test_transaction_rollback(self, db):
        """Test transaction rollback on error"""
        with pytest.raises(Exception):
            with db.transaction() as conn:
                conn.execute("INSERT INTO settings (key, value) VALUES (?, ?)",
                            ("rollback_key", '{"should": "not_exist"}'))
                # Force error
                raise ValueError("Test error")
        
        # Verify rollback worked
        assert db.get_setting("rollback_key") is None

    def test_identifier_validation(self, db):
        """Test identifier validation"""
        from app.database import _validate_identifier, InvalidIdentifierError
        
        # Valid identifiers
        assert _validate_identifier("valid_id", "test") == "valid_id"
        assert _validate_identifier("valid-id", "test") == "valid-id"
        assert _validate_identifier("valid.id", "test") == "valid.id"
        assert _validate_identifier("valid:id", "test") == "valid:id"
        
        # Invalid identifiers
        with pytest.raises(InvalidIdentifierError):
            _validate_identifier("@invalid", "test")
        
        with pytest.raises(InvalidIdentifierError):
            _validate_identifier("", "test")
        
        with pytest.raises(InvalidIdentifierError):
            _validate_identifier("x" * 200, "test")

    def test_concurrent_writes_safe(self, db):
        """Test thread safety of concurrent writes"""
        import threading
        
        results = []
        errors = []

        def writer(value):
            try:
                db.set_setting(f"concurrent_{value}", value)
                results.append("success")
            except Exception as e:
                errors.append(str(e))

        threads = [threading.Thread(target=writer, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Errors occurred: {errors}"
        assert len(results) == 10

    def test_inventory_operations(self, db):
        """Test inventory-specific operations"""
        db.update_inventory("component1", 100.0, 100.0)
        inv = db.fetch_inventory()
        
        assert "component1" in inv
        assert inv["component1"]["grams"] == 100.0

    def test_sanitization_in_validation(self):
        """Test input sanitization"""
        from app.sanitization import InputSanitizer
        
        # Valid text
        text = InputSanitizer.sanitize_text("Hello world")
        assert text == "Hello world"
        
        # HTML escaping
        text = InputSanitizer.sanitize_text("<script>alert('xss')</script>")
        assert "<script>" not in text
        
        # Identifier validation
        identifier = InputSanitizer.sanitize_identifier("valid_id_123")
        assert identifier == "valid_id_123"
        
        # Reject invalid
        with pytest.raises(ValueError):
            InputSanitizer.sanitize_identifier("@invalid")


class TestJournalValidation:
    """Test journal entry validation"""

    def test_journal_entry_types(self):
        """Test valid journal entry types"""
        from app.journal_routes import VALID_ENTRY_TYPES, JournalEntryPayload
        
        assert VALID_ENTRY_TYPES == {"Observation", "Feeding", "Pest", "Training", "Harvest"}
        
        # Invalid type should fail
        with pytest.raises(ValueError):
            JournalEntryPayload(
                entryType="InvalidType",
                priority="High",
                date="2026-02-06",
                phase="Veg"
            )

    def test_journal_metrics_validation(self):
        """Test metrics validation"""
        from app.journal_routes import JournalMetrics
        
        # Valid metrics
        metrics = JournalMetrics(temp=24.5, humidity=60, ec=1.8)
        assert metrics.temp == 24.5
        
        # Negative value should fail
        with pytest.raises(ValueError):
            JournalMetrics(ec=-1.0)

    def test_feeding_details_validation(self):
        """Test feeding details validation"""
        from app.journal_routes import FeedingDetails
        
        # Valid
        details = FeedingDetails(A=10.0, X=5.0, BZ=3.0, EC="2.1", pH="6.2")
        assert details.A == 10.0
        
        # Negative values should fail
        with pytest.raises(ValueError):
            FeedingDetails(A=-1.0, X=5.0, BZ=3.0, EC="2.1", pH="6.2")


class TestMappingOverrides:
    """Test mapping override flow without HA dependencies."""

    def test_mapping_override_applies(self, db):
        from app.main import (
            _apply_mapping_overrides,
            _load_mapping_overrides,
            _set_mapping_override,
            BASE_MAPPING,
            MappingOverridePayload,
        )

        payload = MappingOverridePayload(
            category="live_sensors",
            section="targets",
            role="actual_vpd",
            entity_id="sensor.test_vpd",
        )

        _set_mapping_override(payload)
        overrides = _load_mapping_overrides()
        merged = _apply_mapping_overrides(BASE_MAPPING, overrides)
        targets = merged["live_sensors"]["targets"]
        match = next((item for item in targets if item.get("role") == "actual_vpd"), None)
        assert match is not None
        assert match.get("entity_id") == "sensor.test_vpd"


class TestSecureLogging:
    """Test secure logging functionality"""

    def test_token_redaction(self, caplog):
        """Test that tokens are redacted"""
        import logging
        from app.logging_config import setup_secure_logging
        
        logger = logging.getLogger(__name__)
        caplog.set_level(logging.INFO)
        setup_secure_logging()
        
        secret_token = "super-secret-xyz-123"
        test_header = f"Authorization: Bearer {secret_token}"
        
        logger.info(test_header)
        
        # Check logs don't contain secret
        assert secret_token not in caplog.text
        assert "[REDACTED]" in caplog.text

    def test_api_key_redaction(self, caplog):
        """Test that API keys are redacted"""
        import logging
        from app.logging_config import setup_secure_logging
        
        logger = logging.getLogger(__name__)
        caplog.set_level(logging.INFO)
        setup_secure_logging()
        
        api_key = "sk_test_abcdef123456"
        message = f"api_key={api_key}"
        
        logger.info(message)
        
        assert api_key not in caplog.text
        assert "[REDACTED]" in caplog.text
