// Imported through the `@shared` path alias by the aliased module fixture.
// A runtime (non-type) export, so the alias has to actually resolve at load
// time — a type-only import would be erased and prove nothing.
export const SHARED_OWNER = "platform-team";
