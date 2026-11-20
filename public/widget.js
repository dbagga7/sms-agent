/* LeadBooker chat widget. Embed with:
   <script src="https://YOUR-APP/widget.js" data-key="WIDGET_KEY" async></script> */
(function () {
  var script = document.currentScript;
  if (!script || window.__leadbookerLoaded) return;
  window.__leadbookerLoaded = true;
  var key = script.getAttribute("data-key");
  var base = new URL(script.src).origin;
  if (!key) return;

  var sid;
  try {
    sid = localStorage.getItem("lb_sid_" + key);
    if (!sid) {
      sid = Array.from(crypto.getRandomValues(new Uint8Array(16)), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
      localStorage.setItem("lb_sid_" + key, sid);
    }
  } catch (e) {
    sid = String(Date.now()) + Math.random().toString(16).slice(2).padEnd(16, "0");
  }

  fetch(base + "/api/widget/config?key=" + encodeURIComponent(key))
    .then(function (r) { return r.json(); })
    .then(function (cfg) { if (cfg.ok) mount(cfg); })
    .catch(function () {});

  function mount(cfg) {
    var host = document.createElement("div");
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: "open" });
    var style = document.createElement("style");
    style.textContent =
      ":host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
      ".btn{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;color:#fff;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:2147483000;font-size:24px;line-height:1}" +
      ".panel{position:fixed;right:20px;bottom:88px;width:360px;max-width:calc(100vw - 24px);height:500px;max-height:calc(100vh - 110px);" +
      "background:#fff;color:#111;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.28);display:none;flex-direction:column;overflow:hidden;z-index:2147483000}" +
      ".panel.open{display:flex}.head{padding:14px 16px;color:#fff;font-weight:600;font-size:15px}" +
      ".log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f6f7f9}" +
      ".m{max-width:82%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}" +
      ".a{background:#fff;border:1px solid #e3e5e8;align-self:flex-start}.u{color:#fff;align-self:flex-end}" +
      "form{display:flex;gap:8px;padding:10px;border-top:1px solid #e3e5e8;background:#fff}" +
      "input{flex:1;min-width:0;padding:10px 12px;border:1px solid #cfd3d8;border-radius:10px;font-size:16px;color:#111;background:#fff}" +
      "form button{border:0;border-radius:10px;padding:0 14px;color:#fff;font-weight:600;cursor:pointer;font-size:14px}" +
      "form button:disabled{opacity:.5}";
    root.appendChild(style);

    var panel = el("div", "panel");
    var head = el("div", "head", cfg.name);
    head.style.background = cfg.color;
    var log = el("div", "log");
    var form = document.createElement("form");
    var input = document.createElement("input");
    input.placeholder = "Type a message…";
    input.setAttribute("aria-label", "Message");
    input.maxLength = 1000;
    var send = el("button", "", "Send");
    send.type = "submit";
    send.style.background = cfg.color;
    form.appendChild(input);
    form.appendChild(send);
    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(form);

    var btn = el("button", "btn", "💬");
    btn.setAttribute("aria-label", "Chat with " + cfg.name);
    btn.style.background = cfg.color;
    btn.onclick = function () {
      panel.classList.toggle("open");
      if (panel.classList.contains("open")) input.focus();
    };
    root.appendChild(panel);
    root.appendChild(btn);
    add("a", cfg.greeting);

    form.onsubmit = function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text || send.disabled) return;
      input.value = "";
      add("u", text);
      var typing = add("a", "…");
      send.disabled = true;
      fetch(base + "/api/widget/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key, sessionId: sid, message: text }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) { typing.textContent = d.reply || "Sorry, something went wrong. Please try again."; })
        .catch(function () { typing.textContent = "Sorry, something went wrong. Please try again."; })
        .then(function () { send.disabled = false; log.scrollTop = log.scrollHeight; });
    };

    function add(kind, text) {
      var n = el("div", "m " + kind, text);
      if (kind === "u") n.style.background = cfg.color;
      log.appendChild(n);
      log.scrollTop = log.scrollHeight;
      return n;
    }
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
})();
