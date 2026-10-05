    if (game.system.version === "6.0.2") {
        const integration = VERSIONS["6.0.2"];
        // Existing Next settings belong to the user. Change the selected code,
        // not all saved defaults when replacing the accidentally cached profile.
        const previousVersion = game.settings.get("item-piles", "systemVersion");
        if (["1.0.6", "1.0.7", "1.0.8", "1.0.9"].includes(previousVersion)) {
            integration.SOFT_MIGRATIONS = {
                ...integration.SOFT_MIGRATIONS,
                [`${previousVersion}-${integration.VERSION}`]: {}
            };
        }
        // Hooks.callAll is synchronous. Register once before a microtask yield,
        // otherwise registerSystemLibwrappers caches the first historical version.
        game.itempiles.API.addSystemIntegration(integration, "6.0.2");
        return;
    }

