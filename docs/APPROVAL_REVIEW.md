# Independent approval review

The main model remains selected per chat in the composer. In **Settings → Models**,
turn on **Use a separate approval model**, choose an already configured custom
provider and model, then set its context budget and reasoning effort. For example,
two routes backed by the same Strata weights may use different main/review budgets;
providers backed by different models work through the same configuration path.
Saving does not restart running work. The page distinguishes saved settings from
the current process configuration and shows when a restart is required.

This setting controls approval review ("Approve for me"), not code review (`/review`).
With the switch off, Codex's default reviewer selection is retained. That may be
a provider-preferred reviewer for built-in models rather than the main model.

Independent routing currently requires custom Responses providers for both the main
and approval models, with local or API-key authentication. Subscription, OAuth,
AWS/signed-auth provider transports are not rerouted. With independent routing
active, an unsupported main provider cannot start an automatically reviewed turn:
select manual approval or disable the separate reviewer and restart. It does not
silently spend tokens on the main model instead.

The model catalog is read once by Codex CLI 0.163.0. Lemma builds a process-private
catalog and passes it as a process override; it never rewrites the shared Codex
home, provider definitions, model catalog, login, or installed plugin state.
The approval model uses a hidden implementation alias and its own context budget.
New main model IDs added while independent review is active require a restart.
Changes to reviewer-provider credentials or transport also require a restart.

The native CLI still constructs, budgets and executes the review, handles tool
permissions, and decides whether manual approval is required. Lemma does not trim
messages at the gateway or implement an alternative approval policy. Provider
errors, inadequate review budget, and invalid results must not become approval;
they return to the CLI's manual/denial behavior. Model quality remains a separate
question: a saved or loaded configuration is not a verified model connection or
proof of reliable review decisions.

Validation uses synthetic localhost endpoints and a disposable home/workspace to
check allow/deny, budget exhaustion, provider failure, long input, and independent
credentials. Real model, GPU-memory, context-capacity and main→review→main cache
measurements are recorded separately; passing the protocol fixtures does not
establish those results.
