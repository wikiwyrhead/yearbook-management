export class DesignProviderNotConfiguredError extends Error {
    constructor(providerId, hint) {
        super(`${providerId} is not configured: ${hint}`);
        this.name = "DesignProviderNotConfiguredError";
    }
}
