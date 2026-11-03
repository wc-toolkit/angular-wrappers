/**
 * A demo button used to exercise the generated Angular wrappers.
 *
 * @slot - The button label.
 * @fires {CustomEvent<{count: number}>} my-click - Fires when the button is clicked.
 * @fires {Event} change - Fires when the value changes.
 */
export class MyButton extends HTMLElement {
  static get observedAttributes() {
    return ["variant", "disabled"];
  }

  #clicks = 0;
  #button;

  constructor() {
    super();
    const markup = `
      <style>
        button { font: inherit; padding: 0.5rem 1rem; border: 0; border-radius: 6px; cursor: pointer; color: #fff; background: #1d4ed8; }
        :host([variant="secondary"]) button { background: #475569; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
      </style>
      <button part="button"><slot></slot></button>
    `;
    const shadow = this.attachShadow({ mode: "open" });
    shadow.append(document.createRange().createContextualFragment(markup));
    this.#button = shadow.querySelector("button");
    this.#button.addEventListener("click", () => {
      this.#clicks += 1;
      this.value = `clicked ${this.#clicks} time(s)`;
      this.dispatchEvent(
        new CustomEvent("my-click", {
          bubbles: true,
          composed: true,
          detail: { count: this.#clicks },
        }),
      );
      this.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  connectedCallback() {
    this.#button.disabled = this.disabled;
  }

  attributeChangedCallback(name) {
    if (name === "disabled") {
      this.#button.disabled = this.disabled;
    }
  }

  /**
   * The visual variant.
   * @type {"primary" | "secondary"}
   * @attr
   */
  get variant() {
    return this.getAttribute("variant") ?? "primary";
  }

  set variant(value) {
    this.setAttribute("variant", value);
  }

  /**
   * Disables the button.
   * @type {boolean}
   * @attr
   */
  get disabled() {
    return this.hasAttribute("disabled");
  }

  set disabled(value) {
    this.toggleAttribute("disabled", Boolean(value));
  }

  /**
   * The most recent status text.
   * @type {string}
   */
  value = "";
}

customElements.define("my-button", MyButton);
