if (!ordersCountResult.error) {
  const totalOrders = Number(ordersCountResult.count ?? 0);
  if (ordersEl) ordersEl.textContent = String(totalOrders);
  const ordersBadge = document.querySelector("#orders-nav-count");
  if (ordersBadge) {
    ordersBadge.textContent = String(totalOrders);
    ordersBadge.hidden = totalOrders === 0;
  }
} else {
  if (ordersEl) ordersEl.textContent = "—";
  const ordersBadge = document.querySelector("#orders-nav-count");
  if (ordersBadge) {
    ordersBadge.textContent = "—";
    ordersBadge.hidden = false;
  }
}
if (!productsResult.error && productsEl) {
  productsEl.textContent = String(productsResult.count ?? 0);
} else if (productsEl) {
  productsEl.textContent = "—";
}
if (!inventoryResult.error) {
  const totalStock = (inventoryResult.data || []).reduce(
    (total, item) => total + Number(item.quantity ?? 0),
    0,
  );
  if (stockEl) stockEl.textContent = String(totalStock);
  const stockBadge = document.querySelector("#stock-nav-count");
  if (stockBadge) {
    stockBadge.textContent = String(totalStock);
    stockBadge.hidden = totalStock === 0;
  }
} else {
  if (stockEl) stockEl.textContent = "—";
  const stockBadge = document.querySelector("#stock-nav-count");
  if (stockBadge) {
    stockBadge.textContent = "—";
    stockBadge.hidden = false;
  }
}
