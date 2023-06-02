"use strict";

/**
 * General utility functions.
 */
class Utils {
  static CurrencyFormatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  });

  /**
   * Wait for an element to appear on the page.
   *
   * @param {string} selector The CSS selector for the element to wait for.
   * @param {number} timeout The maximum amount of time to wait for the element to appear. If not specified, then wait forever.
   *
   * @returns A promise that resolves to the element or a timeout error.
   */
  static async waitForElement(selector, timeout) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timer = setInterval(() => {
        const element = document.querySelector(selector);
        if (element) {
          clearInterval(timer);
          resolve(element);
        } else if (timeout === undefined) {
          // Keep trying forever
        } else if (Date.now() - startTime > timeout) {
          clearInterval(timer);
          reject(new Error("Timeout"));
        }
      }, 100);
    });
  }

  /**
   * Add a listener for when the URL changes.
   *
   * @param {function} callback The function to call when the URL changes.
   * @returns The MutationObserver that was created.
   */
  static urlWatcher(callback) {
    let previousUrl = "";
    const observer = new MutationObserver((_mutations) => {
      if (window.location.href !== previousUrl) {
        let cachedPreviousUrl = previousUrl;
        previousUrl = window.location.href;
        callback(window.location.href, cachedPreviousUrl);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }

  /**
   * Watches elements selected by the given selector for the specified events.
   * When detected, the callback function is called with the element and the event type.
   *
   * @param {string} selector The CSS selector for the element to watch.
   * @param {string[]} events The events to watch for: "init", "added", "removed", "modified".
   * @param {function} callback The function to call when the element is modified.
   * @returns MutationObserver
   */
  static elementWatcher(selector, events, callback) {
    // "modified" events happen any time an element or its subtree is modified (including attributes or text).
    const addModifiedObserver = (elem) => {
      const observer = new MutationObserver((_mutations) => {
        callback(elem, "modified");
      });
      observer.observe(elem, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
    };

    // "init" events occur if the element already exists on the page.
    document.body.querySelectorAll(selector).forEach((node) => {
      if (events.includes("init")) {
        callback(node, "init");
      }
      if (events.includes("modified")) {
        addModifiedObserver(node);
      }
    });

    // "added" events occur when the element is added to the DOM.
    // This should track any future additions
    const observer = new MutationObserver((mutations) => {
      mutations
        .filter((mutation) => mutation.type == "childList")
        .forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            const walker = document.createTreeWalker(
              node,
              NodeFilter.SHOW_ELEMENT
            );
            while (walker.nextNode()) {
              if (
                walker.currentNode.matches &&
                walker.currentNode.matches(selector)
              ) {
                if (events.includes("added")) {
                  callback(node, "added");
                }
                if (events.includes("modified")) {
                  addModifiedObserver(node);
                }
              }
            }
          });
        });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // "removed" events occur when the element is removed from the DOM.
    // This should track removals even if the element doesn't exist yet.
    if (events.includes("removed")) {
      const observer = new MutationObserver((mutations) => {
        mutations
          .filter((mutation) => mutation.type == "childList")
          .forEach((mutation) => {
            mutation.removedNodes
              .filter((node) => node.matches && node.matches(selector))
              .forEach((node) => callback(node, "removed"));
          });
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  static formatCurrencyValue(value) {
    return Utils.CurrencyFormatter.format(value);
  }

  static debounce(func, wait = 500) {
    let timeout;
    return function (...args) {
      const later = () => {
        timeout = null;
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Trigger on first and ignore rest until timeout.
   */
  static debounceLeading(func, timeout = 500) {
    let timer;
    return (...args) => {
      if (!timer) {
        func.apply(this, args);
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
      }, timeout);
    };
  }
}

class CheckBoxComponent {
  constructor(parent, defaultState, labelText, changedCallback) {
    this.parent = parent;
    this.isChecked = defaultState || false;
    this.labelText = labelText;
    this.changedCallback = changedCallback;
    this.rendered = null;
    this.#display();
  }

  setLabel(labelText) {
    this.labelText = labelText;
    this.#display();
  }

  remove() {
    this.rendered?.remove();
  }

  #display() {
    const rendered = this.#render();
    if (this.rendered) {
      this.rendered.replaceWith(rendered);
    } else {
      // TODO: allow appending instead
      this.parent.prepend(rendered);
    }
    this.rendered = rendered;
  }

  #render() {
    // Create a div with a checkbox and a label
    const div = document.createElement("div");
    div.setAttribute(
      "style",
      "padding: 0.5em; margin: 0 0.5em; border: 1px solid black; background-color: #eee; display: flex; align-items: center; justify-content: center; height: 30px; white-space: nowrap;"
    );
    const lbl = document.createElement("label");
    lbl.innerText = this.labelText;
    const chk = document.createElement("input");
    chk.setAttribute("type", "checkbox");
    chk.setAttribute("style", "margin-right: 0.5em;");
    if (this.isChecked) {
      chk.setAttribute("checked", "checked");
    }
    chk.addEventListener("change", this.#checkboxChanged.bind(this));
    div.appendChild(chk);
    div.appendChild(lbl);
    return div;
  }

  #checkboxChanged(event) {
    this.isChecked = event.target.checked;
    if (this.changedCallback != null) {
      this.changedCallback(this.isChecked);
    }
  }
}

/**
 * A component for filtering the items by remaining budget.
 */
class FilterByBudgetComponent {
  constructor(defaultState) {
    this.enabled = defaultState;
    this.ui = null;
    this.budget = null;

    console.log("init FilterByBudgetComponent");

    // When the URL changes
    Utils.urlWatcher((_url) => this.#applyFilter);

    // Add the filter to the page whenever the menu is created or modified
    Utils.elementWatcher(
      ".menu-user-preferences-tags",
      ["init", "added"],
      (elem, _modification) => {
        this.ui?.remove();
        this.ui = new CheckBoxComponent(
          elem,
          this.enabled,
          this.#labelText(),
          (isChecked) => {
            this.enabled = isChecked;
            this.#applyFilter();
          }
        );
      }
    );

    // Filter menu product box anytime it changes
    Utils.elementWatcher(
      "#menu-products-box > div.common-root > div.product-content-wrapper > div:nth-child(2)",
      // "#menu-products-box",
      ["init", "added", "modified"],
      Utils.debounceLeading((_elem, _modification) => this.#applyFilter)
    );

    // Update filter when the cart is updated
    Utils.elementWatcher(
      SalTalk.Cart.selector,
      ["init", "added", "modified"],
      Utils.debounceLeading((_elem, _modification) => {
        console.log("cart updated");
        this.#applyFilter();
      })
    );
  }

  #labelText() {
    return (
      "Filter by budget" +
      (this.budget != null
        ? ` (${Utils.formatCurrencyValue(this.budget)} available)`
        : "")
    );
  }

  #applyFilter() {
    console.log("Applying filter");
    let cartData = SalTalk.Cart.getData();
    console.log("cartData", cartData);
    let parsedURL = SalTalk.parseUrl(window.location.href);
    const month = parsedURL.params["month"];
    const date = parsedURL.params["date"];
    const meal = parsedURL.params["meal"];
    const id = `${month}-${date}-${meal}`;
    this.budget = this.enabled ? cartData[id]?.remainingBudget : null;
    this.ui?.setLabel(this.#labelText());
    SalTalk.filterByPrice(this.budget);
  }
}

/**
 * A component for filtering items by ones that have been purchased before.
 */
class FilterByPreviousPurchasesComponent {}

class SalTalk {
  /**
   * Parse a URL to determine the page and parsed parameters.
   *
   * @param {string} url The URL to parse. If not specified, then the current URL is used.
   * @returns
   */
  static parseUrl(url) {
    const urlObj = new URL(url || window.location.href);
    const searchParams = urlObj.searchParams;
    const page = urlObj.pathname;
    const params = {};
    if (page === "/") {
      const date = searchParams.get("date");
      const meal = searchParams.get("shippingTime");
      if (date && meal) {
        params["year"] = parseInt(date.split("-")[0]);
        params["month"] = parseInt(date.split("-")[1]);
        params["date"] = parseInt(date.split("-")[2]);
        params["meal"] = meal;
      }
    }
    return {
      page: page,
      params: params,
    };
  }

  /**
   * Filter visible items by price.
   *
   * @param {number} maxPrice The maximum price to show. If null, then all items are shown.
   */
  static filterByPrice(maxPrice) {
    document.querySelectorAll("app-product-item").forEach((elem) => {
      const priceElem = elem.querySelector(".product-price");
      if (priceElem === null) {
        return;
      }
      const price = parseFloat(priceElem.innerText.replace("$", ""));
      if (maxPrice === null || maxPrice === undefined || price <= maxPrice) {
        elem.style.display = "inline-block";
      } else {
        elem.style.display = "none";
      }
    });

    // TODO: Hide categories with no visible products.
    //
    document.querySelectorAll(".product-container").forEach((elem) => {
      const visibleProducts = Array.from(
        elem.querySelectorAll("app-product-item")
      ).filter((elem) => elem.style.display != "none").length;
      if (visibleProducts === 0) {
        elem.style.display = "none";
      } else {
        elem.style.display = "block";
      }
    });
  }

  static async fetchMyOrders() {
    const url =
      "https://www.saltalk.com/api/orders/my?client=web&pageIndex=0&pageSize=10&orderBy=id&desc=true&status=Paid%2CPartialRefunded%2CPlanned%2CUnpaid%2CRefunded%2CCancelled%2COnHold";
    const resp = (
      await fetch(url, {
        headers: { Accept: "application/json" },
        credentials: "include",
        mode: "cors",
      })
    ).json();
    return resp;
  }

  /**
   * Functions for interacting with the cart.
   */
  static Cart = class {
    static selector = ".cart-items-box";

    /**
     * Get the cart data: items for each date-meal, remaining budget for each date-meal.
     *
     * @returns An object with the following structure:
     */
    static getData() {
      const cartData = {};
      document.querySelectorAll(this.selector).forEach((cartItemElem) => {
        const dateId = cartItemElem
          .querySelector(".cart-item-shipping-date")
          .textContent.trim();
        // dateId is in the form "<Day of week> <Month>/<Day> <Meal>"
        // e.g. "Mon 5/3 Dinner" or "Tue 5/16 Lunch"
        const datePart = dateId.split(" ")[1].trim();
        const month = parseInt(datePart.split("/")[0]);
        const day = parseInt(datePart.split("/")[1]);
        const meal = dateId.split(" ")[2];

        const remainingBudgetElem = cartItemElem.querySelector(
          ".remaining-budget .budget-price"
        );
        const remainingBudget = parseFloat(
          remainingBudgetElem.innerText.replace("$", "")
        );

        const items = [];
        cartItemElem
          .querySelectorAll(".cart-sub-item")
          .forEach((cartSubItemElem) => {
            const itemName = cartSubItemElem
              .querySelector(".product-title")
              .innerText.trim();
            const totalPrice = parseFloat(
              cartSubItemElem
                .querySelector(".product-price")
                .innerText.trim()
                .replace("$", "")
            );
            const itemQuantity = parseInt(
              cartSubItemElem.querySelector(".product-count-new input").value
            );
            const item = {
              name: itemName,
              itemPrice: totalPrice / itemQuantity,
              quantity: itemQuantity,
              totalPrice: totalPrice,
            };
            items.push(item);
          });
        const itemsPriceTotal = items.reduce((total, item) => {
          return total + item.totalPrice;
        }, 0);
        const id = `${month}-${day}-${meal}`;
        cartData[id] = {
          items: items,
          itemsPriceTotal: itemsPriceTotal,
          remainingBudget: remainingBudget,
        };
      });
      return cartData;
    }
  };
}

const main = () => {
  console.log("Salty Jabber started loading");

  const feature = new FilterByBudgetComponent(true);

  // Useful for debugging
  window["saltyjabber"] = {
    feature: feature,
    SalTalk: SalTalk,
  };
  console.log("Salty Jabber finished loading");
};

try {
  main();
} catch (e) {
  console.error(e);
}
