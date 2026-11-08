const form = document.getElementById("f");
const input = document.getElementById("a");
const button = document.getElementById("b");
const err = document.getElementById("e");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.textContent = "";
  button.disabled = true;
  button.textContent = "Connecting…";
  try {
    const res = await window.desktop.submitAddress(input.value);
    if (!res.ok) throw new Error(res.error);
  } catch (ex) {
    err.textContent = ex.message || "Couldn't connect.";
    button.disabled = false;
    button.textContent = "Continue";
  }
});
