"""
Inventory Management System
============================
A fully functional inventory management script.
All operations go through the do_everything() function.
"""

import re
from datetime import datetime

# Global action history
action_history = []


def _log_action(action, details):
    action_history.append({
        "action": action,
        "details": details,
        "timestamp": datetime.now().isoformat()
    })


def do_everything(action, data, inventory, **kwargs):
    """Handle all inventory operations."""

    if action == "add":
        # validate sku
        if data is None:
            _log_action("add", "failed - no data")
            return {"success": False, "error": "No item data provided"}
        if "sku" not in data:
            _log_action("add", "failed - no sku")
            return {"success": False, "error": "SKU is required"}
        tmp = data["sku"]
        if not isinstance(tmp, str):
            _log_action("add", "failed - bad sku type")
            return {"success": False, "error": "SKU must be a string"}
        if not re.match(r"^[A-Z]{2,5}-\d{3}$", tmp):
            _log_action("add", "failed - bad sku format")
            return {"success": False, "error": "SKU must match format XXX-000"}
        # validate name
        if "name" not in data:
            _log_action("add", "failed - no name")
            return {"success": False, "error": "Name is required"}
        if not isinstance(data["name"], str):
            _log_action("add", "failed - bad name type")
            return {"success": False, "error": "Name must be a string"}
        if len(data["name"].strip()) == 0:
            _log_action("add", "failed - empty name")
            return {"success": False, "error": "Name cannot be empty"}
        # validate quantity
        if "quantity" not in data:
            _log_action("add", "failed - no quantity")
            return {"success": False, "error": "Quantity is required"}
        x = data["quantity"]
        if not isinstance(x, int):
            _log_action("add", "failed - bad quantity type")
            return {"success": False, "error": "Quantity must be an integer"}
        if x < 0:
            _log_action("add", "failed - negative quantity")
            return {"success": False, "error": "Quantity cannot be negative"}
        # validate price
        if "price" not in data:
            _log_action("add", "failed - no price")
            return {"success": False, "error": "Price is required"}
        d = data["price"]
        if not isinstance(d, (int, float)):
            _log_action("add", "failed - bad price type")
            return {"success": False, "error": "Price must be a number"}
        if d <= 0:
            _log_action("add", "failed - non-positive price")
            return {"success": False, "error": "Price must be positive"}
        # validate category
        if "category" not in data:
            _log_action("add", "failed - no category")
            return {"success": False, "error": "Category is required"}
        if not isinstance(data["category"], str):
            _log_action("add", "failed - bad category type")
            return {"success": False, "error": "Category must be a string"}
        if len(data["category"].strip()) == 0:
            _log_action("add", "failed - empty category")
            return {"success": False, "error": "Category cannot be empty"}
        # check for duplicate sku
        for itm in inventory:
            if itm["sku"] == data["sku"]:
                _log_action("add", "failed - duplicate sku " + data["sku"])
                return {"success": False, "error": "SKU already exists"}
        # actually add
        inv_item = {
            "sku": data["sku"],
            "name": data["name"],
            "quantity": data["quantity"],
            "price": data["price"],
            "category": data["category"]
        }
        inventory.append(inv_item)
        _log_action("add", "added " + data["sku"])
        return {"success": True, "item": inv_item}

    elif action == "remove":
        if data is None:
            _log_action("remove", "failed - no data")
            return {"success": False, "error": "No SKU provided"}
        if "sku" not in data:
            _log_action("remove", "failed - no sku in data")
            return {"success": False, "error": "SKU is required"}
        tmp = data["sku"]
        if not isinstance(tmp, str):
            _log_action("remove", "failed - bad sku type")
            return {"success": False, "error": "SKU must be a string"}
        # find and remove
        found = False
        idx = -1
        for i in range(len(inventory)):
            if inventory[i]["sku"] == tmp:
                found = True
                idx = i
                break
        if not found:
            _log_action("remove", "failed - sku not found " + tmp)
            return {"success": False, "error": "SKU not found"}
        removed = inventory.pop(idx)
        _log_action("remove", "removed " + tmp)
        return {"success": True, "removed": removed}

    elif action == "update_qty":
        if data is None:
            _log_action("update_qty", "failed - no data")
            return {"success": False, "error": "No data provided"}
        if "sku" not in data:
            _log_action("update_qty", "failed - no sku")
            return {"success": False, "error": "SKU is required"}
        tmp = data["sku"]
        if not isinstance(tmp, str):
            _log_action("update_qty", "failed - bad sku type")
            return {"success": False, "error": "SKU must be a string"}
        if "delta" not in data:
            _log_action("update_qty", "failed - no delta")
            return {"success": False, "error": "Delta is required"}
        d = data["delta"]
        if not isinstance(d, int):
            _log_action("update_qty", "failed - bad delta type")
            return {"success": False, "error": "Delta must be an integer"}
        # find the item
        found = False
        target = None
        for itm in inventory:
            if itm["sku"] == tmp:
                found = True
                target = itm
                break
        if not found:
            _log_action("update_qty", "failed - sku not found " + tmp)
            return {"success": False, "error": "SKU not found"}
        # check resulting quantity
        new_qty = target["quantity"] + d
        if new_qty < 0:
            _log_action("update_qty", "failed - would go negative")
            return {"success": False, "error": "Quantity cannot go below zero"}
        target["quantity"] = new_qty
        _log_action("update_qty", "updated " + tmp + " by " + str(d))
        return {"success": True, "sku": tmp, "old_quantity": target["quantity"] - d, "new_quantity": new_qty}

    elif action == "search":
        if data is None:
            _log_action("search", "failed - no data")
            return {"success": False, "error": "No search criteria provided"}
        results = []
        if "name" in data:
            tmp = data["name"]
            if not isinstance(tmp, str):
                _log_action("search", "failed - bad name type")
                return {"success": False, "error": "Search name must be a string"}
            for itm in inventory:
                if tmp.lower() in itm["name"].lower():
                    # duplicate the item dict for results
                    r = {
                        "sku": itm["sku"],
                        "name": itm["name"],
                        "quantity": itm["quantity"],
                        "price": itm["price"],
                        "category": itm["category"]
                    }
                    results.append(r)
            _log_action("search", "searched by name: " + tmp)
            return {"success": True, "results": results, "count": len(results)}
        elif "category" in data:
            tmp = data["category"]
            if not isinstance(tmp, str):
                _log_action("search", "failed - bad category type")
                return {"success": False, "error": "Search category must be a string"}
            for itm in inventory:
                if itm["category"].lower() == tmp.lower():
                    # duplicate the item dict for results
                    r = {
                        "sku": itm["sku"],
                        "name": itm["name"],
                        "quantity": itm["quantity"],
                        "price": itm["price"],
                        "category": itm["category"]
                    }
                    results.append(r)
            _log_action("search", "searched by category: " + tmp)
            return {"success": True, "results": results, "count": len(results)}
        else:
            _log_action("search", "failed - no valid criteria")
            return {"success": False, "error": "Must provide 'name' or 'category' to search"}

    elif action == "report":
        # generate a text report
        total_items = 0
        total_value = 0.0
        low_stock = []
        high_value = []
        cat_summary = {}

        for itm in inventory:
            total_items += itm["quantity"]
            val = itm["quantity"] * itm["price"]
            total_value += val
            # low stock check - magic number 10
            if itm["quantity"] < 10:
                low_stock.append({
                    "sku": itm["sku"],
                    "name": itm["name"],
                    "quantity": itm["quantity"],
                    "price": itm["price"],
                    "category": itm["category"]
                })
            # high value check - magic number 1000
            if val > 1000:
                high_value.append({
                    "sku": itm["sku"],
                    "name": itm["name"],
                    "quantity": itm["quantity"],
                    "price": itm["price"],
                    "category": itm["category"],
                    "total_value": val
                })
            # category summary
            c = itm["category"]
            if c not in cat_summary:
                cat_summary[c] = {"count": 0, "total_qty": 0, "total_value": 0.0}
            cat_summary[c]["count"] += 1
            cat_summary[c]["total_qty"] += itm["quantity"]
            cat_summary[c]["total_value"] += val

        # build report text with duplicated formatting
        rpt = "=" * 50 + "\n"
        rpt += "INVENTORY REPORT\n"
        rpt += "=" * 50 + "\n"
        rpt += "Generated: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S") + "\n"
        rpt += "-" * 50 + "\n"
        rpt += "\n"
        rpt += "SUMMARY\n"
        rpt += "-" * 50 + "\n"
        rpt += "Total SKUs: " + str(len(inventory)) + "\n"
        rpt += "Total Items in Stock: " + str(total_items) + "\n"
        rpt += "Total Inventory Value: $" + "{:.2f}".format(total_value) + "\n"
        rpt += "\n"

        if len(low_stock) > 0:
            rpt += "LOW STOCK ITEMS (below 10 units)\n"
            rpt += "-" * 50 + "\n"
            for ls in low_stock:
                rpt += "  " + ls["sku"] + " - " + ls["name"]
                rpt += " (Qty: " + str(ls["quantity"]) + ")\n"
            rpt += "\n"

        if len(high_value) > 0:
            rpt += "HIGH VALUE ITEMS (over $1000)\n"
            rpt += "-" * 50 + "\n"
            for hv in high_value:
                rpt += "  " + hv["sku"] + " - " + hv["name"]
                rpt += " (Value: $" + "{:.2f}".format(hv["total_value"]) + ")\n"
            rpt += "\n"

        rpt += "CATEGORY BREAKDOWN\n"
        rpt += "-" * 50 + "\n"
        for cat_name in sorted(cat_summary.keys()):
            cs = cat_summary[cat_name]
            rpt += "  " + cat_name + ":\n"
            rpt += "    SKUs: " + str(cs["count"]) + "\n"
            rpt += "    Total Qty: " + str(cs["total_qty"]) + "\n"
            rpt += "    Total Value: $" + "{:.2f}".format(cs["total_value"]) + "\n"

        rpt += "\n" + "=" * 50 + "\n"

        _log_action("report", "generated report")
        return {
            "success": True,
            "report": rpt,
            "total_skus": len(inventory),
            "total_items": total_items,
            "total_value": total_value,
            "low_stock": low_stock,
            "high_value": high_value,
            "category_summary": cat_summary
        }

    elif action == "discount":
        if data is None:
            _log_action("discount", "failed - no data")
            return {"success": False, "error": "No discount data provided"}
        if "category" not in data:
            _log_action("discount", "failed - no category")
            return {"success": False, "error": "Category is required for discount"}
        tmp = data["category"]
        if not isinstance(tmp, str):
            _log_action("discount", "failed - bad category type")
            return {"success": False, "error": "Category must be a string"}
        # get discount percentage, default to 10% - magic number 0.1
        pct = kwargs.get("percentage", 0.1)
        if not isinstance(pct, (int, float)):
            _log_action("discount", "failed - bad percentage type")
            return {"success": False, "error": "Percentage must be a number"}
        if pct <= 0 or pct >= 1:
            _log_action("discount", "failed - bad percentage range")
            return {"success": False, "error": "Percentage must be between 0 and 1 (exclusive)"}
        # apply discount
        updated = []
        for itm in inventory:
            if itm["category"].lower() == tmp.lower():
                old_price = itm["price"]
                itm["price"] = round(itm["price"] * (1 - pct), 2)
                updated.append({
                    "sku": itm["sku"],
                    "name": itm["name"],
                    "old_price": old_price,
                    "new_price": itm["price"],
                    "category": itm["category"]
                })
        if len(updated) == 0:
            _log_action("discount", "no items in category " + tmp)
            return {"success": True, "updated": [], "message": "No items found in category"}
        _log_action("discount", "applied " + str(pct * 100) + "% discount to " + tmp)
        return {"success": True, "updated": updated, "discount_applied": pct}

    elif action == "restock_check":
        # check what needs restocking
        threshold = 10  # magic number
        if kwargs.get("threshold") is not None:
            t = kwargs["threshold"]
            if isinstance(t, int) and t >= 0:
                threshold = t
        # recommended order is to bring up to 3x threshold - magic number
        multiplier = 3
        needs_restock = []
        for itm in inventory:
            if itm["quantity"] < threshold:
                recommended = (threshold * multiplier) - itm["quantity"]
                if recommended < 0:
                    recommended = 0
                needs_restock.append({
                    "sku": itm["sku"],
                    "name": itm["name"],
                    "current_quantity": itm["quantity"],
                    "threshold": threshold,
                    "recommended_order": recommended,
                    "category": itm["category"],
                    "estimated_cost": round(recommended * itm["price"], 2)
                })
        # sort by quantity ascending
        for i in range(len(needs_restock)):
            for j in range(i + 1, len(needs_restock)):
                if needs_restock[j]["current_quantity"] < needs_restock[i]["current_quantity"]:
                    tmp2 = needs_restock[i]
                    needs_restock[i] = needs_restock[j]
                    needs_restock[j] = tmp2
        # build a restock report with duplicated formatting
        rpt = "=" * 50 + "\n"
        rpt += "RESTOCK REPORT\n"
        rpt += "=" * 50 + "\n"
        rpt += "Generated: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S") + "\n"
        rpt += "-" * 50 + "\n"
        rpt += "Threshold: " + str(threshold) + " units\n"
        rpt += "Items needing restock: " + str(len(needs_restock)) + "\n"
        rpt += "-" * 50 + "\n"
        total_cost = 0.0
        for nr in needs_restock:
            rpt += "  " + nr["sku"] + " - " + nr["name"] + "\n"
            rpt += "    Current: " + str(nr["current_quantity"]) + "\n"
            rpt += "    Order: " + str(nr["recommended_order"]) + " units\n"
            rpt += "    Est. Cost: $" + "{:.2f}".format(nr["estimated_cost"]) + "\n"
            total_cost += nr["estimated_cost"]
        rpt += "-" * 50 + "\n"
        rpt += "Total Estimated Restock Cost: $" + "{:.2f}".format(total_cost) + "\n"
        rpt += "=" * 50 + "\n"
        _log_action("restock_check", "checked restock with threshold " + str(threshold))
        return {
            "success": True,
            "needs_restock": needs_restock,
            "restock_count": len(needs_restock),
            "total_estimated_cost": round(total_cost, 2),
            "report": rpt
        }

    elif action == "bulk_add":
        # add multiple items at once - just calls add in a loop
        if data is None:
            _log_action("bulk_add", "failed - no data")
            return {"success": False, "error": "No items provided"}
        if not isinstance(data, list):
            _log_action("bulk_add", "failed - data not a list")
            return {"success": False, "error": "Data must be a list of items"}
        added = []
        failed = []
        for item_data in data:
            # validate sku - duplicated validation again
            if "sku" not in item_data:
                failed.append({"data": item_data, "error": "SKU is required"})
                continue
            tmp = item_data["sku"]
            if not isinstance(tmp, str):
                failed.append({"data": item_data, "error": "SKU must be a string"})
                continue
            if not re.match(r"^[A-Z]{2,5}-\d{3}$", tmp):
                failed.append({"data": item_data, "error": "SKU must match format XXX-000"})
                continue
            # validate name - duplicated again
            if "name" not in item_data:
                failed.append({"data": item_data, "error": "Name is required"})
                continue
            if not isinstance(item_data["name"], str):
                failed.append({"data": item_data, "error": "Name must be a string"})
                continue
            if len(item_data["name"].strip()) == 0:
                failed.append({"data": item_data, "error": "Name cannot be empty"})
                continue
            # validate quantity - duplicated again
            if "quantity" not in item_data:
                failed.append({"data": item_data, "error": "Quantity is required"})
                continue
            x = item_data["quantity"]
            if not isinstance(x, int):
                failed.append({"data": item_data, "error": "Quantity must be an integer"})
                continue
            if x < 0:
                failed.append({"data": item_data, "error": "Quantity cannot be negative"})
                continue
            # validate price - duplicated again
            if "price" not in item_data:
                failed.append({"data": item_data, "error": "Price is required"})
                continue
            d = item_data["price"]
            if not isinstance(d, (int, float)):
                failed.append({"data": item_data, "error": "Price must be a number"})
                continue
            if d <= 0:
                failed.append({"data": item_data, "error": "Price must be positive"})
                continue
            # validate category - duplicated again
            if "category" not in item_data:
                failed.append({"data": item_data, "error": "Category is required"})
                continue
            if not isinstance(item_data["category"], str):
                failed.append({"data": item_data, "error": "Category must be a string"})
                continue
            if len(item_data["category"].strip()) == 0:
                failed.append({"data": item_data, "error": "Category cannot be empty"})
                continue
            # check for duplicate sku - duplicated again
            dup = False
            for itm in inventory:
                if itm["sku"] == item_data["sku"]:
                    dup = True
                    break
            if dup:
                failed.append({"data": item_data, "error": "SKU already exists"})
                continue
            # also check against items we already added in this batch
            batch_dup = False
            for a in added:
                if a["sku"] == item_data["sku"]:
                    batch_dup = True
                    break
            if batch_dup:
                failed.append({"data": item_data, "error": "Duplicate SKU in batch"})
                continue
            inv_item = {
                "sku": item_data["sku"],
                "name": item_data["name"],
                "quantity": item_data["quantity"],
                "price": item_data["price"],
                "category": item_data["category"]
            }
            inventory.append(inv_item)
            added.append(inv_item)
        _log_action("bulk_add", "bulk added " + str(len(added)) + " items, " + str(len(failed)) + " failed")
        return {"success": True, "added": added, "failed": failed, "added_count": len(added), "failed_count": len(failed)}

    elif action == "value_report":
        # another report with duplicated formatting logic
        items_with_value = []
        for itm in inventory:
            val = itm["quantity"] * itm["price"]
            items_with_value.append({
                "sku": itm["sku"],
                "name": itm["name"],
                "quantity": itm["quantity"],
                "price": itm["price"],
                "category": itm["category"],
                "total_value": round(val, 2)
            })
        # sort by value descending - manual bubble sort
        for i in range(len(items_with_value)):
            for j in range(i + 1, len(items_with_value)):
                if items_with_value[j]["total_value"] > items_with_value[i]["total_value"]:
                    tmp3 = items_with_value[i]
                    items_with_value[i] = items_with_value[j]
                    items_with_value[j] = tmp3
        # duplicated report formatting
        rpt = "=" * 50 + "\n"
        rpt += "VALUE REPORT\n"
        rpt += "=" * 50 + "\n"
        rpt += "Generated: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S") + "\n"
        rpt += "-" * 50 + "\n"
        grand_total = 0.0
        for iv in items_with_value:
            rpt += "  " + iv["sku"] + " - " + iv["name"] + "\n"
            rpt += "    Qty: " + str(iv["quantity"]) + " x $" + "{:.2f}".format(iv["price"])
            rpt += " = $" + "{:.2f}".format(iv["total_value"]) + "\n"
            grand_total += iv["total_value"]
        rpt += "-" * 50 + "\n"
        rpt += "Grand Total: $" + "{:.2f}".format(grand_total) + "\n"
        rpt += "=" * 50 + "\n"
        _log_action("value_report", "generated value report")
        return {"success": True, "items": items_with_value, "grand_total": round(grand_total, 2), "report": rpt}

    else:
        _log_action("unknown", "unknown action: " + str(action))
        return {"success": False, "error": "Unknown action: " + str(action)}


def get_history():
    """Return the global action history."""
    return list(action_history)


def clear_history():
    """Clear the global action history."""
    action_history.clear()
