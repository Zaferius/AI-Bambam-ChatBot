// Saat fonksiyonu
function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? String(hours).padStart(2, '0') : '12'; // Saat 0'ı 12 olarak göster

    document.getElementById('clock').textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
}

// Saatin her saniye güncellenmesi
setInterval(updateClock, 1000);
updateClock(); // Sayfa yüklendiğinde saat gösterimini başlat

// Tema değiştirici fonksiyonu
const changeThemeButton = document.getElementById('changeTheme');
let isDarkTheme = true;

changeThemeButton.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    isDarkTheme = !isDarkTheme;
    changeThemeButton.textContent = isDarkTheme ? 'Tema Değiştir' : 'Karanlık Temaya Geç';
});