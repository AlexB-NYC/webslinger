// /lib/js/events.js
export default class Events {
  constructor(namespace = "") {
    this.ns = namespace ? String(namespace) : "";
    this._map = new Map();   // event -> Set<fn>
    this._emitted_once = new Set();
  }

  _key(ev) {
    return this.ns ? `${this.ns}:${ev}` : ev;
  }

  on(event, fn, opts = {}) {
    if (typeof fn !== "function") throw new TypeError("Listener must be a function");
    const key = this._key(event);
    let set = this._map.get(key);
    if (!set) this._map.set(key, (set = new Set()));
    set.add(fn);

    // Optional AbortSignal support
    if (opts.signal instanceof AbortSignal) {
      if (opts.signal.aborted) {
        set.delete(fn);
      } else {
        const abortHandler = () => {
          this.off(event, fn);
          opts.signal.removeEventListener("abort", abortHandler);
        };
        opts.signal.addEventListener("abort", abortHandler, { once: true });
      }
    }
    return () => this.off(event, fn); // unsubscribe function
  }

  once(event, fn) {
    const off = this.on(event, (...args) => {
      try { fn(...args); } finally { off(); }
    });
    return off;
  }

  off(event, fn) {
    const key = this._key(event);
    const set = this._map.get(key);
    if (!set) return false;
    const had = set.delete(fn);
    if (set.size === 0) this._map.delete(key);
    return had;
  }

  clear(event) {
    if (!event) { this._map.clear(); return; }
    const key = this._key(event);
    this._map.delete(key);
  }

  emit_once(event, ...args) {
    const key = this._key(event);
    if (this._emitted_once.has(key)) return false;

    this._emitted_once.add(key);
    return this.emit(event, ...args);
  }

  emit(event, ...args) {
    // console.log({event});
    let ok = false;
    const key = this._key(event);

    const call = (k) => {
      const set = this._map.get(k);
      if (!set || set.size === 0) return false;
      [...set].forEach(fn => {
        try { fn(...args); }
        catch (e) { console.error("Events listener error", { event: k, e }); }
      });
      return true;
    };
    console.log({key,call});

    // internal listeners
    ok = call(key) || ok;

    // wildcard listeners
    ok = call(this._key("*")) || ok;

    // 🔑 DOM event bridge
    try {
      window.dispatchEvent(
        new CustomEvent(key, {
          detail: args.length <= 1 ? args[0] : args
        })
      );
    } catch (e) {
      console.error("Events DOM dispatch error", { event: key, e });
    }

    return ok;
  }


  async emitAsync(event, ...args) {
    const key = this._key(event);
    const set = this._map.get(key);
    if (!set || set.size === 0) return false;
    await Promise.all([...set].map(async fn => {
      try { return await fn(...args); }
      catch (e) { console.error("Events async listener error", { event: key, e }); }
    }));
    return true;
  }

  waitFor(event, { timeout = 0, predicate = null, signal = null } = {}) {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const compositeAbort = (reason) => {
        controller.abort();
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      };

      if (signal instanceof AbortSignal) {
        if (signal.aborted) return compositeAbort("aborted");
        signal.addEventListener("abort", () => compositeAbort("aborted"), { once: true });
      }

      let timer = null;
      if (timeout > 0) {
        timer = setTimeout(() => compositeAbort(new Error("waitFor timeout")), timeout);
      }

      const off = this.on(event, (...args) => {
        try {
          if (predicate && !predicate(...args)) return;
          if (timer) clearTimeout(timer);
          off();
          resolve(args.length <= 1 ? args[0] : args);
        } catch (e) {
          if (timer) clearTimeout(timer);
          off();
          reject(e);
        }
      }, { signal: controller.signal });
    });
  }

  // create a namespaced child emitter that prefixes events
  child(ns) { return new Events(this._key(ns)); }
}
