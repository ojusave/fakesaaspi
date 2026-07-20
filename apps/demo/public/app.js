import {
  createArtifact,
  formatDuration,
  loadArtifact,
  saveArtifact,
  validateField,
} from "./flow.js";

const FOOTER =
  "A parody built for a DevRelCon workshop. Nothing you type is stored or transmitted.";
const GITHUB_URL = "https://github.com/ojusave/fakesaaspi";

const SIGNUP_IDS = [
  "name",
  "company",
  "company_email",
  "phone",
  "consent",
];

const SCOPES = [
  "widget:read",
  "widget:write",
  "widget.meta:read",
  "widget.meta:write",
  "sprocket:read",
  "sprocket:write",
  "sprocket.legacy:read",
  "flange:admin",
  "flange:rotate",
  "grommet:read",
  "grommet:write",
  "grommet:purge",
  "synergy:align",
  "pipeline:read",
  "pipeline:write",
  "pipeline.v2:read",
  "telemetry:emit",
  "telemetry:absorb",
  "user:impersonate_lite",
  "billing:observe",
  "webhook:subscribe",
  "webhook:unsubscribe_maybe",
  "admin:frobnicate",
  "hello:read",
  "everything:all",
];

const LEGAL = {
  consent: `Fine print (we are not lawyers, we are vibes)

By checking this box you agree that fakesaaspi may email you approximately seven newsletters about synergy, one of which might be good. You also agree that "quarterly synergy reports" is a phrase we typed with a straight face on purpose.

We may send you:
Product updates you will ignore.
Partner offers for widgets that do not exist.
A solemn PDF titled Synergy Q3 that is mostly clip art of handshakes.

You can unsubscribe by yelling "synergy" into a well, or by using the unsubscribe link, whichever feels more on brand.

Nothing you type here is stored. This box exists so the projector can watch you hesitate, sigh, and check it anyway.`,

  app_terms: `Terms you will not read (but must check)

By agreeing, you confirm you are a Serious Developer who creates apps for reasons, possibly even good ones. You also confirm that "provisioning" is a fun word to say at parties.

You promise not to:
Name your app "test" and then act surprised when it is taken.
Paste your client secret into Slack and blame the culture.
Demand enterprise support for a free workshop parody.

Credentials shown once are shown once. If you go back, we revoke them for "security," which is code for comedy.

Scopes selected here "cannot be changed later." (They can. Everything can. That is the joke.)

Nothing typed here is stored. Checking this box mostly proves you can still move your thumb after the scopes list.`,
};

const fm = () => window.firstmile;

let manifest = null;
let steps = [];
let indexById = new Map();
let stepIndex = 0;
let nav = "forward";
let fromStep = undefined;
let releaseUrl = GITHUB_URL;
let portalState = "trap";
let lastMeta = null;
let flowStartedAt = Date.now();
const attempts = Object.create(null);
const pasteFails = Object.create(null);
let advancing = false;
let creatingApp = false;

const CREATE_APP_IDS = [
  "app_name",
  "operations",
  "scopes",
  "add_card",
  "app_terms",
  "create_app",
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shell(inner) {
  return `
    <main>${inner}</main>
    <footer>
      <p>${FOOTER}</p>
      <p><a href="${GITHUB_URL}">GitHub repository</a></p>
    </footer>
  `;
}

function isSignupStep(step) {
  return SIGNUP_IDS.includes(step.id);
}

function isCreateAppStep(step) {
  return CREATE_APP_IDS.includes(step.id);
}

function dashboardChrome(inner) {
  return `
    <div class="dash-bar">
      <strong>fakesaaspi</strong>
      <span class="dash-muted">Apps</span>
    </div>
    ${inner}
  `;
}

function renderAppsDashboard() {
  return dashboardChrome(`
    <h1>Apps</h1>
    <div class="empty-dash">
      <p class="empty-title">No apps yet</p>
      <p class="helper">This dashboard is emptier than a staging README. Create an app to begin your enterprise journey.</p>
      <button type="button" id="create-app">Create app</button>
    </div>
  `);
}

function legalHtml(text) {
  const blocks = text.split(/\n\n+/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.length === 1 && lines[0].length < 60 && !lines[0].endsWith(".")) {
        return `<h2>${escapeHtml(lines[0])}</h2>`;
      }
      return `<p>${escapeHtml(block.replaceAll("\n", " "))}</p>`;
    })
    .join("");
}

function currentStep() {
  return steps[stepIndex];
}

function goToIndex(nextIndex, direction, from) {
  if (nextIndex < 0 || nextIndex >= steps.length) return;
  stepIndex = nextIndex;
  nav = direction;
  fromStep = from;
  const step = currentStep();
  if (step.id === "app_name" && direction === "forward") {
    creatingApp = false;
  }
  if (direction === "forward") {
    history.pushState({ stepId: step.id }, "", `#${step.id}`);
  }
  render();
}

function advance() {
  if (advancing) return;
  const step = currentStep();
  fm()?.complete(step.id);
  if (stepIndex >= steps.length - 1) return;
  goToIndex(stepIndex + 1, "forward", step.id);
}

function showRelease() {
  const root = document.getElementById("app");
  root.innerHTML = shell(`
    <h1>The opposite of everything you just experienced.</h1>
    <a class="button" href="${escapeHtml(releaseUrl)}">Get the workshop materials</a>
    <p class="sub">One tap. No signup. No card. That is the whole point.</p>
  `);
}

function trackView() {
  const step = currentStep();
  if (!step) return;
  if (fromStep === undefined) fm()?.view(step.id, nav);
  else fm()?.view(step.id, nav, fromStep);
}

function ensureArtifact(name, rotate) {
  if (rotate || !loadArtifact(name)) {
    const value = createArtifact(name);
    saveArtifact(name, value);
    return value;
  }
  return loadArtifact(name);
}

function renderHero() {
  return `
    <h1>fakesaaspi</h1>
    <p class="sub">The enterprise-grade API platform for modern builders. Start building in minutes.</p>
    <button type="button" id="primary">Get started</button>
  `;
}

function renderSignup() {
  return `
    <h1>Create your account</h1>
    <p class="helper">One page. Many feelings. Required to personalize your journey.</p>
    <form id="signup-form">
      <label for="name">Full name</label>
      <input id="name" name="name" type="text" autocomplete="off" />

      <label for="company" style="margin-top:14px">Company name</label>
      <input id="company" name="company" type="text" autocomplete="off" />

      <label for="company_email" style="margin-top:14px">Work email</label>
      <input id="company_email" name="company_email" type="text" autocapitalize="off" autocorrect="off" autocomplete="off" />

      <label for="phone" style="margin-top:14px">Phone number</label>
      <input id="phone" name="phone" type="text" inputmode="numeric" autocomplete="off" />

      <h1 style="margin-top:22px;font-size:18px">Communications consent</h1>
      <div class="legal-wrap">
        <div class="legal" id="legal" tabindex="0">${legalHtml(LEGAL.consent)}</div>
      </div>
      <label class="agreement">
        <input type="checkbox" id="agree" />
        <span>I agree to receive product updates, partner offers, and quarterly synergy reports.</span>
      </label>
      <p class="error" id="err" hidden></p>
      <button type="submit" id="primary" disabled>Continue</button>
    </form>
  `;
}

function renderField(step) {
  const id = step.id;
  let label = "Value";
  let button = "Continue";
  let helper = "";
  let heading = "";
  let inputName = id;
  let inputMode = "";
  let auto = 'autocapitalize="sentences"';
  let autocomplete = 'autocomplete="off"';

  if (id === "app_name") {
    heading = "New app";
    label = "App name";
    button = "Create";
  } else if (id === "add_card") {
    heading = "Add a test credit card";
    helper =
      "Required to verify you are a serious developer. Use any test card. Do not use a real card.";
    label = "Card number";
    button = "Add card";
    inputName = "fld_x9";
    inputMode = 'inputmode="numeric"';
    autocomplete = 'autocomplete="off"';
  }

  const body = `
    ${heading ? `<h1>${heading}</h1>` : ""}
    ${helper ? `<p class="helper">${helper}</p>` : ""}
    <form id="step-form">
      <label for="field">${label}</label>
      <input id="field" name="${inputName}" type="text" ${inputMode} ${auto} ${autocomplete} />
      <p class="error" id="err" hidden></p>
      <button type="submit" id="primary">${button}</button>
    </form>
  `;
  return isCreateAppStep(step) ? dashboardChrome(body) : body;
}

function renderMultiselect(step) {
  let body = "";
  if (step.id === "operations") {
    const options = ["Read", "Write", "Admin", "Webhooks"];
    body = `
      <h1>Select operations</h1>
      <div class="choices" id="choices">
        ${options
          .map(
            (opt) => `
          <label class="choice">
            <input type="checkbox" name="op" value="${opt}" />
            <span><strong>${opt}</strong><small>Grants access to related resources.</small></span>
          </label>`,
          )
          .join("")}
      </div>
      <button type="button" id="primary">Continue</button>
    `;
  } else {
    body = `
      <h1>Choose scopes</h1>
      <p class="helper">Select the scopes your application requires. This cannot be changed later. (It can be changed later.)</p>
      <div class="choices" id="choices">
        ${SCOPES.map(
          (scope) => `
          <label class="choice">
            <input type="checkbox" name="scope" value="${scope}" />
            <span><strong>${escapeHtml(scope)}</strong></span>
          </label>`,
        ).join("")}
      </div>
      <p class="error" id="err" hidden></p>
      <button type="button" id="primary" disabled>Continue</button>
    `;
  }
  return dashboardChrome(body);
}

function renderLegal() {
  const body = `
    <h1>Application terms of service</h1>
    <div class="legal-wrap">
      <div class="legal" id="legal">${legalHtml(LEGAL.app_terms)}</div>
    </div>
    <label class="agreement">
      <input type="checkbox" id="agree" disabled />
      <span>I have read and agree to the Application Terms.</span>
    </label>
    <button type="button" id="primary" disabled>Agree and continue</button>
  `;
  return dashboardChrome(body);
}

function renderAction(step) {
  let text = "Working...";
  if (step.id === "create_account") text = "Setting up your workspace...";
  else if (step.id === "create_app") text = "Provisioning your application...";
  else if (step.id === "generate_token") text = "Minting token...";
  else if (step.id === "send_request") text = "Sending...";
  const body = `
    <div class="spinner" aria-hidden="true"></div>
    <p class="status">${text}</p>
  `;
  return step.id === "create_app" ? dashboardChrome(body) : body;
}

function renderCopy(step) {
  const isKeys = step.artifact === "app_keys";
  const rotate = nav === "back";
  const value = ensureArtifact(step.artifact, rotate);
  const revoked = rotate
    ? isKeys
      ? "Your previous keys were revoked for security. New keys have been generated."
      : "Your previous token was revoked for security. A new token has been minted."
    : "";
  const heading = isKeys ? "Your app keys" : "Your OAuth token";
  const warning = isKeys
    ? `<p class="warning">Your client secret will not be shown again.</p>`
    : "";
  const copyLabel = isKeys ? "Copy keys" : "Copy token";
  const contLabel = isKeys ? "I copied them" : "Continue";

  return `
    <h1>${heading}</h1>
    ${revoked ? `<p class="notice">${revoked}</p>` : ""}
    ${warning}
    <pre class="keys" id="artifact">${escapeHtml(value)}</pre>
    <button type="button" id="copy">${copyLabel}</button>
    <button type="button" id="primary">${contLabel}</button>
  `;
}

function renderPaste(step) {
  const isKeys = step.expects === "app_keys";
  const heading = isKeys ? "Verify your keys" : "Make your first API call";
  const helper = isKeys
    ? "Paste your app keys to generate an OAuth token."
    : "GET /v1/hello";
  const label = isKeys ? "App keys" : "Authorization: Bearer";
  const button = isKeys ? "Generate token" : "Send request";
  const showAgain = (pasteFails[step.id] || 0) >= 3;

  return `
    <h1>${heading}</h1>
    <p class="helper">${helper}</p>
    <form id="step-form">
      <label for="field">${label}</label>
      <textarea id="field" autocapitalize="off" autocorrect="off" autocomplete="off"></textarea>
      <p class="error json" id="err" hidden></p>
      <button type="submit" id="primary">${button}</button>
    </form>
    ${
      showAgain
        ? `<button type="button" class="linkish" id="show-again">Show it again</button>`
        : ""
    }
  `;
}

function renderSuccess(rankLine) {
  return `
    <p class="http-ok">200 OK</p>
    <pre class="keys">{"message":"hello, you actually shipped"}</pre>
    <h1>You shipped.</h1>
    ${rankLine ? `<p class="sub">${rankLine}</p>` : ""}
    <p class="sub">Look up at the screen.</p>
  `;
}

function fieldErrorMessage(stepId, code) {
  const messages = {
    freemail: "Please use your work email address.",
    format:
      stepId === "phone"
        ? "Invalid format. Expected: +1-XXX-XXX-XXXX"
        : stepId === "add_card"
          ? "Card numbers are 16 digits."
          : "",
    already_taken:
      "That app name is already taken. Names must be 3 to 30 characters with no spaces.",
    card_declined: "Card declined. Please try a different test card.",
  };
  return messages[code] || "";
}

function bindSignup() {
  const form = document.getElementById("signup-form");
  const agree = document.getElementById("agree");
  const primary = document.getElementById("primary");
  const err = document.getElementById("err");
  const legal = document.getElementById("legal");
  let scrolled = false;

  function sync() {
    primary.disabled = !(scrolled && agree.checked);
  }

  function checkScroll() {
    if (legal.scrollHeight <= legal.clientHeight + 4) {
      scrolled = true;
      sync();
      return;
    }
    if (legal.scrollTop + legal.clientHeight >= legal.scrollHeight - 4) {
      scrolled = true;
      sync();
    }
  }

  function trackSignupField(id) {
    const previous = currentStep()?.id;
    if (previous === id) return;
    fm()?.view(id, "forward", previous);
    const idx = indexById.get(id);
    if (idx !== undefined) stepIndex = idx;
  }

  legal.addEventListener("scroll", () => {
    trackSignupField("consent");
    checkScroll();
  });
  agree.addEventListener("change", sync);
  agree.addEventListener("focus", () => trackSignupField("consent"));
  checkScroll();

  // Projector: report which signup field they are on
  for (const id of ["name", "company", "company_email", "phone"]) {
    const input = document.getElementById(id);
    if (!input) continue;
    input.addEventListener("focus", () => trackSignupField(id));
  }
  legal.addEventListener("focus", () => trackSignupField("consent"));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (primary.disabled) return;

    const fields = [
      ["name", document.getElementById("name").value],
      ["company", document.getElementById("company").value],
      ["company_email", document.getElementById("company_email").value],
      ["phone", document.getElementById("phone").value],
    ];

    for (const [id, value] of fields) {
      attempts[id] = (attempts[id] || 0) + 1;
      const result = validateField(id, value, attempts[id]);
      if (!result.ok) {
        fm()?.error(id, result.code, attempts[id]);
        const message = fieldErrorMessage(id, result.code);
        err.hidden = !message;
        err.textContent = message;
        return;
      }
    }

    document.getElementById("name").value = "";
    document.getElementById("company").value = "";
    document.getElementById("company_email").value = "";
    document.getElementById("phone").value = "";
    err.hidden = true;

    let previous = currentStep()?.id;
    for (const id of SIGNUP_IDS) {
      if (id !== previous) {
        fm()?.view(id, "forward", previous);
      }
      fm()?.complete(id);
      previous = id;
    }

    const next = indexById.get("create_account");
    if (next === undefined) return;
    goToIndex(next, "forward", "consent");
  });
}

function bindField(step) {
  const form = document.getElementById("step-form");
  const field = document.getElementById("field");
  const err = document.getElementById("err");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = field.value;
    attempts[step.id] = (attempts[step.id] || 0) + 1;
    const result = validateField(step.id, value, attempts[step.id]);
    field.value = "";
    if (!result.ok) {
      fm()?.error(step.id, result.code, attempts[step.id]);
      const message = fieldErrorMessage(step.id, result.code);
      if (message) {
        err.hidden = false;
        err.textContent = message;
      } else {
        err.hidden = true;
      }
      return;
    }
    err.hidden = true;
    advance();
  });
}

function bindMultiselect(step) {
  const primary = document.getElementById("primary");
  if (step.id === "scopes") {
    const sync = () => {
      const selected = document.querySelectorAll('input[name="scope"]:checked');
      primary.disabled = selected.length === 0;
    };
    document.getElementById("choices").addEventListener("change", sync);
    sync();
  }
  primary.addEventListener("click", () => {
    if (primary.disabled) return;
    advance();
  });
}

function bindLegal() {
  const legal = document.getElementById("legal");
  const agree = document.getElementById("agree");
  const primary = document.getElementById("primary");
  let scrolled = false;

  function sync() {
    primary.disabled = !(scrolled && agree.checked);
  }

  function checkScroll() {
    if (legal.scrollTop + legal.clientHeight >= legal.scrollHeight - 4) {
      scrolled = true;
      agree.disabled = false;
      sync();
    }
  }

  legal.addEventListener("scroll", checkScroll);
  agree.addEventListener("change", sync);
  checkScroll();
  primary.addEventListener("click", () => {
    if (!primary.disabled) advance();
  });
}

function bindAction(step) {
  advancing = true;
  let ms = step.spinnerMs;
  if (step.id === "send_request") ms = 800;
  if (typeof ms !== "number") ms = 1000;

  window.setTimeout(() => {
    advancing = false;
    if (step.id === "generate_token") {
      ensureArtifact("oauth_token", true);
    }
    advance();
  }, ms);
}

function bindCopy(step) {
  document.getElementById("copy").addEventListener("click", async () => {
    const text = document.getElementById("artifact").textContent || "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard may be unavailable; continue still works.
    }
    fm()?.copy(step.artifact);
  });
  document.getElementById("primary").addEventListener("click", () => advance());
}

function bindPaste(step) {
  const form = document.getElementById("step-form");
  const field = document.getElementById("field");
  const err = document.getElementById("err");
  const showAgain = document.getElementById("show-again");

  if (showAgain) {
    showAgain.addEventListener("click", () => {
      const targetId =
        step.expects === "app_keys" ? "copy_keys" : "copy_token";
      const target = indexById.get(targetId);
      if (target === undefined) return;
      goToIndex(target, "forward", step.id);
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const expected = loadArtifact(step.expects) || "";
    const provided = field.value.trim();
    field.value = "";
    const ok = provided === expected && expected.length > 0;
    fm()?.paste(step.id, ok);
    if (!ok) {
      pasteFails[step.id] = (pasteFails[step.id] || 0) + 1;
      const code =
        step.id === "paste_keys" ? "invalid_client" : "invalid_grant";
      attempts[step.id] = (attempts[step.id] || 0) + 1;
      fm()?.error(step.id, code, attempts[step.id]);
      err.hidden = false;
      err.textContent =
        step.id === "paste_keys"
          ? '{"error":"invalid_client","status":401}'
          : '{"error":"invalid_grant","status":401}';
      if (pasteFails[step.id] >= 3) render();
      return;
    }
    advance();
  });
}

async function bindSuccess() {
  history.replaceState({ stepId: "response", terminal: true }, "", "#response");
  const priorShipped =
    lastMeta && typeof lastMeta.shipped === "number" ? lastMeta.shipped : null;
  fm()?.complete("response");
  fm()?.shipped();

  let rankLine = "";
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    if (
      lastMeta &&
      typeof lastMeta.shipped === "number" &&
      typeof lastMeta.started === "number" &&
      (priorShipped === null || lastMeta.shipped !== priorShipped)
    ) {
      rankLine = `#${lastMeta.shipped} of ${lastMeta.started}. Total time: ${formatDuration(Date.now() - flowStartedAt)}.`;
      break;
    }
  }

  const root = document.getElementById("app");
  root.innerHTML = shell(renderSuccess(rankLine));
}

function bindDashboard() {
  document.getElementById("create-app").addEventListener("click", () => {
    creatingApp = true;
    const root = document.getElementById("app");
    root.innerHTML = shell(renderBody(currentStep()));
    bind();
  });
}

function bind() {
  const step = currentStep();
  if (!step) return;
  if (step.type === "hero") {
    document.getElementById("primary").addEventListener("click", () => advance());
  } else if (isSignupStep(step)) {
    bindSignup();
  } else if (step.id === "app_name" && !creatingApp) {
    bindDashboard();
  } else if (step.type === "field") {
    bindField(step);
  } else if (step.type === "multiselect") {
    bindMultiselect(step);
  } else if (step.type === "legal") {
    bindLegal();
  } else if (step.type === "action") {
    bindAction(step);
  } else if (step.type === "copy") {
    bindCopy(step);
  } else if (step.type === "paste") {
    bindPaste(step);
  } else if (step.type === "success") {
    void bindSuccess();
  }
}

function renderBody(step) {
  if (isSignupStep(step)) return renderSignup();
  if (step.id === "app_name" && !creatingApp) return renderAppsDashboard();
  switch (step.type) {
    case "hero":
      return renderHero();
    case "field":
      return renderField(step);
    case "multiselect":
      return renderMultiselect(step);
    case "legal":
      return renderLegal();
    case "action":
      return renderAction(step);
    case "copy":
      return renderCopy(step);
    case "paste":
      return renderPaste(step);
    case "success":
      return renderSuccess("");
    default:
      return `<p>Unknown step type.</p>`;
  }
}

function render() {
  if (portalState === "release") {
    showRelease();
    return;
  }
  const step = currentStep();
  const root = document.getElementById("app");
  root.innerHTML = shell(renderBody(step));
  trackView();
  bind();
}

function onPopState(event) {
  const stepId = event.state && event.state.stepId;
  if (typeof stepId !== "string" || !indexById.has(stepId)) return;
  const next = indexById.get(stepId);
  const prevId = currentStep()?.id;
  stepIndex = next;
  nav = "back";
  fromStep = prevId;
  render();
}

async function boot() {
  let writeKey = "";
  const configResponse = await fetch("/api/config", { cache: "no-store" });
  if (configResponse.ok) {
    const config = await configResponse.json();
    if (typeof config.releaseUrl === "string") releaseUrl = config.releaseUrl;
    if (typeof config.writeKey === "string") writeKey = config.writeKey;
  }

  const manifestResponse = await fetch("/api/manifest", { cache: "no-store" });
  manifest = await manifestResponse.json();
  steps = manifest.steps;
  indexById = new Map(steps.map((step, i) => [step.id, i]));

  await fm()?.init({
    endpoint: "",
    manifest,
    app: "fakesaaspi",
    writeKey,
  });
  fm()?.onMeta((meta) => {
    lastMeta = meta;
    if (meta && meta.portalState === "release" && portalState !== "release") {
      portalState = "release";
      showRelease();
    } else if (meta && meta.portalState === "trap" && portalState === "release") {
      portalState = "trap";
      render();
    }
  });

  window.addEventListener("popstate", onPopState);

  const initial =
    history.state && typeof history.state.stepId === "string"
      ? history.state.stepId
      : "welcome";
  stepIndex = indexById.get(initial) ?? 0;
  history.replaceState({ stepId: steps[stepIndex].id }, "", `#${steps[stepIndex].id}`);
  nav = "forward";
  fromStep = undefined;
  flowStartedAt = Date.now();
  render();
}

boot();
