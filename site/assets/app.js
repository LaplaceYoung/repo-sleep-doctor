const pathName = window.location.pathname.toLowerCase();

for (const link of document.querySelectorAll(".nav-link")) {
  const href = (link.getAttribute("href") || "").toLowerCase();
  if (href && (pathName.endsWith(href) || (href.endsWith("index.html") && pathName.endsWith("/")))) {
    link.classList.add("active");
  }
}

const revealNodes = Array.from(document.querySelectorAll("[data-reveal]"));
if (revealNodes.length > 0) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        const delay = Number(entry.target.getAttribute("data-delay") || 0);
        window.setTimeout(() => {
          entry.target.classList.add("revealed");
        }, delay);
        revealObserver.unobserve(entry.target);
      }
    },
    { threshold: 0.2, rootMargin: "0px 0px -24px 0px" }
  );
  for (const node of revealNodes) {
    revealObserver.observe(node);
  }
}

const counterNodes = Array.from(document.querySelectorAll("[data-count-to]"));
if (counterNodes.length > 0) {
  const counterObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        const node = entry.target;
        const target = Number(node.getAttribute("data-count-to"));
        const prefix = node.getAttribute("data-prefix") || "";
        const suffix = node.getAttribute("data-suffix") || "";
        const duration = Number(node.getAttribute("data-duration") || 1000);
        const started = performance.now();

        const tick = (now) => {
          const progress = Math.min((now - started) / duration, 1);
          const current = Math.round(target * progress);
          node.textContent = `${prefix}${current}${suffix}`;
          if (progress < 1) {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
        counterObserver.unobserve(node);
      }
    },
    { threshold: 0.45 }
  );

  for (const node of counterNodes) {
    counterObserver.observe(node);
  }
}

const year = document.querySelector("[data-year]");
if (year) {
  year.textContent = String(new Date().getFullYear());
}
