export function addResources(state, resources) {
  for (const [resource, amount] of Object.entries(resources)) {
    const targetResource = resource === "coins" ? "gold" : resource;
    state.resources[targetResource] = (state.resources[targetResource] ?? 0) + amount;
  }
}

export function addItem(state, itemId, quantity = 1) {
  const existing = state.inventory.find((entry) => entry.itemId === itemId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    state.inventory.push({ itemId, quantity });
  }
}

export function getInventoryGroups(state, data) {
  return state.inventory.map((entry) => ({
    ...entry,
    item: data.items.find((item) => item.id === entry.itemId)
  })).filter((entry) => entry.item);
}
