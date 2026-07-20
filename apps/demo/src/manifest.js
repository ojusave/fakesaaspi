export const manifest = {
    version: "2026-07-19a",
    groups: ["welcome", "signup", "create_app", "keys", "api_call"],
    steps: [
        { id: "welcome", group: "welcome", type: "hero" },
        { id: "name", group: "signup", type: "field" },
        { id: "company", group: "signup", type: "field" },
        { id: "company_email", group: "signup", type: "field", validate: { kind: "email", rejectFreemail: true } },
        { id: "phone", group: "signup", type: "field", validate: { kind: "phone_strict" } },
        { id: "consent", group: "signup", type: "legal", scrollToEnable: true },
        { id: "create_account", group: "signup", type: "action", spinnerMs: 5000 },
        { id: "app_name", group: "create_app", type: "field", validate: { kind: "name_rules", rejectFirst: "already_taken" } },
        { id: "operations", group: "create_app", type: "multiselect", options: 4 },
        { id: "scopes", group: "create_app", type: "multiselect", options: 25 },
        { id: "add_card", group: "create_app", type: "field", validate: { kind: "luhn_inverted" }, safety: { noAutofill: true, neverTransmit: true } },
        { id: "app_terms", group: "create_app", type: "legal", scrollToEnable: true },
        { id: "create_app", group: "create_app", type: "action", spinnerMs: 8000 },
        { id: "copy_keys", group: "keys", type: "copy", artifact: "app_keys" },
        { id: "paste_keys", group: "keys", type: "paste", expects: "app_keys" },
        { id: "generate_token", group: "keys", type: "action", spinnerMs: 3000, produces: "oauth_token" },
        { id: "copy_token", group: "api_call", type: "copy", artifact: "oauth_token" },
        { id: "paste_token", group: "api_call", type: "paste", expects: "oauth_token" },
        { id: "send_request", group: "api_call", type: "action", request: "GET /v1/hello" },
        { id: "response", group: "api_call", type: "success" }
    ]
};
