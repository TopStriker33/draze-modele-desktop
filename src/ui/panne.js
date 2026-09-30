// Une coupure réseau ne doit pas laisser la model injoignable jusqu'à ce
// qu'elle pense à cliquer : on retente seul, régulièrement. Le clic reste là
// pour qui ne veut pas attendre.
const REPRISE_MS = 20000;

document.getElementById("reessayer").addEventListener("click", () => window.draze.reessayer());
setInterval(() => window.draze.reessayer(), REPRISE_MS);
