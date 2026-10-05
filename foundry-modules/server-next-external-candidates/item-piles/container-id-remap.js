    if (game.system.id === "dnd5e" && game.system.version === "6.0.2") {
        // Assign all new IDs before resolving links, including nested containers.
        // The upstream one-pass root/children map loses grandchildren's parent IDs.
        const remap = new Map();
        const allocated = new Set();
        const parents = new Map(itemsToCreate.map(item => [item, item.system?.container]));
        for (const item of itemsToCreate) {
            let nextId;
            for (let attempt = 0; attempt < 10; attempt++) {
                const candidate = createUniqueId(actor);
                if (!allocated.has(candidate)) { nextId = candidate; break; }
            }
            if (!nextId) throw Helpers.custom_error("Could not allocate unique IDs for transferred containers");
            allocated.add(nextId);
            if (item._id) remap.set(item._id, nextId);
            item._id = nextId;
        }
        for (const item of itemsToCreate) {
            const previousParent = parents.get(item);
            if (previousParent) item.system.container = remap.get(previousParent) ?? "";
        }
        return itemsToCreate;
    }
