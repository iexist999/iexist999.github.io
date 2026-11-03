const FADE_MS = 300; // must match --fade-ms in style.css

const tabs   = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

let current = "home";
let token = 0; // lets rapid clicks cancel older switches

function switchTo(name) {
  if (name === current) return;
  current = name;
  const myToken = ++token;

  // highlight the selected button
  tabs.forEach(tab => {
    const isActive = tab.dataset.tab === name;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive);
  });

  // fade out whatever is showing
  panels.forEach(panel => panel.classList.remove("visible"));

  // once faded out, swap panels and fade the new one in
  setTimeout(() => {
    if (myToken !== token) return; // a newer click took over

    panels.forEach(panel => { panel.hidden = panel.id !== name; });

    const incoming = document.getElementById(name);
    void incoming.offsetWidth; // restart the transition
    incoming.classList.add("visible");
  }, FADE_MS);
}

tabs.forEach(tab => {
  tab.addEventListener("click", () => switchTo(tab.dataset.tab));
});
