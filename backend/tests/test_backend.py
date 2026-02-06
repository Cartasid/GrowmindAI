import sys
import os
from pathlib import Path

# Add backend to sys.path
backend_path = Path(__file__).resolve().parents[1]
sys.path.append(str(backend_path))

os.environ["DATABASE_URL"] = "/tmp/test_growmind_v2.db"
os.environ["SUPERVISOR_TOKEN"] = "fake_token"

try:
    from app.database import db
    from nutrient_engine import NutrientCalculator

    print("Database and NutrientCalculator imported successfully.")

    # Test DB
    db.set_setting("test_key", "test_value")
    val = db.get_setting("test_key")
    print(f"DB Setting test: {val}")

    # Test Nutrient Engine Seeding
    calc = NutrientCalculator(substrate="coco")
    inv = db.fetch_inventory()
    print(f"Inventory seeded components count: {len(inv)}")

    if len(inv) > 0:
        print("Inventory seeding WORKED.")
    else:
        print("Inventory seeding FAILED.")

    # Test Plan
    plan = calc.preview_plan("W1", 10.0)
    print("Nutrient Plan (W1, 10L) preview:")
    print(plan)

    if "ppm" in plan:
        print("PPM data present in plan.")
    else:
        print("PPM data MISSING in plan.")

except Exception as e:
    print(f"Test failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
