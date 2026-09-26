const menuButton = document.querySelector(".menu-button");
const navigation = document.querySelector("nav");

function closeMenu() {
  menuButton.classList.remove("open");
  navigation.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "メニューを開く");
}

menuButton.addEventListener("click", () => {
  const isOpen = menuButton.classList.toggle("open");
  navigation.classList.toggle("open", isOpen);
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "メニューを閉じる" : "メニューを開く");
});

navigation.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
