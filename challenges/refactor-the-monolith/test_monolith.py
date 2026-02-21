"""
Tests for the Inventory Management System.

These tests verify that all operations work correctly.
They should continue to pass after any refactoring.
"""

import pytest
from monolith import do_everything, get_history, clear_history


@pytest.fixture
def empty_inventory():
    """Provide an empty inventory list."""
    return []


@pytest.fixture
def sample_inventory():
    """Provide a pre-populated inventory for testing."""
    return [
        {"sku": "WDG-001", "name": "Widget", "quantity": 50, "price": 29.99, "category": "electronics"},
        {"sku": "GAD-002", "name": "Gadget", "quantity": 5, "price": 199.99, "category": "electronics"},
        {"sku": "SPR-003", "name": "Sprocket", "quantity": 200, "price": 4.50, "category": "hardware"},
        {"sku": "BLT-004", "name": "Bolt Pack", "quantity": 8, "price": 12.99, "category": "hardware"},
        {"sku": "CBL-005", "name": "USB Cable", "quantity": 3, "price": 15.00, "category": "electronics"},
    ]


@pytest.fixture(autouse=True)
def reset_history():
    """Clear action history before each test."""
    clear_history()
    yield
    clear_history()


# ---- ADD ITEM TESTS ----

class TestAddItem:
    def test_add_valid_item(self, empty_inventory):
        result = do_everything("add", {
            "sku": "ABC-001", "name": "Test Item", "quantity": 10, "price": 5.99, "category": "general"
        }, empty_inventory)
        assert result["success"] is True
        assert len(empty_inventory) == 1
        assert empty_inventory[0]["sku"] == "ABC-001"

    def test_add_missing_sku(self, empty_inventory):
        result = do_everything("add", {"name": "No SKU", "quantity": 1, "price": 1.0, "category": "x"}, empty_inventory)
        assert result["success"] is False
        assert "SKU" in result["error"]

    def test_add_invalid_sku_format(self, empty_inventory):
        result = do_everything("add", {
            "sku": "bad", "name": "Bad SKU", "quantity": 1, "price": 1.0, "category": "x"
        }, empty_inventory)
        assert result["success"] is False

    def test_add_empty_name(self, empty_inventory):
        result = do_everything("add", {
            "sku": "ABC-001", "name": "  ", "quantity": 1, "price": 1.0, "category": "x"
        }, empty_inventory)
        assert result["success"] is False
        assert "empty" in result["error"].lower()

    def test_add_negative_quantity(self, empty_inventory):
        result = do_everything("add", {
            "sku": "ABC-001", "name": "Item", "quantity": -5, "price": 1.0, "category": "x"
        }, empty_inventory)
        assert result["success"] is False
        assert "negative" in result["error"].lower()

    def test_add_zero_price(self, empty_inventory):
        result = do_everything("add", {
            "sku": "ABC-001", "name": "Item", "quantity": 1, "price": 0, "category": "x"
        }, empty_inventory)
        assert result["success"] is False
        assert "positive" in result["error"].lower()

    def test_add_duplicate_sku(self, sample_inventory):
        result = do_everything("add", {
            "sku": "WDG-001", "name": "Duplicate", "quantity": 1, "price": 1.0, "category": "x"
        }, sample_inventory)
        assert result["success"] is False
        assert "exists" in result["error"].lower()

    def test_add_no_data(self, empty_inventory):
        result = do_everything("add", None, empty_inventory)
        assert result["success"] is False

    def test_add_missing_category(self, empty_inventory):
        result = do_everything("add", {
            "sku": "ABC-001", "name": "Item", "quantity": 1, "price": 1.0
        }, empty_inventory)
        assert result["success"] is False
        assert "Category" in result["error"]


# ---- REMOVE ITEM TESTS ----

class TestRemoveItem:
    def test_remove_existing_item(self, sample_inventory):
        result = do_everything("remove", {"sku": "WDG-001"}, sample_inventory)
        assert result["success"] is True
        assert result["removed"]["sku"] == "WDG-001"
        assert len(sample_inventory) == 4

    def test_remove_nonexistent_item(self, sample_inventory):
        result = do_everything("remove", {"sku": "ZZZ-999"}, sample_inventory)
        assert result["success"] is False
        assert "not found" in result["error"].lower()

    def test_remove_no_data(self, sample_inventory):
        result = do_everything("remove", None, sample_inventory)
        assert result["success"] is False

    def test_remove_from_empty(self, empty_inventory):
        result = do_everything("remove", {"sku": "ABC-001"}, empty_inventory)
        assert result["success"] is False


# ---- UPDATE QUANTITY TESTS ----

class TestUpdateQuantity:
    def test_increase_quantity(self, sample_inventory):
        result = do_everything("update_qty", {"sku": "WDG-001", "delta": 10}, sample_inventory)
        assert result["success"] is True
        assert result["new_quantity"] == 60

    def test_decrease_quantity(self, sample_inventory):
        result = do_everything("update_qty", {"sku": "WDG-001", "delta": -20}, sample_inventory)
        assert result["success"] is True
        assert result["new_quantity"] == 30

    def test_decrease_below_zero(self, sample_inventory):
        result = do_everything("update_qty", {"sku": "WDG-001", "delta": -100}, sample_inventory)
        assert result["success"] is False
        assert "below zero" in result["error"].lower()

    def test_update_nonexistent_sku(self, sample_inventory):
        result = do_everything("update_qty", {"sku": "ZZZ-999", "delta": 5}, sample_inventory)
        assert result["success"] is False

    def test_update_no_delta(self, sample_inventory):
        result = do_everything("update_qty", {"sku": "WDG-001"}, sample_inventory)
        assert result["success"] is False
        assert "Delta" in result["error"]


# ---- SEARCH TESTS ----

class TestSearch:
    def test_search_by_name(self, sample_inventory):
        result = do_everything("search", {"name": "widget"}, sample_inventory)
        assert result["success"] is True
        assert result["count"] == 1
        assert result["results"][0]["sku"] == "WDG-001"

    def test_search_by_name_partial(self, sample_inventory):
        result = do_everything("search", {"name": "et"}, sample_inventory)
        assert result["success"] is True
        # "Widget" and "Gadget" and "Sprocket" all contain "et"
        assert result["count"] == 3

    def test_search_by_category(self, sample_inventory):
        result = do_everything("search", {"category": "electronics"}, sample_inventory)
        assert result["success"] is True
        assert result["count"] == 3

    def test_search_by_category_case_insensitive(self, sample_inventory):
        result = do_everything("search", {"category": "ELECTRONICS"}, sample_inventory)
        assert result["success"] is True
        assert result["count"] == 3

    def test_search_no_results(self, sample_inventory):
        result = do_everything("search", {"name": "nonexistent"}, sample_inventory)
        assert result["success"] is True
        assert result["count"] == 0

    def test_search_no_criteria(self, sample_inventory):
        result = do_everything("search", {}, sample_inventory)
        assert result["success"] is False

    def test_search_empty_inventory(self, empty_inventory):
        result = do_everything("search", {"name": "anything"}, empty_inventory)
        assert result["success"] is True
        assert result["count"] == 0


# ---- REPORT TESTS ----

class TestReport:
    def test_report_basic(self, sample_inventory):
        result = do_everything("report", {}, sample_inventory)
        assert result["success"] is True
        assert result["total_skus"] == 5
        assert "report" in result

    def test_report_total_value(self, sample_inventory):
        result = do_everything("report", {}, sample_inventory)
        expected = (50 * 29.99) + (5 * 199.99) + (200 * 4.50) + (8 * 12.99) + (3 * 15.00)
        assert abs(result["total_value"] - expected) < 0.01

    def test_report_low_stock(self, sample_inventory):
        result = do_everything("report", {}, sample_inventory)
        low_skus = [item["sku"] for item in result["low_stock"]]
        assert "GAD-002" in low_skus  # qty 5
        assert "BLT-004" in low_skus  # qty 8
        assert "CBL-005" in low_skus  # qty 3
        assert "WDG-001" not in low_skus  # qty 50

    def test_report_category_summary(self, sample_inventory):
        result = do_everything("report", {}, sample_inventory)
        assert "electronics" in result["category_summary"]
        assert "hardware" in result["category_summary"]
        assert result["category_summary"]["electronics"]["count"] == 3

    def test_report_empty_inventory(self, empty_inventory):
        result = do_everything("report", {}, empty_inventory)
        assert result["success"] is True
        assert result["total_skus"] == 0
        assert result["total_value"] == 0.0

    def test_report_contains_text(self, sample_inventory):
        result = do_everything("report", {}, sample_inventory)
        assert "INVENTORY REPORT" in result["report"]
        assert "CATEGORY BREAKDOWN" in result["report"]


# ---- DISCOUNT TESTS ----

class TestDiscount:
    def test_apply_discount(self, sample_inventory):
        original_price = sample_inventory[0]["price"]  # WDG-001, electronics
        result = do_everything("discount", {"category": "electronics"}, sample_inventory, percentage=0.2)
        assert result["success"] is True
        assert len(result["updated"]) == 3
        assert sample_inventory[0]["price"] == round(original_price * 0.8, 2)

    def test_discount_default_percentage(self, sample_inventory):
        original_price = sample_inventory[0]["price"]
        result = do_everything("discount", {"category": "electronics"}, sample_inventory)
        assert result["success"] is True
        assert sample_inventory[0]["price"] == round(original_price * 0.9, 2)

    def test_discount_nonexistent_category(self, sample_inventory):
        result = do_everything("discount", {"category": "food"}, sample_inventory)
        assert result["success"] is True
        assert len(result["updated"]) == 0

    def test_discount_invalid_percentage(self, sample_inventory):
        result = do_everything("discount", {"category": "electronics"}, sample_inventory, percentage=1.5)
        assert result["success"] is False

    def test_discount_no_data(self, sample_inventory):
        result = do_everything("discount", None, sample_inventory)
        assert result["success"] is False


# ---- RESTOCK CHECK TESTS ----

class TestRestockCheck:
    def test_restock_default_threshold(self, sample_inventory):
        result = do_everything("restock_check", {}, sample_inventory)
        assert result["success"] is True
        restock_skus = [item["sku"] for item in result["needs_restock"]]
        assert "GAD-002" in restock_skus
        assert "BLT-004" in restock_skus
        assert "CBL-005" in restock_skus
        assert "WDG-001" not in restock_skus

    def test_restock_custom_threshold(self, sample_inventory):
        result = do_everything("restock_check", {}, sample_inventory, threshold=100)
        assert result["success"] is True
        # WDG-001 (50) and GAD-002 (5) and BLT-004 (8) and CBL-005 (3) are all below 100
        assert result["restock_count"] == 4

    def test_restock_recommended_order(self, sample_inventory):
        result = do_everything("restock_check", {}, sample_inventory)
        # CBL-005 has qty 3, threshold 10, so recommended = (10*3) - 3 = 27
        cbl = [item for item in result["needs_restock"] if item["sku"] == "CBL-005"][0]
        assert cbl["recommended_order"] == 27

    def test_restock_sorted_by_quantity(self, sample_inventory):
        result = do_everything("restock_check", {}, sample_inventory)
        quantities = [item["current_quantity"] for item in result["needs_restock"]]
        assert quantities == sorted(quantities)

    def test_restock_empty_inventory(self, empty_inventory):
        result = do_everything("restock_check", {}, empty_inventory)
        assert result["success"] is True
        assert result["restock_count"] == 0

    def test_restock_report_text(self, sample_inventory):
        result = do_everything("restock_check", {}, sample_inventory)
        assert "RESTOCK REPORT" in result["report"]


# ---- EDGE CASE TESTS ----

class TestEdgeCases:
    def test_unknown_action(self, empty_inventory):
        result = do_everything("explode", {}, empty_inventory)
        assert result["success"] is False
        assert "Unknown action" in result["error"]

    def test_action_history_recorded(self, sample_inventory):
        do_everything("report", {}, sample_inventory)
        history = get_history()
        assert len(history) >= 1
        assert history[-1]["action"] == "report"

    def test_add_then_remove(self, empty_inventory):
        do_everything("add", {
            "sku": "TMP-001", "name": "Temporary", "quantity": 1, "price": 1.0, "category": "temp"
        }, empty_inventory)
        assert len(empty_inventory) == 1
        do_everything("remove", {"sku": "TMP-001"}, empty_inventory)
        assert len(empty_inventory) == 0

    def test_add_update_verify(self, empty_inventory):
        do_everything("add", {
            "sku": "TMP-001", "name": "Temporary", "quantity": 10, "price": 5.0, "category": "temp"
        }, empty_inventory)
        do_everything("update_qty", {"sku": "TMP-001", "delta": -3}, empty_inventory)
        assert empty_inventory[0]["quantity"] == 7

    def test_discount_then_report(self, sample_inventory):
        do_everything("discount", {"category": "electronics"}, sample_inventory, percentage=0.5)
        result = do_everything("report", {}, sample_inventory)
        assert result["success"] is True
        # Prices should be halved for electronics items
        widget = [i for i in sample_inventory if i["sku"] == "WDG-001"][0]
        assert widget["price"] == round(29.99 * 0.5, 2)

    def test_bulk_add(self, empty_inventory):
        items = [
            {"sku": "AA-001", "name": "Item A", "quantity": 10, "price": 1.0, "category": "cat"},
            {"sku": "BB-002", "name": "Item B", "quantity": 20, "price": 2.0, "category": "cat"},
        ]
        result = do_everything("bulk_add", items, empty_inventory)
        assert result["success"] is True
        assert result["added_count"] == 2
        assert len(empty_inventory) == 2

    def test_bulk_add_with_invalid(self, empty_inventory):
        items = [
            {"sku": "AA-001", "name": "Item A", "quantity": 10, "price": 1.0, "category": "cat"},
            {"sku": "bad", "name": "Bad SKU", "quantity": 1, "price": 1.0, "category": "cat"},
        ]
        result = do_everything("bulk_add", items, empty_inventory)
        assert result["added_count"] == 1
        assert result["failed_count"] == 1

    def test_value_report(self, sample_inventory):
        result = do_everything("value_report", {}, sample_inventory)
        assert result["success"] is True
        assert "VALUE REPORT" in result["report"]
        # Should be sorted descending by value
        values = [item["total_value"] for item in result["items"]]
        assert values == sorted(values, reverse=True)
