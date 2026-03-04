"""
Tests for the refactored inventory module structure.

Run alongside the existing test suite:
    pytest test_monolith.py test_modules.py

These tests will FAIL until you create the inventory/ package.
They verify that your modules expose the correct public API and
behave identically to the original monolith for each operation.
"""

import pytest

# These imports will all fail until you create the inventory/ package.
# That is intentional — it is the first thing you need to fix.
from inventory.models import validate_item
from inventory.operations import add_item, remove_item, update_quantity, bulk_add
from inventory.reports import generate_report, generate_value_report, generate_restock_report
from inventory.discounts import apply_discount


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def empty_inventory():
    return []


@pytest.fixture
def sample_inventory():
    return [
        {"sku": "WDG-001", "name": "Widget",   "quantity": 50,  "price": 29.99,  "category": "electronics"},
        {"sku": "GAD-002", "name": "Gadget",   "quantity": 5,   "price": 199.99, "category": "electronics"},
        {"sku": "SPR-003", "name": "Sprocket", "quantity": 200, "price": 4.50,   "category": "hardware"},
        {"sku": "BLT-004", "name": "Bolt Pack","quantity": 8,   "price": 12.99,  "category": "hardware"},
        {"sku": "CBL-005", "name": "USB Cable","quantity": 3,   "price": 15.00,  "category": "electronics"},
    ]


# ─── inventory/models.py ──────────────────────────────────────────────────────

class TestValidateItem:
    def test_valid_item_does_not_raise(self):
        # Should complete without error
        validate_item({"sku": "ABC-001", "name": "Test Item", "quantity": 10, "price": 5.0, "category": "general"})

    def test_invalid_sku_format_raises(self):
        with pytest.raises(ValueError, match="SKU"):
            validate_item({"sku": "bad", "name": "Item", "quantity": 1, "price": 1.0, "category": "x"})

    def test_missing_name_raises(self):
        with pytest.raises((ValueError, KeyError)):
            validate_item({"sku": "ABC-001", "quantity": 1, "price": 1.0, "category": "x"})

    def test_negative_quantity_raises(self):
        with pytest.raises(ValueError):
            validate_item({"sku": "ABC-001", "name": "Item", "quantity": -1, "price": 1.0, "category": "x"})

    def test_zero_price_raises(self):
        with pytest.raises(ValueError):
            validate_item({"sku": "ABC-001", "name": "Item", "quantity": 1, "price": 0, "category": "x"})

    def test_missing_category_raises(self):
        with pytest.raises((ValueError, KeyError)):
            validate_item({"sku": "ABC-001", "name": "Item", "quantity": 1, "price": 1.0})


# ─── inventory/operations.py ─────────────────────────────────────────────────

class TestAddItem:
    def test_add_valid_item_succeeds(self, empty_inventory):
        result = add_item(
            {"sku": "ABC-001", "name": "Item", "quantity": 10, "price": 5.0, "category": "general"},
            empty_inventory,
        )
        assert result["success"] is True
        assert len(empty_inventory) == 1
        assert empty_inventory[0]["sku"] == "ABC-001"

    def test_add_invalid_item_returns_error(self, empty_inventory):
        result = add_item({"sku": "bad-sku"}, empty_inventory)
        assert result["success"] is False
        assert "error" in result
        assert len(empty_inventory) == 0

    def test_add_duplicate_sku_returns_error(self, sample_inventory):
        result = add_item(
            {"sku": "WDG-001", "name": "Duplicate", "quantity": 1, "price": 1.0, "category": "x"},
            sample_inventory,
        )
        assert result["success"] is False
        assert "exists" in result["error"].lower()


class TestRemoveItem:
    def test_remove_existing_item(self, sample_inventory):
        result = remove_item("WDG-001", sample_inventory)
        assert result["success"] is True
        assert len(sample_inventory) == 4

    def test_remove_returns_removed_item(self, sample_inventory):
        result = remove_item("WDG-001", sample_inventory)
        assert result.get("removed", {}).get("sku") == "WDG-001"

    def test_remove_nonexistent_returns_error(self, sample_inventory):
        result = remove_item("ZZZ-999", sample_inventory)
        assert result["success"] is False
        assert "not found" in result["error"].lower()


class TestUpdateQuantity:
    def test_increase_quantity(self, sample_inventory):
        result = update_quantity("WDG-001", 10, sample_inventory)
        assert result["success"] is True
        assert result["new_quantity"] == 60

    def test_decrease_quantity(self, sample_inventory):
        result = update_quantity("WDG-001", -20, sample_inventory)
        assert result["success"] is True
        assert result["new_quantity"] == 30

    def test_prevent_negative_quantity(self, sample_inventory):
        result = update_quantity("WDG-001", -9999, sample_inventory)
        assert result["success"] is False

    def test_nonexistent_sku_returns_error(self, sample_inventory):
        result = update_quantity("ZZZ-999", 5, sample_inventory)
        assert result["success"] is False


class TestBulkAdd:
    def test_bulk_add_valid_items(self, empty_inventory):
        items = [
            {"sku": "AA-001", "name": "Alpha", "quantity": 5,  "price": 1.0, "category": "x"},
            {"sku": "BB-002", "name": "Beta",  "quantity": 10, "price": 2.0, "category": "x"},
        ]
        result = bulk_add(items, empty_inventory)
        assert result["added_count"] == 2
        assert len(empty_inventory) == 2

    def test_bulk_add_with_one_invalid(self, empty_inventory):
        items = [
            {"sku": "AA-001", "name": "Good",  "quantity": 5, "price": 1.0, "category": "x"},
            {"sku": "bad",    "name": "Bad",   "quantity": 1, "price": 1.0, "category": "x"},
        ]
        result = bulk_add(items, empty_inventory)
        assert result["added_count"] == 1
        assert result["failed_count"] == 1


# ─── inventory/reports.py ────────────────────────────────────────────────────

class TestGenerateReport:
    def test_report_contains_expected_keys(self, sample_inventory):
        result = generate_report(sample_inventory)
        assert result["success"] is True
        assert result["total_skus"] == 5
        assert "total_value" in result
        assert "low_stock" in result
        assert "category_summary" in result

    def test_total_value_is_correct(self, sample_inventory):
        result = generate_report(sample_inventory)
        expected = (50 * 29.99) + (5 * 199.99) + (200 * 4.50) + (8 * 12.99) + (3 * 15.00)
        assert abs(result["total_value"] - expected) < 0.01

    def test_low_stock_identifies_correct_items(self, sample_inventory):
        result = generate_report(sample_inventory)
        low_skus = [item["sku"] for item in result["low_stock"]]
        assert "GAD-002" in low_skus   # qty 5
        assert "CBL-005" in low_skus   # qty 3
        assert "WDG-001" not in low_skus  # qty 50

    def test_empty_inventory(self, empty_inventory):
        result = generate_report(empty_inventory)
        assert result["total_skus"] == 0
        assert result["total_value"] == 0.0


class TestGenerateValueReport:
    def test_items_sorted_descending_by_value(self, sample_inventory):
        result = generate_value_report(sample_inventory)
        assert result["success"] is True
        values = [item["total_value"] for item in result["items"]]
        assert values == sorted(values, reverse=True)

    def test_total_value_field_correct(self, sample_inventory):
        result = generate_value_report(sample_inventory)
        # SPR-003: 200 * 4.50 = 900 — should be the highest
        assert result["items"][0]["sku"] == "SPR-003"


class TestGenerateRestockReport:
    def test_identifies_items_below_threshold(self, sample_inventory):
        result = generate_restock_report(sample_inventory, threshold=10)
        skus = [item["sku"] for item in result["needs_restock"]]
        assert "GAD-002" in skus   # qty 5
        assert "BLT-004" in skus   # qty 8
        assert "CBL-005" in skus   # qty 3
        assert "WDG-001" not in skus  # qty 50

    def test_custom_threshold(self, sample_inventory):
        result = generate_restock_report(sample_inventory, threshold=100)
        # WDG-001 (50), GAD-002 (5), BLT-004 (8), CBL-005 (3) all below 100
        assert result["restock_count"] == 4

    def test_empty_inventory(self, empty_inventory):
        result = generate_restock_report(empty_inventory)
        assert result["restock_count"] == 0


# ─── inventory/discounts.py ──────────────────────────────────────────────────

class TestApplyDiscount:
    def test_applies_discount_to_category(self, sample_inventory):
        original_price = sample_inventory[0]["price"]  # WDG-001, electronics = 29.99
        result = apply_discount(sample_inventory, "electronics", 0.2)
        assert result["success"] is True
        assert len(result["updated"]) == 3  # 3 electronics items
        assert sample_inventory[0]["price"] == round(original_price * 0.8, 2)

    def test_default_discount_is_10_percent(self, sample_inventory):
        original_price = sample_inventory[0]["price"]
        result = apply_discount(sample_inventory, "electronics")
        assert result["success"] is True
        assert sample_inventory[0]["price"] == round(original_price * 0.9, 2)

    def test_invalid_percentage_returns_error(self, sample_inventory):
        result = apply_discount(sample_inventory, "electronics", 1.5)
        assert result["success"] is False

    def test_nonexistent_category_returns_empty_updated(self, sample_inventory):
        result = apply_discount(sample_inventory, "furniture")
        assert result["success"] is True
        assert len(result["updated"]) == 0
