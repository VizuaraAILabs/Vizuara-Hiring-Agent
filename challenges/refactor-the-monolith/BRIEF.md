# Refactor the Monolith

## Using Claude Code

Open your terminal and type `claude` to launch your AI assistant. Use it to understand the existing code, discuss refactoring strategies before writing anything, generate module stubs, and verify that tests continue to pass as you move code incrementally. The best approaches here are deliberate and iterative — plan your module boundaries first, then migrate one piece at a time.

## The Situation

You've inherited `monolith.py` — a 500+ line Python inventory management system where every operation flows through a single `do_everything(action, data, inventory, **kwargs)` function. It works. The tests pass. But adding any new feature means reading through hundreds of lines of nested conditionals, and a single mistake anywhere can break everything.

Your task: **refactor this into a clean, modular package** without changing any externally observable behaviour.

## Target Package Structure

Create an `inventory/` package with this layout:

```
inventory/
  __init__.py       — re-exports do_everything() so existing code keeps working
  models.py         — validate_item(data) raises ValueError on invalid input data
  operations.py     — add_item, remove_item, update_quantity, bulk_add functions
  reports.py        — generate_report, generate_value_report, generate_restock_report functions
  discounts.py      — apply_discount(inventory, category, percentage) function
```

## Module Contracts

### `inventory/models.py`
```python
def validate_item(data: dict) -> None:
    """Validate item data. Raises ValueError with a descriptive message if invalid."""
```

### `inventory/operations.py`
```python
def add_item(item_data: dict, inventory: list) -> dict:
    """Add a validated item. Returns {'success': True} or {'success': False, 'error': str}."""

def remove_item(sku: str, inventory: list) -> dict: ...
def update_quantity(sku: str, delta: int, inventory: list) -> dict: ...
def bulk_add(items: list, inventory: list) -> dict: ...
```

### `inventory/reports.py`
```python
def generate_report(inventory: list) -> dict: ...
def generate_value_report(inventory: list) -> dict: ...
def generate_restock_report(inventory: list, threshold: int = 10) -> dict: ...
```

### `inventory/discounts.py`
```python
def apply_discount(inventory: list, category: str, percentage: float = 0.1) -> dict: ...
```

## Getting Started

```bash
pip install pytest
pytest test_monolith.py        # should pass before you touch anything
pytest test_modules.py         # will fail until you create the inventory/ package
```

Work incrementally: create one module, get its tests passing, then move to the next. **Never break `test_monolith.py`.**

## Deliverables

1. `pytest test_monolith.py` — all existing tests still pass (no behaviour changes allowed)
2. `pytest test_modules.py` — all module tests pass
3. `inventory/__init__.py` delegates to your new modules — `do_everything()` must still work

## What's Being Evaluated

- Whether all existing behaviour is preserved (no regressions)
- The cleanliness and coherence of your module interfaces
- How you approach the migration incrementally — moving one concern at a time and verifying
- The quality of the abstractions you design (e.g., where validation lives, how errors propagate)
- How you use the AI assistant to reason about design choices, not just generate boilerplate
