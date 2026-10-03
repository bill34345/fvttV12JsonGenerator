// Local integration is deliberately scoped to the exact accepted target.
// Upstream 5.0.0 spreads baseConfig and accidentally restores its numeric attunement transformer.
if (game.system.version === "6.0.2") {
    VERSIONS["6.0.2"] = {
        ...VERSIONS["5.0.0"],
        ITEM_TRANSFORMER: VERSIONS["4.0.0"].ITEM_TRANSFORMER,
        ITEM_TYPE_HANDLERS: {
            ...VERSIONS["5.0.0"].ITEM_TYPE_HANDLERS,
            container: {
                ...VERSIONS["5.0.0"].ITEM_TYPE_HANDLERS.container,
                [game.itempiles.CONSTANTS.ITEM_TYPE_METHODS.TRANSFER]: ({ item, items, raw = false } = {}) => {
                    if (!item?.parent?.items) return items;
                    const included = new Set(items.map(i => i.id ?? i._id));
                    const visited = new Set([item.id]);
                    const queue = [item.id];
                    while (queue.length) {
                        const parentId = queue.shift();
                        for (const child of item.parent.items.filter(i => i.system.container === parentId)) {
                            if (visited.has(child.id)) continue;
                            visited.add(child.id);
                            // Base 3.3.4 ignores the return value: append to the actual caller-owned list.
                            if (!included.has(child.id)) {
                                items.push(raw ? child : child.toObject());
                                included.add(child.id);
                            }
                            if (child.type === "container") queue.push(child.id);
                        }
                    }
                    return items;
                }
            }
        }
    };
}
