/* Netlify Forms, submitted in place.
   Any <form data-netlify="true"> on the page posts to Netlify without a
   page reload and swaps in a confirmation. Without JavaScript the form
   still posts normally and Netlify shows its default success page.
   To wire another form: add name, method="POST", data-netlify="true",
   netlify-honeypot="bot-field", a hidden form-name input, the honeypot,
   name attributes on every field, and load this script. */
(function () {
  "use strict";

  function encode(form) {
    return new URLSearchParams(new FormData(form)).toString();
  }

  function setStatus(form, kind, html) {
    var box = form.querySelector(".form-status");
    if (!box) {
      box = document.createElement("div");
      box.className = "form-status";
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      form.appendChild(box);
    }
    box.className = "form-status is-" + kind;
    box.innerHTML = html;
    return box;
  }

  function wire(form) {
    var button = form.querySelector('button[type="submit"]');
    var label = button ? button.textContent : "";

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;

      if (button) { button.disabled = true; button.textContent = "Sending…"; }

      fetch(form.getAttribute("action") || "/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encode(form)
      })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          var done = document.createElement("div");
          done.className = "form-done";
          done.setAttribute("role", "status");
          done.setAttribute("tabindex", "-1");
          done.innerHTML =
            '<p class="form-done-title">' + (form.dataset.successTitle || "Thank you. Message received.") + "</p>" +
            '<p class="form-done-text">' + (form.dataset.successText || "We’ll be in touch within one business day.") + "</p>";
          form.replaceWith(done);
          done.focus();
        })
        .catch(function () {
          if (button) { button.disabled = false; button.textContent = label; }
          var mail = form.dataset.fallbackEmail || "hello@vivander.com";
          setStatus(form, "error",
            "That didn’t go through. Please try again, or email " +
            '<a href="mailto:' + mail + '">' + mail + "</a>.");
        });
    });
  }

  function init() {
    var forms = document.querySelectorAll('form[data-netlify="true"]');
    for (var i = 0; i < forms.length; i++) wire(forms[i]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
